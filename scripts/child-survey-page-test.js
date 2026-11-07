/**
 * /survey for a child whose parent has not allowed outside AI: the server refuses every typed answer (routes/consent.js, parent_opt_in_required), so the page
 * must not offer the boxes. It says what they can do. Everyone else gets the page as before. The refusal itself is pinned in scripts/consent-test.js and is not
 * changed by this; this test also checks that the page never calls the save route for a limited child.
 *
 * Runs public/js/survey.js in a small stand-in page. What it looks like in a browser is not checked here.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'survey.js'), 'utf8');
let passed = 0;
const ok = (name) => { passed += 1; console.log(`ok   ${name}`); };

async function page(consent, { next = null } = {}) {
  const posts = [];
  const root = { innerHTML: '', querySelectorAll: () => [] };
  const elements = { root, save: { addEventListener() {}, disabled: false }, status: { textContent: '' } };
  let mounted = null;
  const App = {
    mount: (fn) => { mounted = fn; },
    currentUser: async () => ({ id: 1, display_name: 'Sim', consent }),
    header() {},
    query: (k) => (k === 'next' ? next : null),
    escapeHtml: (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    toast() {},
    api: {
      get: async () => ({ survey: { interests: '' }, survey_fields: { interests: { label: 'Interests', hint: '', placeholder: '', max: 500 } } }),
      post: async (url, body) => { posts.push({ url, body }); return {}; },
    },
  };
  const ctx = vm.createContext({ App, ObSteps: { total: () => 4, html: () => '' }, document: { getElementById: (id) => elements[id] || null, body: { classList: { add() {} } } }, window: { location: {} }, encodeURIComponent });
  vm.runInContext(src, ctx);
  await mounted();
  return { html: root.innerHTML, posts };
}

(async () => {
  for (const state of ['pending', 'active']) {
    const { html, posts } = await page({ state, ai_free_text: false, camera_mic: false, locked: false });
    assert.ok(!/<textarea/i.test(html), `${state}: no text boxes`);
    assert.ok(!/id="save"/.test(html), `${state}: no Save button`);
    assert.ok(/parent or guardian/.test(html) && /parent page/.test(html), `${state}: says who can turn it on, and where`);
    assert.ok(/taps and buttons/.test(html), `${state}: says what still works`);
    assert.ok(/href="\/style-quiz\?next=%2Fprofile"/.test(html), `${state}: offers what they can do, the style questions`);
    assert.ok(/href="\/profile"/.test(html), `${state}: and a way on`);
    assert.strictEqual(posts.length, 0, `${state}: nothing is sent`);
  }
  ok('a child without the opt-in: no boxes, no Save; who can allow it, what still works, a way on; nothing sent');

  const onward = await page({ state: 'active', ai_free_text: false }, { next: '/onboarding' });
  assert.ok(/href="\/onboarding"/.test(onward.html) && /style-quiz\?next=%2Fonboarding/.test(onward.html));
  ok('it follows ?next= like the ordinary page');

  const evil = await page({ state: 'active', ai_free_text: false }, { next: '/"><img src=x>' });
  assert.ok(!/<img/.test(evil.html), 'a crafted next stays text');
  ok('a crafted ?next= stays text');

  const cases = [
    ['a child whose parent allowed it', { state: 'active', ai_free_text: true }],
    ['an adult', { state: 'full', ai_free_text: true }],
    ['an account not sent through this limit (guest)', { state: 'guest', ai_free_text: false }],
    ['an account with no age yet', { state: 'needs_age', ai_free_text: false }],
    ['no consent block at all', undefined],
  ];
  for (const [label, consent] of cases) {
    const { html } = await page(consent);
    assert.ok(/<textarea/i.test(html) && /id="save"/.test(html), `${label}: the ordinary page`);
  }
  ok('everyone else keeps the ordinary page: boxes and Save');

  console.log(`\n${passed} passed.`);
})().catch((err) => { console.error(err); process.exit(1); });
