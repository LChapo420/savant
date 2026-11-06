#!/usr/bin/env node
/**
 * Time to first lesson after placement, over HTTP against a RUNNING server with real models (brief first-lesson, 4 Nov 2026).
 * Not part of npm test. Start the app on a free port against a COPY of the database (see scripts/learner-walk.js for the env), then:
 *
 *   node scripts/first-lesson-timing.js http://localhost:6941 [n=1] [profiles=strong,weak,mid,random] [out=file.json]
 *
 * Each of the n learners (in parallel) registers as a consented adult, fills the profile survey, enrolls in math (Algebra 1 Part A), takes
 * the adaptive placement through the API, and the clock starts when POST /api/placement/finish returns. It then polls the placed level's
 * lesson until the personalised plan opens. Reports per learner: placement seconds, whether the first poll already had the lesson,
 * seconds from the end of placement to the open lesson, and whether the lesson is tailored.
 *
 * Learners are simulated; profiles are extremes on purpose: strong (answers right from the DEV_TOOLS answer key, 3% slips) lands high, weak
 * (always wrong) lands at the first unit, mid (60% right), random (a different chance per learner, 5 to 95%). DEV_TOOLS=1 on the server
 * is needed for the key. Test accounts are fresh adults; account 6689 is never touched.
 */
const BASE = (process.argv[2] || 'http://localhost:6941').replace(/\/$/, '');
const N = Number(process.argv[3] || 1);
const PROFILES = String(process.argv[4] || 'strong,weak,mid,random').split(',');
const OUT = process.argv[5] || null;
const STAMP = Date.now().toString(36);
const THINK_MS = Number(process.env.THINK_MS || 0); // seconds a learner takes per placement question, in ms (THINK_MS=8000 is about 4 minutes for a 30-question walk)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seed = Number(process.env.TIMING_SEED || 20261104);
const rand = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function client(ip) {
  let cookie = '';
  return async (method, path, body) => {
    const started = Date.now();
    let res;
    try {
      res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(ip ? { 'X-Forwarded-For': ip } : {}), ...(cookie ? { Cookie: cookie } : {}), Origin: BASE }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(300000) });
    } catch (err) { return { status: 0, payload: { error: String(err.message) }, ms: Date.now() - started }; }
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let payload = null; try { payload = await res.json(); } catch { payload = null; }
    return { status: res.status, payload: payload || {}, ms: Date.now() - started };
  };
}

async function learner(k, profile) {
  const call = client(process.env.TRUST_PROXY_TEST ? `10.77.${(STAMP.length * 7 + k) % 250}.${1 + (k % 250)}` : null);
  const row = { k, profile };
  const email = `timing-${STAMP}-${k}@example.com`;
  // The app's register rate limit (per IP) stops 10 learners at once: space the starts and retry a 429 after the wait it names (this test only). With TRUST_PROXY_TEST=1 and the test server on TRUST_PROXY=1 each learner also gets its own address, since the limit is 10 an hour per address.
  await sleep(k * Number(process.env.REGISTER_GAP_MS || 1000));
  let reg;
  for (let a = 0; a < 8; a++) {
    reg = await call('POST', '/api/auth/register', { email, password: 'Timing-test-pw-9', display_name: `Timing ${k}`, birth_year: 1990, birth_month: 6, country: 'US' });
    if (reg.status !== 429) break;
    await sleep(Math.min(60000, 1000 * Number((reg.payload && (reg.payload.retry_after || reg.payload.retryAfter)) || 15)));
  }
  if (![200, 201].includes(reg.status)) return { ...row, error: `register ${reg.status} ${JSON.stringify(reg.payload).slice(0, 100)}` };
  await call('POST', '/api/profile/survey', { interests: ['basketball, drawing', 'chess, music', 'cooking, trains', 'football, coding'][k % 4], hobbies: 'sketching', notes: 'short explanations please' });
  const en = await call('POST', '/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }] });
  const enr = (en.payload.created || [])[0] || ((await call('GET', '/api/enrollments')).payload.enrollments || []).find((x) => x.track && x.track.id === 'math');
  if (!enr) return { ...row, error: `enroll ${en.status}` };
  const chance = profile === 'strong' ? 0.97 : profile === 'weak' ? 0 : profile === 'mid' ? 0.6 : 0.05 + 0.9 * rand();
  const t0 = Date.now();
  const start = await call('POST', '/api/placement/start', { enrollment_id: enr.id });
  if (![200, 201].includes(start.status)) return { ...row, error: `placement start ${start.status}` };
  let queue = [...(start.payload.items || [])]; let asked = 0;
  while (queue.length && asked < 60) {
    const item = queue.shift();
    let answer = 'definitely wrong 987';
    if (rand() < chance) {
      const key = await call('GET', `/api/dev/item-key/${start.payload.session_id}`);
      const k2 = (key.payload.items || []).find((i) => i.id === item.id);
      if (k2 && k2.answer != null) answer = String(k2.answer);
    }
    if (THINK_MS) await sleep(THINK_MS * (0.6 + 0.8 * rand())); // a person reading and answering; 0 = a script (the worst case for write-ahead)
    const r = await call('POST', '/api/placement/answer', { session_id: start.payload.session_id, item_id: item.id, answer, ms: 2500 });
    asked++;
    if (r.status === 200 && r.payload.next_item) queue.push(r.payload.next_item);
  }
  const fin = await call('POST', '/api/placement/finish', { session_id: start.payload.session_id });
  const tEnd = Date.now();
  row.placementSec = Math.round((tEnd - t0) / 1000); row.asked = asked;
  const placed = fin.payload.result && (fin.payload.result.start_level || fin.payload.result.placedLevel);
  const cur = ((await call('GET', '/api/enrollments')).payload.enrollments || []).find((x) => x.id === enr.id);
  const level = cur ? cur.current_level : placed;
  row.level = level; row.kind = cur && cur.level_kind;
  let first = null; let plan = null;
  for (;;) {
    const r = await call('GET', `/api/lessons/math/algebra_1_part_a/${level}`);
    if (first === null) first = r.status;
    if (r.status === 200 && r.payload.basis === 'blocks') { plan = r.payload; break; }
    if (r.status !== 202 && r.status !== 200) { row.error = `lesson ${r.status}`; break; }
    if (Date.now() - tEnd > 600000) { row.error = 'timeout 600 s'; break; }
    await sleep(r.status === 202 ? 1000 : 2000);
  }
  row.firstPoll = first; row.toLessonSec = Math.round((Date.now() - tEnd) / 100) / 10; row.tailored = !!(plan && plan.meta && plan.meta.tailored);
  row.model = plan && plan.meta && (plan.meta.model || plan.meta.layout_model) || null;
  return row;
}

(async () => {
  const jobs = Array.from({ length: N }, (_, k) => learner(k, PROFILES[k % PROFILES.length]));
  const rows = await Promise.all(jobs);
  console.table(rows.map((r) => ({ k: r.k, profile: r.profile, asked: r.asked, level: r.level, placementSec: r.placementSec, firstPoll: r.firstPoll, toLessonSec: r.toLessonSec, tailored: r.tailored, error: r.error || '' })));
  if (OUT) require('fs').writeFileSync(OUT, JSON.stringify(rows, null, 1));
  process.exit(0);
})();
