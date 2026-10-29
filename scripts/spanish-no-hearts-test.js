// The Spanish path has no lives: no heart counter, no "out of hearts" screen, and a wrong answer
// still comes back at the end of the session. Static checks on public/spanish plus a run of the session loop.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) failed++; };

const root = path.join(__dirname, '..', 'public', 'spanish');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(root);
const hits = files.filter((f) => !/icons\.js$/.test(f) && /heart|outOfHearts|loseHeart/i.test(fs.readFileSync(f, 'utf8')));
ok(hits.length === 0, `no heart code or UI in public/spanish${hits.length ? ': ' + hits.map((h) => path.relative(root, h)).join(', ') : ''}`);

const src = fs.readFileSync(path.join(root, 'js', 'core', 'session.js'), 'utf8');
const played = [];
const answered = [];
const ES = {
  speakingOff: () => false, listeningOff: () => false,
  h: () => ({}), $: () => ({ style: {} }),
  api: { post: async (_u, body) => ({ correct: body.itemId !== 'a' || answered.filter((x) => x === 'a').length > 1, solution: 'x' }) },
  ex: {
    mc: (item, ctx) => ({
      header: 'h', el: {}, ready: () => true, response: () => { answered.push(item.id); return {}; },
    }),
  },
  ui: {
    header: () => ({}), onKeys() {}, interstitial: async () => {},
  },
  sfx: { play: (n) => played.push(n) },
};
const win = { ES, addEventListener() {}, scrollTo() {} };
vm.runInNewContext(src, { window: win, ES, document: {}, console, setTimeout, Date, Math });
(async () => {
  const run = (win.ES || ES).session.run;
  ok(typeof run === 'function', 'session.run loads');
  const frame = {
    progress() {}, setBody() {}, hearts() { ok(false, 'frame.hearts must not be called'); },
    footer: {
      ready() {}, idle(o) { setImmediate(() => o.onCheck()); }, busy() {}, hide() {},
      result(o) { setImmediate(o.onContinue); }, continueOnly(o) { setImmediate(o.onClick); },
    },
    root: {},
  };
  const out = await run(frame, { levelId: 1, items: [{ id: 'a', kind: 'mc' }, { id: 'b', kind: 'mc' }, { id: 'c', kind: 'mc' }, { id: 'd', kind: 'mc' }, { id: 'e', kind: 'mc' }, { id: 'f', kind: 'mc' }] });
  ok(!out.quit && !('hearts' in out), 'finishes without a hearts result or quit');
  ok(answered.filter((x) => x === 'a').length === 2, 'the missed item comes back at the end');
  ok(!played.includes('heartLost'), 'no heart sound');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
