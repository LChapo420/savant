#!/usr/bin/env node
/**
 * What a learner sees when the money or the models stop. Each case is forced on a COPY of the data, models stubbed. Measured on this PC.
 *
 *   node scripts/beta-load/stops.js [--port 7890] [--out <file.json>] [--only a,b]
 *
 * Cases:
 *   normal          everything up (the control)
 *   paid_stopped    every prepaid ledger at its stop (cap forced to $0): only the free NVIDIA key answers
 *   nvidia_down     the free key answers 503, the paid ones work
 *   all_down        every provider answers 503
 *   all_hang        every provider accepts and never answers (timeouts, the worst kind of outage)
 *   nov14           the date gate has passed: Gonka, Grokified, Lyceum, ZeroGPU leave learners by date; under-13s lose Munito and Coral
 *   nov14_strict    as nov14, and the owner has also said no to Munito, Coral and NVIDIA: nothing outside may see learner data
 * For an adult and for an under-13 account (with parent consent recorded, then without): tutor, question coach, first lesson, upload.
 */
const fs = require('fs');
const path = require('path');
const h = require('./harness');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(flag('port', 7890));
const SRC = path.resolve(flag('db', path.join(h.ROOT, 'data', 'db.json')));
const only = flag('only', 'normal,paid_stopped,nvidia_down,all_down,all_hang,nov14,nov14_strict').split(',');
const PAST = '2026-11-01T00:00:00Z';
const CASES = {
  normal: {},
  paid_stopped: { env: { GONKA_CAP_USD: '0', MUNITO_CAP_USD: '0', CORAL_CAP_USD: '0', GROKIFIED_CAP_USD: '0', LYCEUM_CAP_USD: '0', ZEROGPU_CAP_USD: '0' } },
  nvidia_down: { stub: { down: ['nvidia'] } },
  all_down: { stub: { mode: 'down' } },
  all_hang: { stub: { mode: 'slow' }, env: { POOL_TIMEOUT_MS: '30000' } },
  nov14: { env: { GONKA_LEARNER_UNTIL: PAST, GROKIFIED_LEARNER_UNTIL: PAST, LYCEUM_LEARNER_UNTIL: PAST, ZEROGPU_LEARNER_UNTIL: PAST, MUNITO_CHILD_UNTIL: PAST } },
  nov14_strict: { env: { GONKA_LEARNER_UNTIL: PAST, GROKIFIED_LEARNER_UNTIL: PAST, LYCEUM_LEARNER_UNTIL: PAST, ZEROGPU_LEARNER_UNTIL: PAST, MUNITO_CHILD_UNTIL: PAST, MUNITO_LEARNER: 'off', CORAL_LEARNER: 'off', NVIDIA_API_KEY: '' } },
};

async function adult(url, email) {
  const c = new h.Client(url, { ip: `10.50.0.${Math.floor(Math.random() * 200) + 1}` });
  await c.post('/api/consent/age', { birth_year: 1995, birth_month: 3, country: 'US' });
  await c.post('/api/auth/register', { email, password: 'load-test-password', display_name: 'Stop Test' });
  return c;
}

async function child(url, name) {
  const c = new h.Client(url, { ip: `10.51.0.${Math.floor(Math.random() * 200) + 1}` });
  await c.post('/api/consent/age', { birth_year: new Date().getUTCFullYear() - 11, birth_month: 3, country: 'US' });
  await c.post('/api/auth/register', { username: name, parent_email: `${name}-parent@example.test`, password: 'load-test-password', display_name: 'Kid' });
  return c;
}

const say = (t, n = 120) => String(t == null ? '' : t).replace(/\s+/g, ' ').slice(0, n);

async function walk(c, { upload = true } = {}) {
  const out = {};
  const t = await c.post('/api/tutor/dock', { messages: [{ role: 'user', content: 'Why do we flip the sign when dividing by a negative?' }], page: { path: '/dashboard' }, input_mode: 'text' });
  out.tutor = { status: t.status, ms: Math.round(t.ms), source: t.json && t.json.source, reply: say(t.json && (t.json.reply || t.json.error)) };
  const e = await c.post('/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }] });
  const id = e.json && e.json.created && e.json.created[0] && e.json.created[0].id;
  if (!id) { out.enrol = { status: e.status, says: say(e.json && e.json.error) }; return out; }
  const p = await c.post('/api/placement/start', { enrollment_id: id });
  out.placement = { status: p.status, items: p.json && p.json.items && p.json.items.length, says: say(p.json && p.json.error) };
  if (p.json && p.json.items) {
    for (const it of p.json.items) await c.post('/api/placement/answer', { session_id: p.json.session_id, item_id: it.id, answer: it.choices ? it.choices[0] : '1', ms: 4000 });
    const f = await c.post('/api/placement/finish', { session_id: p.json.session_id });
    out.placed_level = f.json && f.json.result && f.json.result.placedLevel;
    const level = out.placed_level || 1;
    const t0 = Date.now();
    let r = await c.get(`/api/lessons/math/algebra_1_part_a/${level}`);
    let polls = 0;
    while (r.status === 202 && polls < 12) { await h.sleep(5000); r = await c.get(`/api/lessons/math/algebra_1_part_a/${level}`); polls++; }
    const m = r.json && r.json.meta;
    out.lesson = { status: r.status, wait_ms: Date.now() - t0, basis: r.json && r.json.basis, tailored: m ? !!m.tailored : null, ordinary: !!(r.json && r.json.ordinary), says: say(r.json && (r.json.error || r.json.message || r.json.note)), blocks: r.json && r.json.plan && r.json.plan.entries ? r.json.plan.entries.length : null };
    const s = await c.post('/api/sessions', { enrollment_id: id, ...(r.json && r.json.ordinary ? { ordinary: true } : {}) });
    if (s.json && s.json.items && s.json.items[0]) {
      const k = await c.post(`/api/items/${s.json.items[0].id}/coach`, { messages: [] });
      out.coach = { status: k.status, ms: Math.round(k.ms), source: k.json && k.json.source, reply: say(k.json && (k.json.reply || k.json.error)) };
    }
  }
  if (upload) {
    const text = Array.from({ length: 60 }, (_, k) => `Point ${k} about tides: the moon pulls the sea, and the sun adds a smaller pull, which is why spring tides come at new and full moon.`).join(' ');
    const m = await c.post('/api/materials/paste', { title: 'Tides', text });
    out.upload = { status: m.status, says: say(m.json && m.json.error) };
    const mid = m.json && m.json.material && m.json.material.id;
    if (mid) {
      await c.post(`/api/materials/${mid}/course`, {});
      let g = null;
      for (let i = 0; i < 18; i++) {
        await h.sleep(5000);
        g = await c.get(`/api/materials/${mid}/course`);
        const st = g.json && g.json.course && g.json.course.status;
        if (st && st !== 'building' && st !== 'queued') break;
      }
      const cj = g && g.json && g.json.course;
      out.course = { status: g && g.status, course_status: cj && cj.status, reason: say(cj && (cj.error || cj.reason || cj.message)), skills: cj && cj.skills && cj.skills.length };
      const pk = await c.get(`/api/materials/${mid}/pack`);
      out.pack = { status: pk.status, pack_status: pk.json && pk.json.pack && pk.json.pack.status, says: say(pk.json && pk.json.pack && (pk.json.pack.error || pk.json.pack.reason)) };
    }
  }
  return out;
}

async function runCase(name) {
  const spec = CASES[name];
  const dir = h.runDir(`stop-${name}`);
  const dbFile = path.join(dir, 'db.json');
  fs.copyFileSync(SRC, dbFile); h.copyLedgers(dir);
  const stub = h.startStub(PORT + 1, { latency: 400, jitter: 400, dir });
  await h.sleep(800);
  if (spec.stub) await fetch(`http://127.0.0.1:${PORT + 1}/__stub`, { method: 'POST', body: JSON.stringify(spec.stub) });
  const env = h.serverEnv({ dir, port: PORT, stubPort: PORT + 1, dbFile, extra: { ...(spec.env || {}) } });
  const srv = await h.startServer(env);
  let died = false;
  srv.child.on('exit', () => { died = true; });
  const out = { case: name };
  const a = await adult(srv.url, `stop-${name}@example.test`);
  out.adult = await walk(a);
  const k = await child(srv.url, `kid${Date.now() % 100000}`);
  out.child_no_consent = await walk(k, { upload: false });
  try {
    const h2 = await new h.Client(srv.url).get('/api/health');
    out.health = { status: h2.status, ok: h2.json && h2.json.ok, ai: h2.json && h2.json.ai };
  } catch { /* */ }
  let st = null;
  try { st = await (await fetch(`http://127.0.0.1:${PORT + 1}/__stub/stats`)).json(); } catch { /* */ }
  out.model_calls = st && Object.fromEntries(Object.entries(st.byProvider).map(([p, v]) => [p, v.calls]));
  out.server_alive = !died;
  srv.child.kill('SIGKILL'); stub.kill();
  await new Promise((r) => { srv.child.once('exit', r); setTimeout(r, 3000); });
  return out;
}

(async () => {
  const results = [];
  for (const name of only) {
    try { const r = await runCase(name); results.push(r); console.log(JSON.stringify(r).slice(0, 1400)); } catch (e) { results.push({ case: name, crashed: e.message }); console.log(name, 'CRASHED', e.message); }
  }
  const o = flag('out'); if (o) fs.writeFileSync(o, JSON.stringify({ measured_on: 'this PC', results }, null, 1));
  process.exit(0);
})();
