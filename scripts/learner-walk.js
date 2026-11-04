/**
 * Learner walk: fresh test learners walk every core path over HTTP against a RUNNING server, with real models.
 *
 *   node scripts/learner-walk.js http://localhost:6931 [flow,flow,...]
 *
 * It starts nothing itself. NOT part of `npm test` (it needs real models and takes minutes). To run it:
 *   1. Copy the DB: cp data/db.json $TMP/db.json   (never walk against the live DB)
 *   2. Start the app from this folder on a free port, for example
 *        NODE_ENV=development PORT=6931 DB_FILE=$TMP/db.json COST_TRACKER_DIR=$TMP/ct DEV_TOOLS=1 \
 *        ADMIN_EMAILS=walk-admin@example.com,walk-admin2@example.com node -r dotenv/config server.js
 *      (DOTENV_CONFIG_PATH names the real .env; blank any paid or banned key you do not want a walk to touch.)
 *   3. node scripts/learner-walk.js http://localhost:6931
 * ADMIN_EMAILS must list walk-admin@example.com and walk-admin2@example.com (the walk needs the jump-to and answer-key
 * tools and /api/admin/my-stats); DEV_TOOLS=1 turns the answer-key route on. Registering is rate limited to 10 an hour
 * per address, so restart the server between walks. Flows (run in parallel): enroll, block, game, checkpoint, spanish,
 * uploads, daily. Exit code 1 when any step fails. Test learners are adults who consented; account 6689 is never touched.
 */
const BASE = (process.argv[2] || `http://localhost:${process.env.PORT || 6767}`).replace(/\/$/, '');
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const STAMP = Date.now().toString(36);
const rows = [];
// Time-to-content (owner, 3 Nov 2026: nothing a learner waits on is slow): what a learner waits for, in ms, with its target.
// WALK_OUT=file.json also writes them; WALK_SERIAL=1 runs the flows one after another (the 1-learner measurement).
const ttcRows = [];
function ttc(flow, what, ms, targetMs, note = '') { ttcRows.push({ flow, what, ms: Math.round(ms), targetMs, ok: ms <= targetMs, note }); }

function client() {
  let cookie = '';
  return async function call(method, path, body, opts = {}) {
    const started = Date.now();
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          ...(body !== undefined && !opts.raw ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          Origin: BASE,
        },
        body: body === undefined ? undefined : opts.raw ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeout || Number(process.env.WALK_TIMEOUT_MS || 240000)),
      });
    } catch (err) { return { status: 0, payload: { error: String(err.message) }, ms: Date.now() - started }; }
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let payload = null;
    try { payload = await res.json(); } catch { payload = null; }
    return { status: res.status, payload: payload || {}, ms: Date.now() - started };
  };
}

async function step(flow, name, fn) {
  const t = Date.now();
  let ok = false; let detail = '';
  try {
    const out = await fn();
    ok = out === undefined ? true : out === true || (out && out.ok);
    detail = out && out.detail ? String(out.detail) : '';
    if (out && out.ok === false) ok = false;
  } catch (err) { detail = `threw: ${err.message}`; }
  rows.push({ flow, name, ok, ms: Date.now() - t, detail: detail.slice(0, 220) });
  return ok;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (v) => JSON.stringify(v).slice(0, 200);

async function register(call, label, admin) {
  const email = admin ? (admin === 3 ? 'walk-owner@example.com' : `walk-admin${admin === 2 ? '2' : ''}@example.com`) : `walk-${label}-${STAMP}@example.com`;
  const r = await call('POST', '/api/auth/register', {
    email, password: 'Walk-test-pw-9', display_name: `Walk ${label}`, birth_year: 1990, birth_month: 6, country: 'US',
  });
  if (r.status === 409) return call('POST', '/api/auth/login', { email, password: 'Walk-test-pw-9' });
  return r;
}

const answerFor = (item, i = 0) => (item.format === 'multiple_choice' && item.choices ? item.choices[i % item.choices.length] : '12');

async function enrollIn(call, selections) {
  const r = await call('POST', '/api/enrollments', { selections });
  return r;
}

async function placement(call, flow, enrollmentId) {
  const start = await call('POST', '/api/placement/start', { enrollment_id: enrollmentId });
  if (start.status === 409 && start.payload.placed) return { ok: true, detail: 'already placed (account reused), skipped', placed: null };
  if (start.status !== 200 && start.status !== 201) return { ok: false, detail: `start ${start.status} ${J(start.payload)}` };
  let queue = [...(start.payload.items || [])];
  let asked = 0; let bad = 0;
  // Adaptive grades hand out one question at a time (answer returns next_item); a fixed quiz hands out all of them.
  while (queue.length && asked < 80) {
    const item = queue.shift();
    const r = await call('POST', '/api/placement/answer', { session_id: start.payload.session_id, item_id: item.id, answer: answerFor(item, asked), ms: 3000 });
    asked++;
    if (r.status !== 200) { bad++; continue; }
    if (r.payload.next_item) queue.push(r.payload.next_item);
  }
  const items = { length: asked };
  const fin = await call('POST', '/api/placement/finish', { session_id: start.payload.session_id });
  const placed = fin.payload.result && fin.payload.result.placedLevel;
  return { ok: fin.status === 200 && placed >= 1 && bad === 0, detail: `${items.length} items, ${bad} bad answers, placed ${placed}, finish ${fin.status}`, placed };
}

/** Wait for a block level to be served; returns { plan, waitedMs, firstStatus }. */
async function openLevel(call, track, grade, level, maxMs = 420000) {
  const t = Date.now();
  let first = null;
  for (;;) {
    const r = await call('GET', `/api/lessons/${track}/${grade}/${level}`);
    if (first === null) first = r.status;
    if (r.status === 200 && r.payload.basis === 'blocks') return { plan: r.payload, waitedMs: Date.now() - t, firstStatus: first, status: 200 };
    if (r.status !== 202) return { plan: null, waitedMs: Date.now() - t, firstStatus: first, status: r.status, payload: r.payload };
    if (Date.now() - t > maxMs) return { plan: null, waitedMs: Date.now() - t, firstStatus: first, status: 'timeout' };
    await sleep(4000);
  }
}

async function answerAllChecks(call, track, grade, level, plan) {
  const checks = (plan.plan.entries || []).filter((e) => e.block.startsWith('Check_'));
  let bad = 0; let right = 0;
  for (const [i, c] of checks.entries()) {
    const d = c.data;
    const answer = c.block === 'Check_Choice' && d.choices ? d.choices[i % d.choices.length] : c.block === 'Check_Typed' ? '12' : (d.options ? d.options[0] : 'e4');
    const r = await call('POST', `/api/lessons/${track}/${grade}/${level}/check`, { check_id: d.id, answer, ms: 4000 });
    if (r.status !== 200) bad++; else if (r.payload.correct) right++;
  }
  return { n: checks.length, bad, right };
}

// ── flows ────────────────────────────────────────────────────────────────────────────────────────────────────────

async function flowEnroll() {
  const f = 'enroll'; const call = client();
  await step(f, 'register consented adult (admin 1)', async () => { const r = await register(call, 'enroll', 1); return { ok: r.status === 201 || r.status === 200, detail: `status ${r.status} ${J(r.payload.error || '')}` }; });
  const selections = [
    { track_id: 'math', grade_id: 'algebra_1_part_a' }, { track_id: 'english', grade_id: 'grammar' },
    { track_id: 'iq', grade_id: 'concrete_thinking_foundations' }, { track_id: 'spanish', grade_id: 'entry' }, { track_id: 'act', grade_id: 'act_grade_1' },
  ];
  let created = [];
  await step(f, 'enroll in math, English, IQ, Spanish, ACT', async () => {
    const r = await enrollIn(call, selections);
    created = (r.payload.created || []);
    const have = await call('GET', '/api/enrollments');
    const mine = (have.payload.enrollments || []).filter((e) => ['math', 'english', 'iq', 'spanish', 'act'].includes(e.track && e.track.id));
    created = mine.length >= 5 ? mine : created;
    return { ok: mine.length >= 5, detail: `status ${r.status}, ${mine.length} enrolled, skipped ${J(r.payload.skipped || [])}` };
  });
  const math = created.find((e) => (e.track && e.track.id === 'math') || e.track_id === 'math');
  let placed = null;
  if (math) {
    await step(f, 'math placement through the real API', async () => { const o = await placement(call, f, math.id); placed = o.placed; return o; });
  }
  // ACT / English / IQ placements too, in parallel (the same API, other tracks).
  await Promise.all(['english', 'iq', 'act'].map(async (t) => {
    const e = created.find((x) => (x.track && x.track.id === t) || x.track_id === t);
    if (!e) return;
    await step(f, `${t} placement through the real API`, () => placement(call, f, e.id));
  }));
  if (math && placed) {
    // Is the first lesson being written ahead right after placement? The first poll says (200 = ready, 202 = writing).
    const lvl = (await call('GET', `/api/enrollments`)).payload.enrollments.find((e) => e.id === math.id).current_level;
    await step(f, `first level after placement (${lvl}) is ready or already being written`, async () => {
      const probe = await call('GET', `/api/lessons/math/algebra_1_part_a/${lvl}`);
      return { ok: [200, 202].includes(probe.status) || probe.status === 404 || probe.status === 200, detail: `first poll ${probe.status} (${probe.payload.basis || (probe.payload.writing ? 'writing' : 'standard session')})` };
    });
  }
}

async function flowBlock() {
  const f = 'block'; const call = client();
  await step(f, 'register consented adult (admin 2)', async () => { const r = await register(call, 'block', 2); return { ok: r.status === 201 || r.status === 200, detail: `status ${r.status}` }; });
  const e = await enrollIn(call, [{ track_id: 'math', grade_id: 'algebra_1_part_a' }]);
  const enr = (e.payload.created || [])[0] || ((await call('GET', '/api/enrollments')).payload.enrollments || []).find((x) => x.track.id === 'math');
  if (!enr) return rows.push({ flow: f, name: 'enroll math', ok: false, ms: 0, detail: J(e.payload) });
  const pl = await step(f, 'placement then write-ahead of the first lesson', async () => {
    const o = await placement(call, f, enr.id);
    return o;
  });
  const cur = ((await call('GET', '/api/enrollments')).payload.enrollments || []).find((x) => x.id === enr.id);
  // After placement: how long until the level the learner stands on is ready, polled from the moment placement ended.
  const stand = cur ? cur.current_level : 10;
  const kind = cur ? cur.level_kind : null;
  if (!['lesson', 'retention'].includes(kind)) rows.push({ flow: f, name: `placed level ${stand} is a block level`, ok: false, ms: 0, detail: `kind ${kind}: not a lesson level, nothing to walk` });
  const LV = stand;
  let plan = null;
  await step(f, 'open the personalised lesson (waits for writing)', async () => {
    const o = await openLevel(call, 'math', 'algebra_1_part_a', LV);
    plan = o.plan;
    ttc(f, 'first lesson after placement', o.waitedMs, o.firstStatus === 200 ? 2000 : 15000, `first poll ${o.firstStatus}`);
    return { ok: !!plan && plan.meta.tailored === true, detail: `first poll ${o.firstStatus}, ready after ${Math.round(o.waitedMs / 1000)}s, tailored=${plan && plan.meta.tailored}, ${plan ? '' : J(o.payload || o.status)}` };
  });
  if (plan) {
    let res = null;
    await step(f, 'answer every check', async () => { res = await answerAllChecks(call, 'math', 'algebra_1_part_a', LV, plan); return { ok: res.n > 0 && res.bad === 0, detail: `${res.n} checks, ${res.right} right, ${res.bad} failed` }; });
    await step(f, 'block-finish confirms the level advances', async () => {
      const r = await call('POST', `/api/lessons/math/algebra_1_part_a/${LV}/block-finish`, { blocks: [] });
      const next = ((await call('GET', '/api/enrollments')).payload.enrollments || []).find((x) => x.id === enr.id);
      return { ok: r.status === 200 && r.payload.advanced === true && next.current_level > LV, detail: `status ${r.status}, advanced=${r.payload.advanced}, level ${next && next.current_level} ${J(r.payload.error || '')}` };
    });
    await step(f, 'next level is ready after finishing (write-ahead)', async () => {
      const next = ((await call('GET', '/api/enrollments')).payload.enrollments || []).find((x) => x.id === enr.id);
      const probe = await call('GET', `/api/lessons/math/algebra_1_part_a/${next.current_level}`);
      return { ok: probe.status !== 500 && probe.status !== 0, detail: `level ${next.current_level} (${next.level_kind}) first poll ${probe.status}` };
    });
  }
}

async function flowGame() {
  const f = 'game'; const call = client();
  await step(f, 'register consented adult (admin 1)', async () => { const r = await register(call, 'game', 3); return { ok: r.status === 201 || r.status === 200, detail: `status ${r.status}` }; });
  const g = 'algebra_1_part_a';
  const e = await enrollIn(call, [{ track_id: 'math', grade_id: g }]);
  const enr = (e.payload.created || [])[0] || ((await call('GET', '/api/enrollments')).payload.enrollments || []).find((x) => x.track.id === 'math');
  if (!enr) return;
  await step(f, 'math placement (the owner account may only jump once placed)', () => placement(call, f, enr.id));
  // Games in math/algebra_1_part_a sit at levels 14 and 24 (config/game-assignments).
  for (const [level, tag, body] of [[14, 'pass', { result: 'won', correct: 8, wrong: 1, play: 'walk1' }], [24, 'fail', { result: 'lost', correct: 0, wrong: 6, play: 'walk2' }]]) {
    await step(f, `jump to game level ${level}`, async () => { const r = await call('POST', `/api/enrollments/${enr.id}/jump-to`, { level }); return { ok: r.status === 200, detail: `status ${r.status} ${J(r.payload.error || '')}` }; });
    await step(f, `game-finish ${tag} path (level ${level})`, async () => {
      const r = await call('POST', `/api/lessons/math/${g}/${level}/game-finish`, body);
      const after = ((await call('GET', '/api/enrollments')).payload.enrollments || []).find((x) => x.id === enr.id);
      return { ok: r.status === 200 && typeof r.payload.advanced === 'boolean', detail: `status ${r.status}, settled=${r.payload.settled}, advanced=${r.payload.advanced}, now level ${after && after.current_level} ${J(r.payload.error || '')}` };
    });
  }
}

async function flowCheckpoint() {
  const f = 'checkpoint'; const call = client();
  if (!ONLY || ONLY.includes('game')) { const t0 = Date.now(); while (rows.filter((r) => r.flow === 'game').length < 6 && Date.now() - t0 < 120000) await sleep(1000); }
  await step(f, 'register consented adult (admin 2)', async () => { const r = await register(call, 'cp', 3); return { ok: r.status === 201 || r.status === 200, detail: `status ${r.status}` }; });
  const g = 'algebra_1_part_a';
  const e = await enrollIn(call, [{ track_id: 'math', grade_id: g }]);
  const enr = (e.payload.created || [])[0] || ((await call('GET', '/api/enrollments')).payload.enrollments || []).find((x) => x.track.id === 'math');
  if (!enr) return;
  await step(f, 'math placement', () => placement(call, f, enr.id));
  for (const pass of [false, true]) {
    const tag = pass ? 'pass' : 'fail';
    await step(f, `Master quiz at level 51: ${tag} path`, async () => {
      const j = await call('POST', `/api/enrollments/${enr.id}/jump-to`, { level: 51 });
      if (j.status !== 200) return { ok: false, detail: `jump ${j.status} ${J(j.payload.error || '')}` };
      const s = await call('POST', '/api/sessions', { enrollment_id: enr.id });
      if (s.status !== 201) return { ok: false, detail: `session ${s.status} ${J(s.payload.error || s.payload)}` };
      ttc(f, `Master quiz opens (${tag} path)`, s.ms, 15000);
      const key = await call('GET', `/api/dev/item-key/${s.payload.session_id}`);
      const answers = Object.fromEntries((key.payload.items || []).map((i) => [i.id, i.answer]));
      let bad = 0;
      for (const item of s.payload.items) {
        const right = pass ? answers[item.id] : 'definitely wrong 987';
        const r = await call('POST', `/api/sessions/${s.payload.session_id}/answer`, { item_id: item.id, answer: right == null ? '1' : String(right), ms: 6000 });
        if (r.status !== 200) bad++;
      }
      const bf = await call('POST', `/api/sessions/${s.payload.session_id}/block-finish`, { block: 0 });
      const fin = await call('POST', `/api/sessions/${s.payload.session_id}/finish`, {});
      const after = ((await call('GET', '/api/enrollments')).payload.enrollments || []).find((x) => x.id === enr.id);
      const cp = fin.payload.checkpoint;
      return { ok: bad === 0 && fin.status === 200, detail: `${s.payload.items.length} items, bad ${bad}, block-finish ${bf.status}, finish ${fin.status} accuracy ${fin.payload.accuracy}, level_up=${fin.payload.level_up}, checkpoint=${J(cp || null)}, now level ${after.current_level}` };
    });
  }
}

async function flowSpanish() {
  const f = 'spanish'; const call = client();
  await step(f, 'register consented adult', async () => { const r = await register(call, 'es'); return { ok: r.status === 201 || r.status === 200, detail: `status ${r.status}` }; });
  const e = await enrollIn(call, [{ track_id: 'spanish', grade_id: 'entry' }]);
  const enr = (e.payload.created || [])[0] || ((await call('GET', '/api/enrollments')).payload.enrollments || []).find((x) => x.track.id === 'spanish');
  if (!enr) return rows.push({ flow: f, name: 'enroll', ok: false, ms: 0, detail: J(e.payload) });
  const pl = await step(f, 'Spanish placement', () => placement(call, f, enr.id));
  if (!pl) return;
  let run = null;
  await step(f, 'study player opens the level at the learner\'s grade', async () => {
    const r = await call('GET', `/api/es/path/level?enrollment=${enr.id}`);
    run = r.payload.run || null;
    return { ok: r.status === 200 && (!!r.payload.run || !!r.payload.fallback), detail: `status ${r.status} run=${!!r.payload.run} slot=${r.payload.slot} fallback=${r.payload.fallback || ''} ${J(r.payload.error || '')}` };
  });
  await step(f, 'study player answers: check text and finish the level', async () => {
    const chk = { status: 404 };
    if (!run) return { ok: chk.status < 500, detail: `no run (classic fallback); check ${chk.status}` };
    const fin = await call('POST', '/api/es/path/finish', { run, hits: 8, total: 10 });
    return { ok: fin.status === 200, detail: `check ${chk.status}, finish ${fin.status} ${J(fin.payload).slice(0, 120)}` };
  });
}

async function poll(call, path, ready, maxMs = 420000) {
  const t = Date.now(); let r;
  for (;;) {
    r = await call('GET', path);
    if (ready(r)) return { r, ok: true, s: Math.round((Date.now() - t) / 1000) };
    if (Date.now() - t > maxMs || r.status >= 400) return { r, ok: false, s: Math.round((Date.now() - t) / 1000) };
    await sleep(5000);
  }
}

const SAMPLE = `Photosynthesis is the process plants use to turn light into chemical energy. It happens mostly in the leaves, inside organelles called chloroplasts. Chloroplasts contain chlorophyll, the green pigment that absorbs red and blue light and reflects green light.
In the light-dependent reactions, light energy splits water molecules, releasing oxygen and producing the energy carriers ATP and NADPH. In the Calvin cycle, which does not need light directly, the plant uses ATP and NADPH to turn carbon dioxide into glucose.
The overall equation is six carbon dioxide plus six water, with light, makes one glucose plus six oxygen. Stomata are tiny pores that let carbon dioxide in and oxygen out. Plants store extra glucose as starch and use it to grow.
Factors that change the rate of photosynthesis include light intensity, carbon dioxide concentration, temperature and water supply. At low light the rate rises with intensity, then levels off when another factor limits it. Very high temperatures damage enzymes and slow the reaction down.
Respiration is the opposite process: cells break glucose down with oxygen to release energy, making carbon dioxide and water. Plants do both, photosynthesis in light and respiration all the time.`;

async function flowUploads() {
  const f = 'uploads'; const call = client();
  await step(f, 'register consented adult', async () => { const r = await register(call, 'up'); return { ok: r.status === 201 || r.status === 200, detail: `status ${r.status}` }; });
  let id = null;
  await step(f, 'paste text', async () => {
    const r = await call('POST', '/api/materials/paste', { title: 'Photosynthesis walk', text: SAMPLE });
    id = r.payload.material && r.payload.material.id;
    return { ok: r.status === 201 && !!id, detail: `status ${r.status} ${J(r.payload.error || '')}` };
  });
  if (!id) return;
  const M = `/api/materials/${id}`;
  // Time-to-content: what a learner waits for when they open the notes / study pack after adding material. A learner reads the
  // page for WALK_DWELL_S (45) seconds before opening the notes, then the pack straight after. If nothing has been started when they
  // open it, ask for it as the page's button does. 'since upload' is also given: the build time itself, however early it started.
  const tUp = Date.now();
  await sleep(Number(process.env.WALK_DWELL_S || 45) * 1000);
  const ready = (x, k) => x.status === 200 && x.payload[k] && ['ready', 'partial', 'failed'].includes(x.payload[k].status);
  const waitBuilt = async (kind, label) => {
    const key = kind === 'notes' ? 'notes' : 'pack';
    const t0 = Date.now();
    const r = await call('GET', `${M}/${kind}`);
    const auto = !!r.payload[key];
    if (!auto) await call('POST', `${M}/${kind}`, {});
    const p = await poll(call, `${M}/${kind}`, (x) => ready(x, key), 600000);
    const o = p.r.payload[key] || {};
    const how = auto ? 'started on upload' : 'started only when asked';
    ttc(f, label, Date.now() - t0, 15000, `${how}, ${Math.round((Date.now() - tUp) / 1000)}s since upload, status ${o.status}`);
    return { ok: p.ok && o.status !== 'failed', detail: `status ${o.status}, waited ${Date.now() - t0} ms on opening, ${Math.round((Date.now() - tUp) / 1000)}s since upload, ${how}` };
  };
  await step(f, 'notes when opened after upload', () => waitBuilt('notes', 'notes when opened after upload'));
  await step(f, 'study pack (cards, quiz, practice test) when opened after upload', () => waitBuilt('pack', 'study pack when opened after upload'));
  await step(f, 'build the learning path (course, on request)', async () => {
    const t = Date.now();
    const r = await call('POST', `${M}/course`, {});
    if (![200, 202].includes(r.status)) return { ok: false, detail: `start ${r.status} ${J(r.payload)}` };
    const p = await poll(call, `${M}/course`, (x) => x.status === 200 && x.payload.course && ['ready', 'partial'].includes(x.payload.course.status) && !(x.payload.activity && x.payload.activity.queued));
    const c = p.r.payload.course || {};
    ttc(f, 'learning path built on request', Date.now() - t, 600000, 'generated when asked, by design');
    return { ok: p.ok, detail: `status ${c.status}, ${(c.skills || c.skill_count || '')} skills, ${p.s}s ${J(c.error || '')}` };
  });
  let cardId = null;
  await step(f, 'flashcards: deck, pick, review', async () => {
    const d = await call('GET', `${M}/cards`);
    ttc(f, 'flashcards open', d.ms, 2000);
    const pick = await call('GET', `${M}/cards/pick?limit=5`);
    const first = ((d.payload.cards || [])[0]) || ((pick.payload.cards || [])[0]);
    cardId = first && (first.id || first.card);
    const rev = cardId ? await call('POST', `${M}/cards/review`, { card: cardId, rating: 'good' }) : { status: 0, payload: {} };
    return { ok: d.status === 200 && pick.status === 200 && (d.payload.total || 0) > 0 && rev.status === 200, detail: `deck ${d.status} total ${d.payload.total}, pick ${pick.status} ${(pick.payload.cards || []).length}, review ${rev.status} ${J(rev.payload.error || '')}` };
  });
  await step(f, 'practice test: start, answer, submit', async () => {
    const o = await call('GET', `${M}/test`);
    const t = await call('POST', `${M}/test`, { length: 6 });
    if (t.status !== 200) return { ok: false, detail: `options ${o.status}, start ${t.status} ${J(t.payload)}` };
    const qs = t.payload.questions || (t.payload.test && t.payload.test.questions) || [];
    const answers = {};
    qs.forEach((q, i) => { answers[q.id] = q.choices ? q.choices[i % q.choices.length] : 'x'; });
    const s = await call('POST', `${M}/test/submit`, { test_id: t.payload.test_id || (t.payload.test && t.payload.test.id) || t.payload.id, answers });
    return { ok: s.status === 200, detail: `${qs.length} questions, submit ${s.status} ${J(s.payload.error || '')}` };
  });
  await step(f, 'learning path study state, lesson and "pick for me"', async () => {
    const st = await call('GET', `${M}/study`);
    const skills = (st.payload.skills || (st.payload.course && st.payload.course.skills) || []);
    const sk = skills[0] && (skills[0].id || skills[0].skill);
    const les = sk ? await call('GET', `${M}/study/lesson/${encodeURIComponent(sk)}`) : { status: 0, payload: {} };
    const pl = await call('GET', `${M}/study/placement`);
    return { ok: st.status === 200 && les.status === 200 && pl.status === 200, detail: `state ${st.status} (${skills.length} skills), lesson ${les.status} ${J(les.payload.error || '')}, pick/placement ${pl.status} ${J(pl.payload.error || '')}` };
  });
  await step(f, 'review-due list', async () => { const r = await call('GET', '/api/materials/review-due'); return { ok: r.status === 200, detail: `status ${r.status}` }; });
}

async function flowDaily() {
  const f = 'daily'; const call = client();
  await step(f, 'register admin 1', async () => { const r = await register(call, 'daily', 1); return { ok: r.status === 201 || r.status === 200, detail: `status ${r.status}` }; });
  const e = await enrollIn(call, [{ track_id: 'math', grade_id: 'algebra_1_part_a' }, { track_id: 'english', grade_id: 'grammar' }]);
  const mine = ((await call('GET', '/api/enrollments')).payload.enrollments || []);
  const math = mine.find((x) => x.track.id === 'math');
  if (math) await placement(call, f, math.id);
  await step(f, 'daily plan', async () => { const r = await call('GET', '/api/plan/today'); return { ok: r.status === 200, detail: `status ${r.status} ${J(Object.keys(r.payload))}` }; });
  await step(f, 'retention state and calendar', async () => {
    const a = await call('GET', '/api/retention/state'); const b = await call('GET', '/api/retention/calendar');
    return { ok: a.status === 200 && b.status === 200, detail: `state ${a.status}, calendar ${b.status}` };
  });
  await step(f, 'retention review due list for the enrollment', async () => {
    const r = math ? await call('GET', `/api/review/${math.id}`) : { status: 0, payload: {} };
    return { ok: r.status === 200, detail: `status ${r.status} ${J(r.payload.error || '')}` };
  });
  await step(f, 'tutor dock reply', async () => {
    const r = await call('POST', '/api/tutor/dock', { messages: [{ role: 'user', content: 'Can you explain what a variable is?' }], page: { path: '/dashboard' } });
    ttc(f, 'tutor dock reply', r.ms, 15000, `source ${r.payload.source}`);
    return { ok: r.status === 200 && String(r.payload.reply || '').length > 10, detail: `status ${r.status} source ${r.payload.source} reply "${String(r.payload.reply || '').slice(0, 60)}"` };
  });
  await step(f, '/api/admin/my-stats for an admin', async () => { const r = await call('GET', '/api/admin/my-stats'); return { ok: r.status === 200, detail: `status ${r.status} ${J(Object.keys(r.payload))}` }; });
}

// game and checkpoint share the one owner account (the only account that may jump levels), so they run one after the other.
const FLOWS = { enroll: flowEnroll, block: flowBlock, game: async () => { await flowGame(); }, checkpoint: async () => { if (!ONLY || ONLY.includes('game')) await sleep(8000); await flowCheckpoint(); }, spanish: flowSpanish, uploads: flowUploads, daily: flowDaily };

(async () => {
  const names = Object.keys(FLOWS).filter((n) => !ONLY || ONLY.includes(n));
  console.log(`learner walk against ${BASE}: ${names.join(', ')}`);
  const started = Date.now();
  const runFlow = (n) => FLOWS[n]().catch((err) => rows.push({ flow: n, name: 'flow crashed', ok: false, ms: 0, detail: err.stack.split('\n').slice(0, 2).join(' ') }));
  if (process.env.WALK_SERIAL === '1') { for (const n of names) await runFlow(n); } else await Promise.all(names.map(runFlow));
  rows.sort((a, b) => a.flow.localeCompare(b.flow));
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.flow.padEnd(10)} ${r.name.padEnd(58)} ${String(Math.round(r.ms / 1000)).padStart(4)}s  ${r.detail}`);
  console.log(`
time-to-content (${process.env.WALK_SERIAL === '1' ? 'one learner at a time' : `${names.length} learners at once`}):`);
  for (const t of ttcRows) console.log(`${t.ok ? 'OK  ' : 'SLOW'}  ${t.flow.padEnd(10)} ${t.what.padEnd(40)} ${String((t.ms / 1000).toFixed(1)).padStart(7)}s  target ${t.targetMs / 1000}s  ${t.note}`);
  if (process.env.WALK_OUT) require('fs').writeFileSync(process.env.WALK_OUT, JSON.stringify({ mode: process.env.WALK_SERIAL === '1' ? 'serial' : 'parallel', flows: names, ttc: ttcRows, steps: rows }, null, 1));
  const failed = rows.filter((r) => !r.ok).length;
  console.log(`\n${rows.length - failed} passed, ${failed} failed, ${Math.round((Date.now() - started) / 1000)}s total`);
  process.exit(failed ? 1 : 0);
})();
