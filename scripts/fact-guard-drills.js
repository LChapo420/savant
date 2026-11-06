#!/usr/bin/env node
/**
 * Failure drills for the fact guard, against a RUNNING server on a DB copy that was started with scripts/fact-guard-tap.js and FACT_TAP_DRILL_FILE, as a learner would see
 * them: the tutor, a lesson opening, a build from an upload, a child without consent. The checkers are turned off on the wire one at a time and all together; the writers
 * keep working. Then they come back: how long until the app answers again, and is anything left stuck? Real models, prepaid credits. Not part of npm test.
 *
 *   FACT_TAP_DRILL_FILE=drill.json node scripts/fact-guard-drills.js http://localhost:6961 [--drills none,coral,zerogpu,nvidia,all,hang] [--out FILE]
 */
const fs = require('fs');

const BASE = (process.argv[2] || 'http://localhost:6961').replace(/\/$/, '');
const argv = process.argv.slice(3);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const DRILL_FILE = process.env.FACT_TAP_DRILL_FILE;
if (!DRILL_FILE) { console.error('FACT_TAP_DRILL_FILE is needed'); process.exit(2); }
const OUT = arg('out', '');
const STAMP = Date.now().toString(36);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ALL = ['coral', 'zerogpu', 'nvidia'];
const setDrill = (off, mode = 'error') => fs.writeFileSync(DRILL_FILE, JSON.stringify({ off, mode }));
const log = (row) => { console.log(JSON.stringify(row)); if (OUT) fs.appendFileSync(OUT, `${JSON.stringify(row)}\n`); };

function client() {
  let cookie = '';
  return async function call(method, path, body, timeout = 120000) {
    const started = Date.now();
    try {
      const res = await fetch(`${BASE}${path}`, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), Origin: BASE }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      let payload = {}; try { payload = await res.json(); } catch { /* none */ }
      return { status: res.status, payload, ms: Date.now() - started };
    } catch (err) { return { status: 0, payload: { error: err.message }, ms: Date.now() - started }; }
  };
}
const register = async (call, label, by = 1990) => call('POST', '/api/auth/register', { email: `drill-${label}-${STAMP}@example.com`, password: 'Walk-test-pw-9', display_name: `Drill ${label}`, birth_year: by, birth_month: 6, country: 'US' });

const QUESTIONS = ['What is 15% of 80?', 'Why is the sky blue?', 'What caused World War I?', 'What is the capital of Canada?', 'How do I add 1/2 and 1/3?', 'What is a metaphor?'];
let qn = 0;
async function tutor(call, tag) {
  const q = QUESTIONS[qn++ % QUESTIONS.length];
  const r = await call('POST', '/api/tutor/dock', { messages: [{ role: 'user', content: q }], page: { path: '/dashboard' } });
  return { tag, status: r.status, ms: r.ms, source: r.payload.source, reply: String(r.payload.reply || r.payload.error || '').slice(0, 170) };
}

async function placed(call, label) {
  await register(call, label);
  const e = await call('POST', '/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }] });
  const enr = (e.payload.created || [])[0];
  if (!enr) return null;
  const start = await call('POST', '/api/placement/start', { enrollment_id: enr.id });
  const queue = [...(start.payload.items || [])];
  let asked = 0;
  while (queue.length && asked < 60) {
    const item = queue.shift();
    const r = await call('POST', '/api/placement/answer', { session_id: start.payload.session_id, item_id: item.id, answer: item.format === 'multiple_choice' && item.choices ? item.choices[0] : '12', ms: 3000 }); // eslint-disable-line no-await-in-loop
    asked++;
    if (r.payload.next_item) queue.push(r.payload.next_item);
  }
  await call('POST', '/api/placement/finish', { session_id: start.payload.session_id });
  const list = await call('GET', '/api/enrollments');
  return (list.payload.enrollments || []).find((x) => x.id === enr.id) || null;
}

/** A lesson opening: how long, what opens, and does the personal layer come? */
async function lessonOpen(label) {
  const call = client();
  const enr = await placed(call, label);
  if (!enr) return { opened: false, why: 'no enrollment' };
  const t0 = Date.now();
  let r; let first = null;
  for (;;) {
    r = await call('GET', `/api/lessons/math/algebra_1_part_a/${enr.current_level}`); // eslint-disable-line no-await-in-loop
    if (first === null) first = r.status;
    if (r.status !== 202 || Date.now() - t0 > 200000) break;
    await sleep(4000); // eslint-disable-line no-await-in-loop
  }
  const out = { level: enr.current_level, kind: enr.level_kind, first_status: first, status: r.status, open_ms: Date.now() - t0, basis: r.payload.basis, entries: r.payload.plan && r.payload.plan.entries ? r.payload.plan.entries.length : null, layer_asked: !!(r.payload.meta && r.payload.meta.layer) };
  if (out.layer_asked) {
    const t1 = Date.now(); let st = null;
    while (Date.now() - t1 < 40000) {
      st = await call('GET', `/api/lessons/math/algebra_1_part_a/${enr.current_level}/layer`); // eslint-disable-line no-await-in-loop
      if (st.payload.state !== 'pending') break;
      await sleep(1500); // eslint-disable-line no-await-in-loop
    }
    out.layer_state = st && st.payload.state; out.layer_ms = Date.now() - t1; out.layer_head = st && st.payload.layer ? JSON.stringify(st.payload.layer).slice(0, 120) : null;
  }
  return { out, call, enr };
}

const SAMPLE = 'Photosynthesis happens in the chloroplasts of plant cells. Light reactions take place in the thylakoid membranes and make ATP and NADPH, releasing oxygen from water. The Calvin cycle takes place in the stroma and uses ATP and NADPH to fix carbon dioxide into sugar. Our teacher says the rate rises with light until another factor limits it. Chlorophyll absorbs red and blue light most and reflects green, which is why leaves look green.';

/** A build from an upload: notes and pack, polled until they settle or the wait ends. */
async function build(call, tag, waitMs = 200000) {
  const r = await call('POST', '/api/materials/paste', { title: `Drill ${tag} ${STAMP}`, text: SAMPLE });
  const id = r.payload.material && r.payload.material.id;
  if (!id) return { tag, status: r.status, error: r.payload.error };
  const t0 = Date.now();
  await call('POST', `/api/materials/${id}/notes`, {});
  let notes = null; let pack = null;
  let packAsked = false;
  while (Date.now() - t0 < waitMs) {
    const n = await call('GET', `/api/materials/${id}/notes`); // eslint-disable-line no-await-in-loop
    notes = n.payload.notes;
    if (notes && ['ready', 'partial', 'failed'].includes(notes.status)) {
      if (!packAsked) { packAsked = true; await call('POST', `/api/materials/${id}/pack`, {}); } // eslint-disable-line no-await-in-loop
      const p = await call('GET', `/api/materials/${id}/pack`); // eslint-disable-line no-await-in-loop
      pack = p.payload.pack;
      if (pack && ['ready', 'partial', 'failed'].includes(pack.status)) break;
    }
    await sleep(4000); // eslint-disable-line no-await-in-loop
  }
  const sections = notes && notes.sections ? notes.sections.length : 0;
  const cards = pack ? (pack.flashcards || pack.cards || []).length : 0;
  return { tag, id, ms: Date.now() - t0, notes_status: notes && notes.status, notes_error: notes && (notes.error || notes.message), sections, pack_status: pack && pack.status, pack_error: pack && (pack.error || pack.message), cards };
}

async function drill(name, off, mode) {
  setDrill(off, mode);
  const adult = client();
  const reg = await register(adult, `a-${name}`);
  const rows = { drill: name, off, mode, register: reg.status };
  rows.tutor = [await tutor(adult, 'adult 1'), await tutor(adult, 'adult 2')];
  const les = await lessonOpen(`l-${name}`);
  rows.lesson = les.out || les;
  rows.build = await build(adult, name);
  rows.tutor_after = await tutor(adult, 'adult 3');
  log(rows);
  return { adult, les };
}

async function child() {
  const call = client();
  const reg = await register(call, 'child', new Date().getFullYear() - 10);
  const rows = { drill: 'child', register: reg.status, reg_body: JSON.stringify(reg.payload).slice(0, 160) };
  setDrill([], 'error');
  rows.tutor_open = await tutor(call, 'checkers on');
  setDrill(ALL, 'error');
  rows.tutor_off = await tutor(call, 'checkers off');
  setDrill([], 'error');
  log(rows);
}

async function recovery() {
  // All off, the app asked to do things, then all back: how long until a checked answer comes, for the tutor; and do held things come back without a person?
  setDrill(ALL, 'error');
  const call = client();
  await register(call, `rec`);
  const during = await tutor(call, 'off');
  const built = await build(call, 'rec-off', 90000);
  setDrill([], 'error');
  const t0 = Date.now(); const tries = [];
  while (Date.now() - t0 < 180000) {
    const r = await tutor(call, 'back'); // eslint-disable-line no-await-in-loop
    tries.push({ after_s: Math.round((Date.now() - t0) / 1000), ms: r.ms, source: r.source, reply: r.reply.slice(0, 60) });
    if (!/double-check|check found|not connected|offline/i.test(r.reply) && r.source !== 'fallback') break;
    await sleep(10000); // eslint-disable-line no-await-in-loop
  }
  // The build that could not finish: asked for again, does it work?
  let again = null;
  if (built.id) {
    await call('POST', `/api/materials/${built.id}/notes`, {});
    const t1 = Date.now();
    while (Date.now() - t1 < 150000) {
      const n = await call('GET', `/api/materials/${built.id}/notes`); // eslint-disable-line no-await-in-loop
      again = n.payload.notes;
      if (again && ['ready', 'partial', 'failed'].includes(again.status)) break;
      await sleep(4000); // eslint-disable-line no-await-in-loop
    }
    again = again ? { status: again.status, sections: (again.sections || []).length, ms: Date.now() - t1 } : null;
  }
  log({ drill: 'recovery', during, built, tries, rebuilt: again });
}

(async () => {
  const names = arg('drills', 'none,coral,zerogpu,nvidia,all,hang,child,recovery').split(',');
  for (const n of names) {
    const t = Date.now();
    /* eslint-disable no-await-in-loop */
    if (n === 'child') await child();
    else if (n === 'recovery') await recovery();
    else await drill(n, n === 'none' ? [] : n === 'all' || n === 'hang' ? ALL : [n], n === 'hang' ? 'hang' : 'error');
    /* eslint-enable no-await-in-loop */
    console.log(`-- ${n} took ${Math.round((Date.now() - t) / 1000)} s`);
  }
  setDrill([], 'error');
})().catch((e) => { console.error(e); process.exit(1); });
