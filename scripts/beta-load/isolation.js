#!/usr/bin/env node
/**
 * Account safety under load, on a COPY of the data with models stubbed. Measured on this PC.
 *
 *   node scripts/beta-load/isolation.js [--learners 40] [--rounds 3] [--port 7870] [--out <file.json>]
 *
 * Every learner plants a marker of their own (in their name, their tutor messages and their uploaded notes). While all of them work at
 * once, every reply each one gets is searched for anyone else's marker or email. Then each learner asks for another learner's ids on
 * every route that takes one: anything but a refusal, or any reply holding the other's marker, is a finding. Also: signing in on the
 * same cookie at once, a deleted account's cookie, and two sign-ups racing for one email.
 * Exit 1 on any finding.
 */
const fs = require('fs');
const path = require('path');
const h = require('./harness');

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const N = Number(flag('learners', 40));
const ROUNDS = Number(flag('rounds', 3));
const PORT = Number(flag('port', 7870));
const SRC = path.resolve(flag('db', path.join(h.ROOT, 'data', 'db.json')));

const findings = [];
const markerOf = (i) => `ZQMARK${i}XQ`;
const emailOf = (i) => `iso${i}@example.test`;

class Who {
  constructor(i, url) { this.i = i; this.c = new h.Client(url, { ip: `10.60.${i >> 8}.${(i & 255) || 1}` }); this.replies = 0; }

  scan(label, res) {
    this.replies++;
    const text = typeof res.json === 'string' ? res.json : JSON.stringify(res.json || '');
    const m = text.match(/ZQMARK(\d+)XQ/g) || [];
    for (const x of m) { if (x !== markerOf(this.i)) findings.push({ kind: 'marker in reply', learner: this.i, of: x, route: label }); }
    const e = text.match(/iso(\d+)@example\.test/g) || [];
    for (const x of e) { if (x !== emailOf(this.i)) findings.push({ kind: 'email in reply', learner: this.i, of: x, route: label }); }
    return res;
  }

  async get(u, l) { return this.scan(l || u, await this.c.get(u)); }

  async post(u, b, l) { return this.scan(l || u, await this.c.post(u, b)); }

  async setup() {
    await this.c.post('/api/consent/age', { birth_year: 1996, birth_month: 5, country: 'US' });
    const r = await this.c.post('/api/auth/register', { email: emailOf(this.i), password: 'load-test-password', display_name: `L ${markerOf(this.i)}`.slice(0, 32) });
    if (r.status !== 201) throw new Error(`register ${r.status} ${JSON.stringify(r.json)}`);
    this.id = r.json.user.id;
    const e = await this.c.post('/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }] });
    this.enrollment = e.json.created[0].id;
    const p = await this.c.post('/api/placement/start', { enrollment_id: this.enrollment });
    this.session = p.json.session_id;
    this.item = p.json.items[0].id;
    await this.c.post('/api/placement/answer', { session_id: this.session, item_id: this.item, answer: 'x', ms: 3000 });
    const m = await this.c.post('/api/materials/paste', { title: `Notes ${markerOf(this.i)}`, text: `${markerOf(this.i)} tides are caused by the moon and the sun. `.repeat(40) });
    this.material = m.json && m.json.material && m.json.material.id;
    await this.c.post('/api/tutor/dock', { messages: [{ role: 'user', content: `My secret word is ${markerOf(this.i)}` }], page: { path: '/dashboard' } });
    const s = await this.c.post('/api/retention/study/start', {});
    this.study = s.json && (s.json.id || (s.json.session && s.json.session.id));
  }

  async work() {
    for (let k = 0; k < 4; k++) {
      await Promise.all([
        this.get('/api/auth/me'), this.get('/api/progress'), this.get('/api/plan/today'), this.get('/api/placement/paths'), this.get('/api/profile'),
        this.get('/api/materials'), this.get('/api/tutor/memory'), this.get('/api/tutor/facts'), this.get('/api/retention/state'), this.get('/api/enrollments'),
        this.get(`/api/path/${this.enrollment}?view=page`), this.get(`/api/review/${this.enrollment}`), this.get('/api/account/export'),
        this.post('/api/tutor/dock', { messages: [{ role: 'user', content: `Again ${markerOf(this.i)}: what did I tell you?` }], page: { path: '/dashboard' } }),
        this.get('/api/materials/review-due'),
      ]);
    }
  }

  /** Ask for another learner's things. Only a refusal is right; a 2xx must at least hold none of their data (scan covers it). */
  async trespass(o) {
    const reads = [
      `/api/path/${o.enrollment}`, `/api/placement/path/${o.enrollment}`, `/api/review/${o.enrollment}`, `/api/consolidation/${o.enrollment}`, `/api/sessions/${o.session}`,
      `/api/items/${o.item}/grading`, `/api/materials/${o.material}`, `/api/materials/${o.material}/course`, `/api/materials/${o.material}/pack`, `/api/materials/${o.material}/notes`,
      `/api/materials/${o.material}/podcast`, `/api/materials/${o.material}/cards`, `/api/materials/${o.material}/study`, `/api/materials/${o.material}/test`,
      `/api/placement/quick-check/${o.enrollment}`, `/api/placement/test-out/${o.enrollment}`, `/api/coverage/${o.enrollment}/held`,
    ];
    const writes = [
      [`/api/sessions/${o.session}/answer`, { item_id: o.item, answer: 'x', ms: 1000 }], [`/api/sessions/${o.session}/finish`, {}], [`/api/placement/answer`, { session_id: o.session, item_id: o.item, answer: 'x', ms: 1000 }],
      [`/api/placement/finish`, { session_id: o.session }], [`/api/items/${o.item}/coach`, { messages: [] }], [`/api/items/${o.item}/ask`, { question: 'why' }], [`/api/items/${o.item}/report`, { reason: 'x' }],
      [`/api/materials/${o.material}/course`, {}], [`/api/materials/${o.material}/pack`, {}], [`/api/materials/${o.material}/notes`, {}], [`/api/materials/${o.material}/cards`, { front: 'a', back: 'b' }], ['/api/sessions', { enrollment_id: o.enrollment }],
      [`/api/review/${o.enrollment}/start`, {}], ['/api/placement/start', { enrollment_id: o.enrollment }],
    ];
    const flagIt = (route, r) => {
      if (r.status >= 200 && r.status < 300) findings.push({ kind: 'another learner\'s id answered 2xx', learner: this.i, of: o.i, route: route.replace(/\d+/g, ':id'), status: r.status, sample: JSON.stringify(r.json).slice(0, 160) });
    };
    for (const u of reads) flagIt(u, await this.get(u));
    for (const [u, b] of writes) flagIt(u, await this.post(u, b));
    const del = await this.c.call('DELETE', `/api/materials/${o.material}`);
    flagIt('DELETE material', del);
    // Admin and owner surfaces, as a learner.
    for (const u of ['/api/admin/learners', '/api/admin/cost-tracker', '/api/recruit/stats', `/api/admin/learners/${o.id}`, `/api/consent/admin/rows/${o.id}`, '/api/admin/speed-proof']) {
      const r = await this.get(u);
      if (r.status === 200) findings.push({ kind: 'admin route answered a learner', learner: this.i, route: u.replace(/\d+/g, ':id') });
    }
  }
}

(async () => {
  const dir = h.runDir('isolation');
  const dbFile = path.join(dir, 'db.json');
  fs.copyFileSync(SRC, dbFile); h.copyLedgers(dir);
  const stub = h.startStub(PORT + 1, { latency: 100, jitter: 200, dir });
  const env = h.serverEnv({ dir, port: PORT, stubPort: PORT + 1, dbFile, extra: { WRITE_AHEAD: 'off' } });
  const srv = await h.startServer(env);
  const out = { measured_on: 'this PC', learners: N, rounds: ROUNDS };
  const all = Array.from({ length: N }, (_, i) => new Who(i + 1, srv.url));
  for (const w of all) await w.setup();
  for (let r = 0; r < ROUNDS; r++) await Promise.all(all.map((w) => w.work()));
  out.replies_scanned = all.reduce((n, w) => n + w.replies, 0);
  await Promise.all(all.map((w, i) => w.trespass(all[(i + 7) % N])));
  await Promise.all(all.map((w) => w.work()));
  out.replies_scanned = all.reduce((n, w) => n + w.replies, 0);

  // The material the others asked to delete must still be there.
  const mine = await all[7].get(`/api/materials/${all[7].material}`);
  if (mine.status !== 200) findings.push({ kind: 'a trespasser deleted a material', status: mine.status });

  // Two sign-ups racing for one email: bcrypt yields between the check and the insert.
  const racers = Array.from({ length: 8 }, (_, i) => new h.Client(srv.url, { ip: `10.61.0.${i + 1}` }));
  await Promise.all(racers.map((c) => c.post('/api/consent/age', { birth_year: 1996, birth_month: 5, country: 'US' })));
  const raced = await Promise.all(racers.map((c) => c.post('/api/auth/register', { email: 'race@example.test', password: 'load-test-password', display_name: 'Race' })));
  const won = raced.filter((r) => r.status === 201);
  out.signup_race = { created: won.length, ids: won.map((r) => r.json.user.id) };
  if (won.length > 1) findings.push({ kind: 'one email made several accounts in a race', accounts: won.length });

  // One cookie, sign-ins as two accounts at once: the last one wins, and the reply must match the cookie it set.
  const a = all[0]; const b = all[1];
  const shared = new h.Client(srv.url, { ip: '10.62.0.1' });
  const [l1, l2] = await Promise.all([shared.post('/api/auth/login', { email: emailOf(a.i), password: 'load-test-password' }), new h.Client(srv.url, { ip: '10.62.0.2' }).post('/api/auth/login', { email: emailOf(b.i), password: 'load-test-password' })]);
  out.login_race = { a: l1.status, b: l2.status, a_is_a: l1.json && l1.json.user && l1.json.user.id === a.id, b_is_b: l2.json && l2.json.user && l2.json.user.id === b.id };

  // A deleted account's cookie: nobody home, and the id is not given to anyone else.
  const v = all[N - 1];
  const delReply = await v.c.call('POST', '/api/account/delete', { confirm: 'DELETE', password: 'load-test-password' });
  out.delete_status = delReply.status; out.delete_says = String((delReply.json && delReply.json.error) || '').slice(0, 80);
  const me = await v.c.get('/api/auth/me');
  out.deleted_cookie_user = me.json && me.json.user ? me.json.user.id : null;
  const nw = new h.Client(srv.url, { ip: '10.63.0.1' });
  await nw.post('/api/consent/age', { birth_year: 1996, birth_month: 5, country: 'US' });
  const nr = await nw.post('/api/auth/register', { email: 'after@example.test', password: 'load-test-password', display_name: 'After' });
  out.new_id_reused_deleted = nr.json && nr.json.user && nr.json.user.id === v.id;
  if (out.new_id_reused_deleted) findings.push({ kind: 'a new account took a deleted account\'s id' });

  srv.child.kill('SIGKILL'); stub.kill();
  // Group the findings: the same hole, reported by many learners, is one line.
  const grouped = {};
  for (const f of findings) { const k = `${f.kind} | ${f.route || ''}`; (grouped[k] = grouped[k] || { n: 0, sample: f }).n++; }
  out.findings = Object.entries(grouped).map(([k, v]) => ({ what: k, n: v.n, sample: v.sample.sample || v.sample.of || null }));
  console.log(JSON.stringify({ ...out, findings: out.findings.length }));
  for (const f of out.findings) console.log(`FINDING ${f.n}x ${f.what} ${f.sample ? String(f.sample).slice(0, 120) : ''}`);
  const o = flag('out'); if (o) fs.writeFileSync(o, JSON.stringify(out, null, 1));
  process.exit(findings.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
