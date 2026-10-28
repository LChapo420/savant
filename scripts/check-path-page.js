/**
 * The path page, as a person sees it, in a real browser.
 *
 * `npm test` and `npm run smoke` both read the *data*: the layout, the route, the
 * node list. They cannot read the page, and the page is what a learner looks at.
 * That gap is where a fault survived three reports — the data was right, the route
 * was right, and the page still did not show the opening levels.
 *
 * So this drives Chrome through `agent-browser`, signs in, opens the same
 * `/path?enrollment=…` URL the dashboard's "View path" link points at, and reads
 * the rendered DOM. The answer comes from `document.querySelectorAll('.node')`, not
 * from a response body, so a page that renders nothing fails here however correct
 * the JSON is.
 *
 * Needs a running server and the browser tool:
 *
 *   npm i -g agent-browser && agent-browser install
 *   node scripts/check-path-page.js [http://localhost:6767]
 *
 * The dev password is the same one the rest of the local tooling uses. If the
 * account cannot be made, it says so and stops: an unreachable page is not
 * evidence about levels.
 */
const { execFileSync } = require('child_process');

const BASE = process.argv[2] || 'http://localhost:6767';
const SESSION = process.env.PATH_PAGE_SESSION || 'pathpage';
const PASSWORD = process.env.DEV_PASSWORD || 'landon-dev-2026';
// Which account to walk with. The curriculum page is gated to one address — a
// deliberate choice, answered by `config/capabilities` — so the second half of
// this check needs that account, and it says plainly when it cannot get in rather
// than passing on a page it never loaded.
const PATH_EMAIL = process.env.PATH_PAGE_EMAIL || `pathpage-${process.pid}@example.test`;
const CURRICULUM_EMAIL = process.env.CURRICULUM_EMAIL || 'the.landon.d@gmail.com';

/**
 * `agent-browser` installs as a `.cmd` shim on Windows, and `cmd /c` is the only
 * thing that will run one — CreateProcess cannot execute a batch file and fails
 * with EINVAL rather than anything useful. Scripts go in on stdin, because a
 * multi-line script passed as an argument through `cmd` loses its newlines and
 * arrives as a syntax error that has nothing to do with the page.
 */
function ab(args, input) {
  return execFileSync('cmd', ['/c', 'agent-browser', '--session', SESSION, ...args],
    input ? { input } : { encoding: 'utf8' });
}

function evaluate(expression) {
  const out = ab(['eval', '--stdin'], `(async () => { return (${expression}); })()`);
  try { return JSON.parse(out); } catch { return out; }
}

const say = (ok, line) => console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${line}`);

/** Is the browser tool here at all? Checked before anything else, and plainly. */
function requireBrowser() {
  try {
    execFileSync('cmd', ['/c', 'agent-browser', '--version'], { encoding: 'utf8' });
  } catch {
    console.log('agent-browser is not installed. To read the page this needs:');
    console.log('  npm i -g agent-browser');
    console.log('  agent-browser install');
    process.exit(1);
  }
}

(async () => {
  requireBrowser();
  ab(['open', BASE]);

  /** Sign in, registering first when the address is new. Prints what it got. */
  function signIn(address) {
    const reg = evaluate(`fetch('/api/auth/register', { method: 'POST',`
      + ` headers: { 'Content-Type': 'application/json' },`
      + ` body: JSON.stringify({ email: ${JSON.stringify(address)}, password: ${JSON.stringify(PASSWORD)},`
      + ` display_name: 'Page check' }) }).then(r => r.status)`);
    if (reg === 201 || reg === 200) return { ok: true, how: 'registered' };
    const login = evaluate(`fetch('/api/auth/login', { method: 'POST',`
      + ` headers: { 'Content-Type': 'application/json' },`
      + ` body: JSON.stringify({ email: ${JSON.stringify(address)}, password: ${JSON.stringify(PASSWORD)} }) })`
      + `.then(r => r.status)`);
    return { ok: login === 200, how: login === 200 ? 'signed in' : `register ${reg}, login ${login}` };
  }

  const me = signIn(PATH_EMAIL);
  if (!me.ok) {
    console.log(`could not get an account for the path page (${me.how}). If that is the`);
    console.log('10/hour registration limit, nothing below is evidence either way.');
    process.exit(1);
  }
  console.log(`path page: ${me.how} as ${PATH_EMAIL}\n`);

  const grades = evaluate(`fetch('/api/catalog').then(r => r.json())`
    + `.then(j => j.tracks.find(t => t.id === 'reading').grades.map(g => ({ id: g.id, name: g.name })))`);
  if (!Array.isArray(grades) || !grades.length) {
    console.log('the catalogue has no reading track');
    process.exit(1);
  }
  console.log(`walking ${grades.length} Reading grades, one real page each\n`);

  // One enrollment per grade, batched eight at a time because that is what the
  // route takes. Grades this account already holds are read back rather than
  // counted as failures — a duplicate is skipped, not missing.
  const ids = await evaluate(`(async () => {
    const cat = await (await fetch('/api/catalog')).json();
    const gs = cat.tracks.find(t => t.id === 'reading').grades;
    const have = new Map();
    for (let i = 0; i < gs.length; i += 8) {
      const batch = gs.slice(i, i + 8).map(g => ({ track_id: 'reading', grade_id: g.id }));
      const r = await fetch('/api/enrollments', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: batch }) });
      if (r.status !== 201) continue;
      for (const e of (await r.json()).created) have.set(e.grade.id, e.id);
    }
    const mine = await (await fetch('/api/enrollments')).json();
    for (const e of (mine.enrollments || mine || [])) {
      if (e && e.track && e.track.id === 'reading' && e.grade && !have.has(e.grade.id)) {
        have.set(e.grade.id, e.id);
      }
    }
    return Array.from(have.entries()).map(([grade_id, id]) => ({ grade_id, id }));
  })()`);

  let bad = 0;
  let noEnrollment = 0;
  for (const g of grades) {
    const e = ids.find((x) => x.grade_id === g.id);
    if (!e) { say(false, `${g.id}: no enrollment, so the page cannot be opened`); noEnrollment++; bad++; continue; }

    // A real navigation. This is a multi-page app — each route serves its own
    // scripts — so `history.pushState` leaves the previous page's script loaded
    // and this reports zero rows for every grade, which is what a client-side
    // router would do and not what this app does.
    ab(['open', `${BASE}/path?enrollment=${e.id}`]);
    ab(['wait', '--fn', 'document.querySelectorAll(".node").length > 0']);
    const rows = evaluate(`Array.from(document.querySelectorAll('.node')).slice(0, 10)`
      + `.map(n => { const t = n.querySelector('.title'); return t ? t.textContent.trim() : ''; })`);

    const list = Array.isArray(rows) ? rows : [];
    const first9 = list.slice(0, 9);
    const allThere = first9.length === 9 && first9.every((s) => /^Level [1-9]\b/.test(s));
    const allTesters = first9.every((s) => /\bTester\b/.test(s));
    const tenth = list[9] || '';
    const tenthIsLesson = /^Level 10\b.*\bLesson\b/.test(tenth);
    const ok = allThere && allTesters && tenthIsLesson;
    if (!ok) bad++;

    if (ok && !process.env.VERBOSE) {
      say(true, `${g.id.padEnd(30)} levels 1-9 are Testers, level 10 is a lesson`);
    } else {
      say(ok, g.id);
      for (const s of list) console.log(`         ${s.slice(0, 100)}`);
      if (!allThere) console.log(`         -> ${first9.length} of levels 1-9 rendered`);
      else if (!allTesters) console.log('         -> one of levels 1-9 is not a Tester');
      else if (!tenthIsLesson) console.log(`         -> level 10 reads "${tenth.slice(0, 70)}"`);
    }
  }

  console.log(`\n${grades.length - bad} of ${grades.length} grades render levels 1 to 9 on the path page`
    + `${noEnrollment ? ` (${noEnrollment} could not be reached at all)` : ''}`);

  // ── the curriculum page, and the grade list on it ─────────────────────────
  //
  // The same grades on `/curriculum` rather than `/path`, reached by *clicking* a
  // grade rather than by following a URL. Those are different code paths and they
  // disagreed: clicking the Reading *track* reset the slice to level 1, and
  // clicking a *grade* inside it anchored to the account's current level or the
  // first lesson — which is level 10, because every one of these grades puts nine
  // entry checks ahead of its first lesson. So the subject list looked right and
  // the grade list started at 10, on the same page, two lines apart.
  //
  // This is the third distinct path to "what does the opening of a grade look
  // like" — the layout, the path route, and this click handler — and each has been
  // right while the other two were wrong. A URL with `?grade=` would have passed
  // throughout, which is why this clicks.
  const allowed = await evaluate(`(async () => (await fetch('/api/curriculum')).status)()`);
  if (allowed === 200) {
    console.log('the account can browse the curriculum; clicking each grade on it\n');
    bad += await walkCurriculumGrades(grades);
  } else {
    // The gate is on the address, not on the session, so this signs in as the one
    // address `config/capabilities` allows and walks under that.
    const other = signIn(CURRICULUM_EMAIL);
    const now = other.ok ? await evaluate(`(async () => (await fetch('/api/curriculum')).status)()`) : 0;
    if (now === 200) {
      console.log(`the path account may not browse it; signed in as ${CURRICULUM_EMAIL}\n`);
      bad += await walkCurriculumGrades(grades);
    } else {
      console.log(`\nthe curriculum page is not open to this account (${allowed}), and signing in`);
      console.log(`as ${CURRICULUM_EMAIL} did not open it either (${other.how}). Its grade list was`);
      console.log('NOT walked — that half of this check did not run.');
    }
  }

  if (bad === 0) {
    console.log('\nThis is read from the rendered DOM, so it is what a learner would see.');
  }
  process.exit(bad === 0 ? 0 : 1);
})();

/**
 * Click each grade on the curriculum page and read where the level list starts.
 *
 * A real click, not a URL: the fault this catches was in the click handler, and a
 * URL with `?grade=` takes a different route through the code and would have
 * passed throughout.
 */
async function walkCurriculumGrades(grades) {
  let bad = 0;
  console.log('\nclicking each grade on the curriculum page:\n');
  for (const g of grades) {
    // A fresh load per grade, not a click after the last one. The slice is page
    // state: reusing one page lets a grade inherit the previous grade's position,
    // which is precisely the fault being looked for. It costs a navigation each
    // and that is the point — the reader gets a fresh page too.
    ab(['open', `${BASE}/curriculum?track=reading`]);
    ab(['wait', '--fn', "!!document.querySelector('[data-grade]')"]);
    // Click the grade's own button, which is what a reader clicks.
    const clicked = evaluate(`(() => {
      const b = document.querySelector('[data-grade="${g.id}"]');
      if (!b) return 'no button for ' + ${JSON.stringify(g.id)};
      b.click();
      return 'clicked';
    })()`);
    if (clicked !== 'clicked') {
      console.log(`  FAIL ${g.id}: ${clicked}`);
      bad++;
      continue;
    }
    ab(['wait', '--fn', "document.querySelectorAll('#levels .node').length > 0"]);
    const rows = evaluate(`Array.from(document.querySelectorAll('#levels .node')).slice(0, 10)`
      + `.map(n => { const t = n.querySelector('.title'); return t ? t.textContent.trim() : ''; })`);
    const list = Array.isArray(rows) ? rows : [];
    const first9 = list.slice(0, 9);
    const startsAtOne = first9.length === 9 && first9.every((s, i) => new RegExp('^Level ' + (i + 1) + '\\b').test(s));
    const allTesters = first9.every((s) => /\bTester\b/.test(s));
    const tenth = list[9] || '';
    const tenthIsLesson = /^Level 10\b.*\bLesson\b/.test(tenth);
    const ok = startsAtOne && allTesters && tenthIsLesson;
    if (!ok) bad++;
    if (ok && !process.env.VERBOSE) {
      console.log(`  ok   ${g.id.padEnd(30)} opens on level 1; L1-L9 are Testers`);
    } else {
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${g.id}`);
      for (const s of list) console.log(`         ${s.slice(0, 96)}`);
      if (!startsAtOne) console.log(`         -> the list starts at ${(first9[0] || '(nothing)').slice(0, 40)}`);
      else if (!allTesters) console.log('         -> one of levels 1-9 is not a Tester');
      else if (!tenthIsLesson) console.log(`         -> level 10 reads "${tenth.slice(0, 60)}"`);
    }
  }
  console.log(`\n${grades.length - bad} of ${grades.length} grades open the curriculum list at level 1`);
  return bad;
}
