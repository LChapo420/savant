/**
 * The retention-goal control on the uploaded-material page (public/js/retention-goal.js `one`, public/js/my-material.js,
 * public/my-material.html): the page loads the script, gives each material a slot, and the control reads the course's goal
 * from GET /api/retention-goals and saves it with PUT { kind: 'material', id, ... }. Run in a stub DOM; no server, no keys.
 *
 *   node scripts/material-retention-goal-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures += 1;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` - ${JSON.stringify(detail).slice(0, 300)}`}`);
}
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const html = read('public/my-material.html');
check('page loads retention-goal.js before my-material.js', html.indexOf('/js/retention-goal.js') > 0 && html.indexOf('/js/retention-goal.js') < html.indexOf('/js/my-material.js'));
const page = read('public/js/my-material.js');
check('each material row has a slot', page.includes('id="rg-host-${m.id}"'));
check('the page calls RetentionGoal.one for each material', /RetentionGoal\.one\(/.test(page));

function makeNode() {
  const n = { innerHTML: '', textContent: '', dataset: {}, style: {}, listeners: {}, children: {}, value: '' };
  n.addEventListener = (ev, fn) => { n.listeners[ev] = fn; };
  n.remove = () => {};
  n.querySelector = () => null;
  n.querySelectorAll = () => [];
  return n;
}

(async () => {
  const puts = [];
  const state = {
    today: '2026-11-04', max_ahead: 1095,
    choices: [{ id: 'date', label: 'A test on a date' }, { id: 'forever', label: 'Forever' }],
    enrollments: [{ kind: 'enrollment', id: 1, title: 'Maths', summary: 'x', goal: { status: 'forever' }, stored: null }],
    materials: [{ kind: 'material', id: 7, title: 'Biology notes', summary: 'Every review stays.', goal: { status: 'forever' }, stored: null, default_shown: true }],
  };
  const host = makeNode();
  // Wire what the control looks up inside its host: one row with a select, date, save button and message span.
  const sel = makeNode(); sel.value = 'forever'; const dt = makeNode(); const save = makeNode(); const msg = makeNode(); const sum = makeNode();
  const rowNode = makeNode(); rowNode.dataset = { kind: 'material', id: '7' };
  rowNode.querySelector = (q) => ({ '.rg-h': sel, '.rg-d': dt, '.rg-save': save, '.rg-msg': msg, '[id$="-sum"]': sum })[q] || null;
  host.querySelectorAll = (q) => (q === '.rg-item' ? [rowNode] : []);
  const win = {
    App: {
      escapeHtml: (t) => String(t),
      api: {
        get: async () => state,
        request: async (m, u, b) => { puts.push({ m, u, b }); return { ok: true, item: { summary: 'Saved summary' } }; },
      },
    },
  };
  win.window = win;
  vm.runInNewContext(read('public/js/retention-goal.js'), win);
  check('RetentionGoal exposes one()', typeof win.RetentionGoal.one === 'function');

  await win.RetentionGoal.one(host, 7);
  check('renders the course title', host.innerHTML.includes('Biology notes'));
  check('says what the choice changes', /drops the reviews you do not need/.test(host.innerHTML));
  check('does not show other subjects', !host.innerHTML.includes('Maths'));

  const empty = makeNode();
  await win.RetentionGoal.one(empty, 999);
  check('unknown course renders nothing', empty.innerHTML === '');

  sel.value = 'forever';
  await save.listeners.click();
  check('Save sends PUT kind material with the course id', puts.length === 1 && puts[0].m === 'PUT' && puts[0].u === '/api/retention-goals' && puts[0].b.kind === 'material' && puts[0].b.id === 7 && puts[0].b.horizon === 'forever', puts);
  check('summary updates after saving', sum.textContent === 'Saved summary' && msg.textContent === 'Saved.', { sum: sum.textContent, msg: msg.textContent });

  console.log(failures ? `\n${failures} failed` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
