/**
 * Tests for the learner-facing follow-ups of 2026-10-24
 * (curriculum-build/LIVE-CHANGES-2026-10-24.md, "Learner follow-ups"):
 *   1. skill pages: learner wording for every exit metric, no stage codes;
 *   2. the recap after a passed Final that graduated or is held;
 *   3. the batched plan route and the smaller path and catalogue forms;
 *   4. the spoken checkpoint for preschool and Kindergarten;
 *   5. chess board coordinate contrast.
 *
 *   node scripts/learner-followups-test.js
 *
 * Runs on its own throwaway data file with every model key blanked: no model
 * call, no network, nothing real touched.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
for (const k of Object.keys(process.env)) if (/_API_KEY$|_KEY$|ANTHROPIC|OPENROUTER|NVIDIA|GEMINI|MIMO|MODELFLARE|XKIRO/.test(k) && k !== 'NODE_ENV') process.env[k] = '';
const tmp = path.join(os.tmpdir(), `${path.basename(__filename, '.js')}-${process.pid}.json`);
process.env.DB_FILE = tmp;
delete process.env.YOUNG_ORAL;

const ROOT = path.join(__dirname, '..');
const express = require('express');
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const LAYOUT = require('../config/level-layout');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** An app with the given routers mounted under /api, signed in as the x-user header's account. */
function serve(routers) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  for (const r of routers) { if (Array.isArray(r)) app.use(r[0], r[1]); else app.use('/api', r); }
  app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint.' }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const call = (method, url, body, uid) => new Promise((done, fail) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
          let text = '';
          res.on('data', (c) => { text += c; });
          res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = null; } done({ status: res.statusCode, body: json, bytes: Buffer.byteLength(text) }); });
        });
        req.on('error', fail);
        if (data) req.write(data);
        req.end();
      });
      resolve({ call, close: () => server.close() });
    });
  });
}

function skillText() {
  console.log('\n1. Skill pages: learner wording');
  const { PLAIN, plainFor } = require('../content/skill-learner-text');
  const { checkFor } = require('../content/skill-stage-checks');
  const sc = require('../services/skill-coverage');
  // Build words the progressions use that a learner should never see.
  const RAW = /[<>]=?|_|\bP\(|\bRD\b|\bCV\b|\[R\]|noteAccuracy|on_beat|\bDTM\b|\bbpm\b|\bHS\b|\bRH\b|\bLH\b|\bSR\d|\b(?:CH|PI|BB)\d|\bn\s*>=|unit_belief|en prise/;
  let n = 0;
  const missing = [];
  const raw = [];
  const numbers = [];
  for (const subject of ['chess', 'piano', 'basketball']) {
    for (const st of sc.stagesFor(subject)) {
      for (const m of st.metrics) {
        n++;
        const line = plainFor(m.id);
        if (!line) { missing.push(m.id); continue; }
        if (m.plain !== line) missing.push(`${m.id} (not on the stage view)`);
        if (RAW.test(line)) raw.push(`${m.id}: ${line.match(RAW)[0]}`);
        // A wired check's numbers are the ones it is graded by.
        const def = checkFor(m.id);
        if (def.how === 'not_wired') continue;
        const want = [];
        const r = def.rule || {};
        // A set of one ("find it within 3 tries") states its tries instead.
        if (r.right && def.count > 1) want.push(r.right === def.count ? `all ${def.count}` : `${r.right} of ${def.count}`);
        if (def.tries > 1) want.push(`within ${def.tries} tries`);
        for (const key of ['squares_share', 'share', 'notes', 'notes_mic', 'on_beat']) if (r[key] !== undefined && r[key] < 1) want.push(`${Math.round(r[key] * 100)}%`);
        if (r.notes === 1) want.push('every note');
        if (def.tempo) want.push(`${def.tempo} beats a minute`);
        if (def.cut) want.push(String(def.cut));
        if (def.min) want.push(`At least ${def.min}`);
        if (r.rate !== undefined) want.push(r.rate === 0.5 ? 'half' : `${Math.round(r.rate * 100)}%`, `${Math.round(r.conf * 100)}% sure`);
        if (def.min_n) want.push(`at least ${def.min_n}`);
        if (r.ratio) want.push(`${Math.round(r.ratio * 100)}%`);
        if (r.logged) want.push(`${r.logged} throws`);
        if (r.growth) want.push(`${Math.round(r.growth * 100)}%`);
        if (r.on_beat === 0.75) want.push('three taps in four');
        for (const w of want.filter(Boolean)) {
          // "three taps in four" stands for 75%; "every chord" for chords: 1.
          if (w === '75%' && /three taps in four/.test(line)) continue;
          if (!line.toLowerCase().includes(w.toLowerCase())) numbers.push(`${m.id}: "${w}" not in "${line}"`);
        }
      }
    }
  }
  check(`every exit metric (${n}) has a learner line, and the stage view carries it`, !missing.length, missing);
  check('no learner line uses a build word (>=, _, P(, RD, CV, [R], stage codes...)', !raw.length, raw);
  check('a wired check\'s line states the numbers it is graded by', !numbers.length, numbers);
  check('no learner line for a metric the progressions do not have', Object.keys(PLAIN).length === n, Object.keys(PLAIN).length);

  for (const page of ['public/js/stage-left.js', 'public/js/stage-check.js', 'public/js/skill-practice.js']) {
    const src = read(page);
    check(`${page}: no raw pass rule ("Bar: threshold") on the page`, !/Bar: \$\{|\.threshold\)/.test(src));
    check(`${page}: no stage code shown ("Stage PI1")`, !/Stage \$\{esc\([a-z]+\.stage\.id\)|stage \$\{esc\(l\.stage\.id\)|Stage \$\{o\.stage\.id\}/.test(src));
    check(`${page}: shows the learner line`, /\.plain \|\|/.test(src));
  }
  check('stage check: the build note on a check ("a build job") shows only with ?debug=1', /c\.gap && App\.query\('debug'\)/.test(read('public/js/stage-check.js')));
  check('stage left: no "the owner\'s decision" text to learners', !/owner's decision/.test(read('public/js/stage-left.js')));
  check('practice: "Why this plan" reads the learner lines', /p\.why \|\| p\.reasons/.test(read('public/js/skill-practice.js')));
}

function recap() {
  console.log('\n2. The recap after a passed Final');
  const sessions = require('../services/sessions');
  const held = sessions.outcomeSummary({ kind: 'graduation', passed: true, coverage_held: true }, 0.92, [40]);
  check('coverage-held: no "next one steps up"', held && !/steps up|next one/.test(held) && /not another Final/.test(held), held);
  const skill = sessions.outcomeSummary({ kind: 'graduation', passed: true, skill_held: true }, 0.7, [40, 41]);
  check('skill-held: says the measured skills', skill && /measured skills/.test(skill) && /^Solid session across levels 40 to 41\./.test(skill), skill);
  const grad = sessions.outcomeSummary({ kind: 'graduation', passed: true, graduated: true }, 0.95, [40]);
  check('graduated: the grade is complete', grad && /grade is complete/.test(grad), grad);
  check('a Master quiz or a failed Final keeps the ordinary line', sessions.outcomeSummary({ kind: 'master', passed: true }, 0.9, [5]) === null
    && sessions.outcomeSummary({ kind: 'graduation', passed: false }, 0.5, [40]) === null && sessions.outcomeSummary(null, 0.9, [1]) === null);
  const src = read('services/sessions.js');
  check('finish() applies it to the stored analysis and to the deep analysis when it lands', /outcomeLine = outcomeSummary\(checkpoint, accuracy, levels\)/.test(src) && /if \(outcomeLine\) merged\.summary = outcomeLine/.test(src));
  check('the recap page names the skill-gate hold and links the stage list', /skillHeld \? " Graduation waits on this stage's measured skills/.test(read('public/js/session.js')));
}

async function payloads() {
  console.log('\n3. One plan request for the dashboard, and smaller payloads');
  const user = db.insert('users', { email: 'fu-learner@example.test', display_name: 'FU', password_hash: 'x', streak: 0, xp: 0, onboarded: true });
  const other = db.insert('users', { email: 'fu-other@example.test', display_name: 'Other', password_hash: 'x', streak: 0, xp: 0, onboarded: true });
  const enrol = (u, track, gradeId, level, status = 'active') => {
    const g = curriculum.getGrade(track, gradeId);
    return db.insert('enrollments', { user_id: u.id, track_id: track, grade_id: gradeId, target_level: g.pathLength, current_level: level, level_items: 0, levels_completed: 0, xp: 0, status, pending_checkpoint: null, placed_at: status === 'active' ? new Date().toISOString() : null });
  };
  const mine = [enrol(user, 'math', 'numbers_to_10', 12), enrol(user, 'reading', 'foundations', 30), enrol(user, 'english', 'basics', 1, 'placement_pending')];
  const theirs = enrol(other, 'math', 'numbers_to_10', 3);
  const app = await serve([['/api/placement', require('../routes/placement')], require('../routes/learn'), require('../routes/catalog').router]);
  try {
    const all = await app.call('GET', '/api/placement/paths', null, user.id);
    check('GET /api/placement/paths answers 200', all.status === 200, all.status);
    let same = true;
    for (const e of mine) {
      const one = await app.call('GET', `/api/placement/path/${e.id}`, null, user.id);
      if (JSON.stringify(one.body) !== JSON.stringify(all.body[e.id])) same = false;
    }
    check('...with one reply per enrollment, the same as /path/:id', same && Object.keys(all.body).length === mine.length, Object.keys(all.body));
    check('...and never another learner\'s enrollment', !all.body[theirs.id]);
    const some = await app.call('GET', `/api/placement/paths?ids=${mine[0].id},${theirs.id}`, null, user.id);
    check('?ids= limits it to the learner\'s own of those', Object.keys(some.body).join() === String(mine[0].id), some.body);
    check('signed out: 401', (await app.call('GET', '/api/placement/paths')).status === 401);
    check('the dashboard asks once (no request per enrollment)', /\/api\/placement\/paths'/.test(read('public/js/dashboard.js')) && !/\/api\/placement\/path\/\$\{e\.id\}/.test(read('public/js/dashboard.js')));

    for (const e of mine.slice(0, 2)) {
      const full = await app.call('GET', `/api/path/${e.id}`, null, user.id);
      const page = await app.call('GET', `/api/path/${e.id}?view=page`, null, user.id);
      const ticks = await app.call('GET', `/api/path/${e.id}?view=ticks`, null, user.id);
      const F = full.body; const P = page.body; const T = ticks.body;
      const drawn = (n) => JSON.stringify([n.level, n.kind, n.checkpoint || null, n.state, !!n.reachable, n.covers || n.focus_name || '', n.level_title || n.topic || '', n.type || null,
        n.unit_status || null, n.unit_key || null, n.unit_number || null, n.unit_title || null, !!n.unit_can_test_out, n.checkpoint ? n.delivered : null]);
      const diff = F.nodes.filter((n, i) => drawn(n) !== drawn(P.nodes[i] || {})).map((n) => n.level);
      check(`${e.track_id}: ?view=page has every row, with every value the page draws unchanged`, P.nodes.length === F.nodes.length && !diff.length, diff.slice(0, 5));
      check(`${e.track_id}: ...and the rest of the reply unchanged`, JSON.stringify({ ...F, nodes: null }) === JSON.stringify({ ...P, nodes: null }));
      check(`${e.track_id}: ?view=page is smaller (${full.bytes} -> ${page.bytes} bytes)`, page.bytes < full.bytes * 0.7, [full.bytes, page.bytes]);
      const want = F.nodes.filter((n) => n.checkpoint || n.level === F.enrollment.current_level).map((n) => n.level);
      check(`${e.track_id}: ?view=ticks has the checkpoint rows and the current one (${full.bytes} -> ${ticks.bytes} bytes)`,
        JSON.stringify(T.nodes.map((n) => n.level)) === JSON.stringify(want) && JSON.stringify(T.checkpoints.next) === JSON.stringify(F.checkpoints.next), [T.nodes.length, want.length]);
    }
    check('the path page and the dashboard ask for their forms', /\/api\/path\/\$\{enrollmentId\}\?view=page/.test(read('public/js/path.js')) && /\/api\/path\/\$\{lead\.id\}\?view=ticks/.test(read('public/js/dashboard.js')));

    const full = await app.call('GET', '/api/catalog');
    const sum = await app.call('GET', '/api/catalog?view=summary');
    const grades = await app.call('GET', '/api/catalog?view=grades');
    check(`catalogue ?view=summary: name, blurb and grade count of every subject (${full.bytes} -> ${sum.bytes} bytes)`,
      sum.body.tracks.every((t, i) => t.name === full.body.tracks[i].name && t.blurb === full.body.tracks[i].blurb && t.grade_count === full.body.tracks[i].grades.length) && sum.bytes < 5000);
    check(`catalogue ?view=grades: every grade without its skill list (${grades.bytes} bytes)`,
      grades.body.tracks.every((t, i) => t.grades.every((g, j) => { const { skills, ...rest } = full.body.tracks[i].grades[j]; return JSON.stringify(rest) === JSON.stringify(g); })));
    check('landing and onboarding ask for the smaller forms', /\/api\/catalog\?view=summary/.test(read('public/js/landing.js')) && /\/api\/catalog\?view=grades/.test(read('public/js/onboarding.js')));
  } finally {
    app.close();
  }
}

async function oral() {
  console.log('\n4. Spoken checkpoints for preschool and Kindergarten');
  const essays = require('../services/essays');
  const sessions = require('../services/sessions');
  const coverage = require('../services/coverage');
  let count = 0;
  const wrong = [];
  for (const t of curriculum.TRACKS) {
    for (const g of t.grades) {
      for (let lv = 1; lv <= g.pathLength; lv++) {
        const kind = essays.oralKindFor(g, lv);
        if (!kind) continue;
        count++;
        if (!curriculum.isEssayCheckpoint(g, lv) || !/Preschool|Pre-K|Kindergarten/.test(g.name)) wrong.push(`${t.id}/${g.id}/${lv}`);
      }
    }
  }
  check(`the 26 "Explain Aloud" and "Oral Retell" checkpoints are spoken (${count})`, count === 26 && !wrong.length, wrong);
  const G = curriculum.getGrade('math', 'numbers_to_10');
  const LEVEL = 53;
  check('the level is an Explain Aloud checkpoint', /Explain Aloud/.test((LAYOUT.entryFor(G, LEVEL) || {}).title));
  process.env.YOUNG_ORAL = 'off';
  check('YOUNG_ORAL=off goes back to the typed essay', essays.oralKindFor(G, LEVEL) === null);
  delete process.env.YOUNG_ORAL;

  const user = db.insert('users', { email: 'fu-kid@example.test', display_name: 'Kid', password_hash: 'x', streak: 0, xp: 0, onboarded: true });
  const enrollment = db.insert('enrollments', { user_id: user.id, track_id: 'math', grade_id: 'numbers_to_10', target_level: G.pathLength, current_level: LEVEL, level_items: 0, levels_completed: 40, xp: 0, status: 'active', pending_checkpoint: null, placed_at: new Date().toISOString() });
  // A typed brief stored before the change takes over cleanly.
  db.insert('essays', { user_id: user.id, track_id: 'math', grade_id: 'numbers_to_10', level: LEVEL, attempt: 1, prompt: 'Write about something you have a view on', criteria: [{ name: 'x' }], source: 'ai', draft: '', attempts: [], passed: false, cleared_at: null, session_id: null, block: null });
  const { essay } = await essays.forLevel({ userId: user.id, enrollment, grade: G, level: LEVEL, attempt: 1 });
  check('the brief is spoken, child-sized, and written without a model', essay.mode === 'oral' && essay.source === 'oral' && /out loud/.test(essay.prompt) && !(essay.criteria || []).length, essay);
  const view = essays.sanitize(essay);
  check('the page is told it is spoken, with no word minimum', view.mode === 'oral' && view.min_words === 0 && view.oral_kind === 'explain');

  const session = db.insert('sessions', { user_id: user.id, enrollment_id: enrollment.id, track_id: 'math', grade_id: 'numbers_to_10', level: LEVEL, kind: 'essay', blocks: [{ index: 0, level: LEVEL, kind: 'essay' }], started_at: new Date().toISOString() });
  essays.attach(essay, session.id, 0);
  const at = Date.now() - 60000;
  const tap = (k, correct) => db.insert('items', { user_id: user.id, session_id: session.id, skill_id: 'add_sub', difficulty: 1, format: 'multiple_choice', prompt: `tap ${k}`, answer: '3', choices: ['1', '2', '3', '4'], role: 'exam', level: LEVEL, block: 0, index: k, user_answer: correct ? '3' : '1', correct, ms: 8000, coach_used: false, answered_at: new Date(at + k * 1000).toISOString() });
  [true, true, false, true, true].forEach((c, k) => tap(k, c));

  const app = await serve([require('../routes/essays')]);
  try {
    const row = () => db.byId('essays', essay.id);
    const typed = await app.call('POST', `/api/essays/${essay.id}/submit`, { text: 'word '.repeat(90) }, user.id);
    check('a typed hand-in is refused on a spoken checkpoint', typed.status === 409, typed.body);
    const notSaid = await app.call('POST', `/api/essays/${essay.id}/oral`, { said: false }, user.id);
    check('"I said it" is required', notSaid.status === 400, notSaid.body);
    const someoneElse = db.insert('users', { email: 'fu-x@example.test', display_name: 'X', password_hash: 'x', streak: 0, xp: 0, onboarded: true });
    check('another account gets 404', (await app.call('POST', `/api/essays/${essay.id}/oral`, { said: true }, someoneElse.id)).status === 404);
    const handed = await app.call('POST', `/api/essays/${essay.id}/oral`, { said: true, parent_confirmed: true, audio: 'AAAA', text: 'anything' }, user.id);
    check('handed in: marked on the tap questions, 4 of 5 = 80%, passed', handed.status === 200 && handed.body.passed === true && Math.abs(handed.body.overall - 0.8) < 1e-9 && handed.body.taps.right === 4, handed.body);
    const stored = row();
    check('nothing the learner said is stored: only the two yes/no answers', !JSON.stringify(stored).includes('AAAA') && !JSON.stringify(stored).includes('anything')
      && stored.oral.length === 1 && stored.oral[0].parent_confirmed === true && stored.attempts[0].said === true);

    const out = sessions.resolveEssayCheckpoint({ userId: user.id, session, enrollment: db.byId('enrollments', enrollment.id), grade: G, essay: stored, result: stored.attempts[stored.attempts.length - 1] });
    check('the checkpoint resolves as passed and moves the level', out.passed === true && db.byId('enrollments', enrollment.id).current_level > LEVEL, out);

    const answers = coverage.answersFor(user.id, db.byId('enrollments', enrollment.id));
    const attest = answers.filter((a) => a.attest);
    check('coverage: the 5 tap questions are ordinary multiple-choice evidence', answers.filter((a) => a.level === LEVEL && !a.attest && a.choices === 4).length === 5);
    check('coverage: the grown-up\'s confirmation is one light yes/no answer, never direct', attest.length === 1 && attest[0].choices === 2 && attest[0].role === 'attest');
    const k = coverage.knobs();
    const model = coverage.modelFor('math', 'numbers_to_10');
    const many = Array.from({ length: 60 }, (_, i) => ({ ...attest[0], t: at + i * 86400000 }));
    const states = coverage.assess(model, many);
    check(`coverage: 60 confirmations alone prove nothing (weight ${k.ATTEST_W})`, states.every((s) => s.status === 'unproven'), states.filter((s) => s.status !== 'unproven').length);
    const parentless = await (async () => {
      const { id, ...rest } = stored; // eslint-disable-line no-unused-vars
      const e2 = db.insert('essays', { ...rest, attempt: 2, oral: [], attempts: [], passed: false, cleared_at: null });
      await app.call('POST', `/api/essays/${e2.id}/oral`, { said: true }, user.id);
      return db.byId('essays', e2.id);
    })();
    check('without a grown-up, the learner\'s own "I said it" adds no coverage evidence', coverage.answersFor(user.id, enrollment).filter((a) => a.attest).length === 1 && parentless.oral[0].parent_confirmed === false);
  } finally {
    app.close();
  }
  const page = read('public/js/session.js');
  check('the session page draws the spoken screen and loads the on-device recorder', /essay\.mode === 'oral'\) \{ renderOral\(\)/.test(page) && /\/js\/say-aloud\.js/.test(read('public/session.html')));
  check('...and sends only the two yes/no answers', /\/oral`, \{ said: true, parent_confirmed: /.test(page));
  check('the consent test scans the recorder for any network path', /say-aloud\.js'\)\);/.test(read('scripts/consent-test.js')));
}

function chessContrast() {
  console.log('\n5. Chess board coordinates');
  const src = read('public/engine/chess/board.js');
  const L = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = L(a); const y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const sq = (k) => (src.match(new RegExp(`__sq\\.is-${k}\\{background:(#[0-9a-f]{6})`)) || [])[1];
  const co = (k) => (src.match(new RegExp(`__sq\\.is-${k} \\.' \\+ t \\+ '__coord\\{color:(#[0-9a-f]{6})`)) || [])[1];
  const light = ratio(co('light'), sq('light'));
  const dark = ratio(co('dark'), sq('dark'));
  check(`on light squares ${light.toFixed(2)}:1 and on dark squares ${dark.toFixed(2)}:1, both at least 4.5:1`, light >= 4.5 && dark >= 4.5);
  check('no opacity on the coordinates (it lowered the contrast)', !/__coord\{[^}]*opacity/.test(src));
}

(async () => {
  skillText();
  recap();
  await payloads();
  await oral();
  chessContrast();
  try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
