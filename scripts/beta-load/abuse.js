#!/usr/bin/env node
/**
 * Abuse and limits, on a COPY of the data with models stubbed. Measured on this PC.
 *
 *   node scripts/beta-load/abuse.js [--port 7850] [--out <file.json>] [--only classroom,flood,...]
 *
 *  classroom   30 learners behind one address: sign up, sign in, tutor, lessons. Who gets a 429, and on what?
 *  flood       sign-ups from one address and from many; what the loop does while passwords hash
 *  upload      over-limit file, many big files at once, oversized paste; memory seen
 *  tutorspam   one learner sends messages as fast as it can; what reaches a model, what it costs, where it stops
 *  caps        the per-learner daily caps (forced low): what the learner sees, whether the ledgers agree with ai_usage
 */
const fs = require('fs');
const path = require('path');
const h = require('./harness');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(flag('port', 7850));
const only = flag('only', 'classroom,flood,upload,tutorspam,caps').split(',');
const SRC = path.resolve(flag('db', path.join(h.ROOT, 'data', 'db.json')));

async function boot(label, extra = {}, stubOpts = { latency: 300, jitter: 300 }) {
  const dir = h.runDir(`abuse-${label}`);
  const dbFile = path.join(dir, 'db.json');
  fs.copyFileSync(SRC, dbFile);
  h.copyLedgers(dir);
  const stub = h.startStub(PORT + 1, { ...stubOpts, dir });
  const env = h.serverEnv({ dir, port: PORT, stubPort: PORT + 1, dbFile, extra: { WRITE_AHEAD: 'off', ...extra } });
  const srv = await h.startServer(env);
  return {
    dir, dbFile, url: srv.url, env,
    probe: () => h.probeSummary(path.join(dir, 'probe.jsonl'), 0),
    stop: async () => {
      srv.child.kill('SIGKILL'); stub.kill();
      await new Promise((r) => { srv.child.once('exit', r); setTimeout(r, 4000); });
    },
  };
}

const tally = () => ({ ok: 0, limited: 0, other: 0, codes: {} });
function count(t, r) { if (r.status >= 200 && r.status < 300) t.ok++; else if (r.status === 429) t.limited++; else t.other++; t.codes[r.status] = (t.codes[r.status] || 0) + 1; }

async function signUp(c, email, year = 1995) {
  await c.post('/api/consent/age', { birth_year: year, birth_month: 3, country: 'US' });
  return c.post('/api/auth/register', { email, password: 'load-test-password', display_name: 'Abuse Test' });
}

async function classroom() {
  const s = await boot('classroom');
  const out = { learners: 30, note: 'all on one address' };
  const ip = '10.77.0.1';
  const cs = Array.from({ length: 30 }, () => new h.Client(s.url, { ip }));
  const reg = tally();
  const made = [];
  for (let i = 0; i < cs.length; i++) { const r = await signUp(cs[i], `class${i}@example.test`); count(reg, r); if (r.status === 201) made.push({ c: cs[i], i }); }
  out.sign_up = reg;
  const login = tally();
  for (let k = 0; k < 3; k++) for (let i = 0; i < 30; i++) { const c = new h.Client(s.url, { ip }); const r = await c.post('/api/auth/login', { email: `class${i}@example.test`, password: 'load-test-password' }); count(login, r); }
  out.login_3x_each = login;
  // The rest of the class would be stopped at the door, so the routes are tried by those who got in, doing what 30 would do.
  const use = made.length ? made : [];
  const scale = Math.ceil(30 / Math.max(1, use.length));
  const tutorT = tally(); const plans = tally(); const sessions = tally(); const paste = tally();
  await Promise.all(use.map(async ({ c }) => {
    for (let k = 0; k < 8 * scale; k++) count(tutorT, await c.post('/api/tutor/dock', { messages: [{ role: 'user', content: `Question ${k}` }], page: { path: '/dashboard' } }));
    for (let k = 0; k < 8 * scale; k++) count(plans, await c.get('/api/plan/today'));
    const e = await c.post('/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }] });
    const id = e.json && e.json.created && e.json.created[0] && e.json.created[0].id;
    for (let k = 0; k < 4 * scale && id; k++) count(sessions, await c.post('/api/placement/start', { enrollment_id: id }));
    for (let k = 0; k < 2 * scale; k++) count(paste, await c.post('/api/materials/paste', { title: 'x', text: 'A short note about tides and what they do. '.repeat(30) }));
  }));
  Object.assign(out, { signed_up: made.length, tutor_messages: tutorT, plan_today: plans, placement_start: sessions, paste });
  await s.stop();
  return out;
}

async function flood() {
  const s = await boot('flood');
  const out = {};
  const one = tally();
  const c0 = new h.Client(s.url, { ip: '10.70.0.1' });
  for (let i = 0; i < 40; i++) { const c = new h.Client(s.url, { ip: '10.70.0.1' }); count(one, await signUp(c, `flood${i}@example.test`)); }
  out.one_address = one; void c0;
  const many = tally();
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 200 }, async (_, i) => { const c = new h.Client(s.url, { ip: `10.71.${i >> 8}.${(i & 255) || 1}` }); count(many, await signUp(c, `spread${i}@example.test`)); }));
  out.two_hundred_addresses = { ...many, seconds: Math.round((Date.now() - t0) / 1000) };
  const p = s.probe();
  out.loop = p && { lag_max_ms: p.lag_max_ms, secs_with_stall_over_200ms: p.secs_with_stall_over_200ms, busy: p.loop_busy_median };
  const d = JSON.parse(fs.readFileSync(s.dbFile, 'utf8'));
  out.gate_note = 'no invite is asked for: any address may make an account';
  out.accounts_made = d.users.filter((u) => /flood|spread/.test(String(u.email))).length;
  await s.stop();
  return out;
}

const pdfish = (mb) => Buffer.alloc(mb * 1048576, 0x20);
async function upload() {
  const s = await boot('upload');
  const out = {};
  const c = new h.Client(s.url, { ip: '10.72.0.1' });
  await signUp(c, 'big@example.test');
  const big = await c.call('POST', '/api/materials?name=big.txt', undefined, null, { raw: pdfish(25) });
  out.file_25mb = { status: big.status, says: (big.json && big.json.error) || null };
  const ok = await c.call('POST', '/api/materials?name=near.txt', undefined, null, { raw: Buffer.from('Tides and the moon. '.repeat(900000)) });
  out.text_18mb = { status: ok.status, ms: Math.round(ok.ms), says: (ok.json && (ok.json.error || ok.json.code)) || 'accepted' };
  const paste = await c.post('/api/materials/paste', { title: 'x', text: 'y'.repeat(3.5 * 1048576) });
  out.paste_3_5mb = { status: paste.status, says: (paste.json && paste.json.error) || null };
  // Several learners each sending a 180 MB "video" at once: the body is held in memory.
  const buf = Buffer.alloc(180 * 1048576, 0); buf.write('ftypisom', 4, 'latin1');
  const ms = [];
  await Promise.all(Array.from({ length: 6 }, async (_, i) => {
    const u = new h.Client(s.url, { ip: `10.73.0.${i + 1}` });
    await signUp(u, `vid${i}@example.test`);
    const r = await u.call('POST', '/api/materials/video?name=a.mp4', undefined, null, { raw: buf });
    ms.push(r.status);
  }));
  const p = s.probe();
  out.six_180mb_videos = { statuses: ms, rss_mb_max: p && p.rss_mb_max, lag_max_ms: p && p.lag_max_ms, service_memory_limit_mb: 800 };
  await s.stop();
  return out;
}

function ledgerSpent(dir) {
  const out = {};
  for (const n of h.LEDGERS) { try { const j = JSON.parse(fs.readFileSync(path.join(dir, `${n}-ledger.json`), 'utf8')); out[n] = Number(j.settled_usd) + Object.values(j.reservations || {}).reduce((a, r) => a + Number(r.usd || 0), 0); } catch { /* none */ } }
  return out;
}

async function tutorspam() {
  const s = await boot('tutorspam');
  const before = ledgerSpent(s.dir);
  const c = new h.Client(s.url, { ip: '10.74.0.1' });
  const r = await signUp(c, 'spam@example.test');
  const id = r.json.user.id;
  const t = tally();
  const sources = {};
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) {
    const a = await c.post('/api/tutor/dock', { messages: [{ role: 'user', content: `Why is the answer ${i}? Please explain in full.` }], page: { path: '/dashboard' } });
    count(t, a);
    if (a.json && a.json.source) sources[a.json.source] = (sources[a.json.source] || 0) + 1;
    if (a.status === 429) { t.first_429_after = i; break; }
  }
  const spent = ledgerSpent(s.dir);
  const delta = Object.fromEntries(Object.entries(spent).map(([k, v]) => [k, Number((v - before[k]).toFixed(5))]).filter(([, v]) => v));
  let stats = null;
  try { stats = await (await fetch(`http://127.0.0.1:${PORT + 1}/__stub/stats`)).json(); } catch { /* */ }
  await h.sleep(1200);
  const d = JSON.parse(fs.readFileSync(s.dbFile, 'utf8'));
  const usage = d.ai_usage.find((u) => u.user_id === id);
  const out = { messages: t, sources, seconds: Math.round((Date.now() - t0) / 1000), ledger_delta_usd: delta, ai_usage_row: usage && { cents: usage.cents, calls: usage.calls }, model_calls: stats && Object.fromEntries(Object.entries(stats.byProvider).map(([k, v]) => [k, v.calls])) };
  await s.stop();
  return out;
}

async function caps() {
  const s = await boot('caps', { AI_DAILY_CALLS_PER_USER: '5', AI_DAILY_CENTS_PER_USER: '25' });
  const c = new h.Client(s.url, { ip: '10.75.0.1' });
  await signUp(c, 'cap@example.test');
  const seen = [];
  for (let i = 0; i < 9; i++) {
    const a = await c.post('/api/tutor/dock', { messages: [{ role: 'user', content: `Explain step ${i}` }], page: { path: '/dashboard' } });
    seen.push({ status: a.status, source: a.json && a.json.source, reply: String((a.json && a.json.reply) || '').slice(0, 90) });
  }
  await h.sleep(1000);
  const out = { daily_call_cap_forced_to: 5, replies: seen.slice(3, 8) };
  await s.stop();
  return out;
}

(async () => {
  const results = {};
  const tests = { classroom, flood, upload, tutorspam, caps };
  for (const name of only) {
    try { results[name] = await tests[name](); } catch (e) { results[name] = { crashed: e.message }; }
    console.log(name, JSON.stringify(results[name]).slice(0, 900));
  }
  const out = flag('out');
  if (out) fs.writeFileSync(out, JSON.stringify({ measured_on: 'this PC', results }, null, 1));
  process.exit(0);
})();
