/**
 * One scripted learner doing the real flow over HTTP, the calls the pages make: the age screen and sign-up, enrol, placement,
 * dashboard, a study session with heartbeats, a level's lesson page, a sitting (answers, block-finish, finish), the review, the
 * tutor dock, an upload. Extreme learners are in the mix (very fast, very slow, always wrong, never finishing, child accounts).
 *
 * Isolation is checked on the way: every reply that names a user id must be this learner's.
 */
const { Client, sleep } = require('./harness');

const TRACKS = [
  ['math', 'algebra_1_part_a'], ['english', null], ['iq', 'foundations'], ['reading', 'foundations'],
];
const TOPICS = ['tides and the moon', 'the French Revolution', 'cell membranes', 'supply and demand', 'the water cycle', 'Roman roads', 'plate tectonics'];

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function personaOf(i, r) {
  // Held-out mix: mostly ordinary, 15% at the tails, and some children.
  const x = r();
  if (x < 0.05) return { kind: 'speedrunner', think: 0.15, accuracy: 0.95, tutor: 0.02, upload: 0 };
  if (x < 0.10) return { kind: 'slow', think: 3, accuracy: 0.5, tutor: 0.3, upload: 0.5 };
  if (x < 0.13) return { kind: 'always_wrong', think: 0.6, accuracy: 0, tutor: 0.5, upload: 0 };
  if (x < 0.15) return { kind: 'quitter', think: 1, accuracy: 0.6, tutor: 0, upload: 0, quits: true };
  if (x < 0.25) return { kind: 'child', think: 1.2, accuracy: 0.7, tutor: 0.1, upload: 0, child: true };
  return { kind: 'ordinary', think: 0.6 + r() * 1.2, accuracy: 0.45 + r() * 0.5, tutor: 0.08, upload: 0.15 };
}

function answerFor(item, wantRight, r) {
  if (item.format === 'multiple_choice' && item.choices && item.choices.length) {
    return wantRight ? item.choices[Math.floor(r() * item.choices.length)] : item.choices[item.choices.length - 1];
  }
  return wantRight ? '42' : 'not sure';
}

class Learner {
  constructor(i, base, metrics, opts = {}) {
    this.i = i; this.opts = opts; this.r = rng(i * 7919 + (opts.seed || 1));
    this.persona = opts.persona || personaOf(i, this.r);
    const ip = opts.ip || `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${(i & 255) || 1}`;
    this.c = new Client(base, { ip, metrics });
    this.metrics = metrics; this.id = null;
    this.email = `load${opts.tag || ''}${i}@example.test`;
    this.username = `load${opts.tag || ''}${i}`;
    this.password = 'load-test-password';
    this.thinkMs = opts.thinkMs === undefined ? 8000 : opts.thinkMs;
  }

  think(f = 1) { return sleep(Math.max(5, this.thinkMs * this.persona.think * f * (0.5 + this.r()))); }

  /** Every reply that says whose it is must be ours. */
  mine(label, res) {
    const j = res.json; if (!j || typeof j !== 'object' || !this.id) return res;
    const u = j.user && j.user.id; if (u && u !== this.id) this.metrics.note('LEAK', `${label}: got user ${u}, am ${this.id}`);
    if (j.user_id && j.user_id !== this.id) this.metrics.note('LEAK', `${label}: user_id ${j.user_id}, am ${this.id}`);
    return res;
  }

  async get(url, label) { return this.mine(label, await this.c.get(url, label)); }

  async post(url, body, label) { return this.mine(label, await this.c.post(url, body, label)); }

  async signUp() {
    await this.c.get('/', 'GET / (page)');
    await this.c.get('/api/catalog', 'GET /api/catalog');
    await this.c.get('/api/consent/config', 'GET /api/consent/config');
    const year = this.persona.child ? new Date().getUTCFullYear() - 11 : new Date().getUTCFullYear() - 16 - Math.floor(this.r() * 30);
    await this.post('/api/consent/age', { birth_year: year, birth_month: 1 + Math.floor(this.r() * 12), country: 'US' }, 'POST /api/consent/age');
    const body = this.persona.child
      ? { username: this.username, parent_email: `parent${this.i}@example.test`, password: this.password, display_name: `Kid ${this.i}` }
      : { email: this.email, password: this.password, display_name: `Learner ${this.i}` };
    const r = await this.c.post('/api/auth/register', body, 'POST /api/auth/register');
    if (r.status !== 201) { this.metrics.note(`register ${r.status}`, r.json); return false; }
    this.id = r.json.user.id;
    await this.get('/api/auth/me', 'GET /api/auth/me');
    return true;
  }

  async dashboard() {
    await Promise.all([
      this.get('/api/progress', 'GET /api/progress'),
      this.get('/api/plan/today', 'GET /api/plan/today'),
      this.get('/api/placement/paths', 'GET /api/placement/paths'),
      this.get('/api/materials/review-due', 'GET /api/materials/review-due'),
      this.get('/api/retention/state', 'GET /api/retention/state'),
      this.get('/api/tutor/dock?path=/dashboard', 'GET /api/tutor/dock'),
    ]);
  }

  async enrol() {
    let [track, grade] = TRACKS[this.i % TRACKS.length];
    if (!grade) {
      const cat = await this.c.get('/api/catalog', 'GET /api/catalog');
      const t = cat.json && cat.json.tracks && cat.json.tracks.find((x) => x.id === track);
      grade = t && t.grades && t.grades[0] && t.grades[0].id;
      if (!grade) { track = 'math'; grade = 'algebra_1_part_a'; }
    }
    const r = await this.post('/api/enrollments', { selections: [{ track_id: track, grade_id: grade }] }, 'POST /api/enrollments');
    const made = r.json && r.json.created && r.json.created[0];
    if (!made) { this.metrics.note(`enrol ${r.status}`, r.json); return null; }
    this.enrollment = made.id; this.track = track; this.grade = grade;
    return made.id;
  }

  async placement() {
    const s = await this.post('/api/placement/start', { enrollment_id: this.enrollment }, 'POST /api/placement/start');
    if (s.status !== 200 && s.status !== 201) { this.metrics.note(`placement start ${s.status}`, s.json); return false; }
    const items = (s.json && s.json.items) || [];
    let k = 0;
    for (const item of items) {
      const right = this.r() < (item.difficulty <= 5 ? this.persona.accuracy + 0.2 : this.persona.accuracy - 0.2);
      await this.post('/api/placement/answer', { session_id: s.json.session_id, item_id: item.id, answer: answerFor(item, right, this.r), ms: 4000 }, 'POST /api/placement/answer');
      k++;
      if (this.persona.quits && k > 4) return false;
      if (k % 6 === 0) await this.think(0.5);
    }
    const f = await this.post('/api/placement/finish', { session_id: s.json.session_id }, 'POST /api/placement/finish');
    if (f.status !== 200) { this.metrics.note(`placement finish ${f.status}`, f.json); return false; }
    this.level = (f.json.result && f.json.result.placedLevel) || 1;
    return true;
  }

  async openPath() {
    await Promise.all([
      this.get(`/api/path/${this.enrollment}?view=page`, 'GET /api/path/:id'),
      this.get(`/api/placement/path/${this.enrollment}`, 'GET /api/placement/path/:id'),
      this.get(`/api/review/${this.enrollment}`, 'GET /api/review/:id'),
    ]);
  }

  /** The lesson page a level opens on. A 202 is "still writing": the page asks again. */
  async openLesson() {
    const url = `/api/lessons/${this.track}/${this.grade}/${this.level || 1}`;
    const t0 = performance.now();
    let r = await this.get(url, 'GET /api/lessons/:t/:g/:l');
    let polls = 0;
    while (r.status === 202 && polls < (this.opts.maxPolls || 6)) {
      await sleep(5000);
      r = await this.get(url, 'GET /api/lessons/:t/:g/:l');
      polls++;
    }
    this.metrics.add('(wait) lesson ready', performance.now() - t0, r.status);
    return r;
  }

  /** A lesson level built from blocks: read it, answer its checks one by one, finish it. */
  async blockLevel(level) {
    this.level = level;
    const r = await this.openLesson();
    if (r.status !== 200 || !r.json || !r.json.plan) { if (r.status >= 500) this.metrics.note('lesson 5xx', r.json); return; }
    const checks = (r.json.plan.entries || []).filter((e) => /^Check_/.test(e.block));
    const base = `/api/lessons/${this.track}/${this.grade}/${level}`;
    let n = 0;
    for (const e of checks) {
      await this.think();
      const answer = e.data.choices && e.data.choices.length ? e.data.choices[Math.floor(this.r() * e.data.choices.length)] : 'not sure';
      const a = await this.post(`${base}/check`, { check_id: e.data.id, answer, ms: 3000 + Math.floor(this.r() * 15000) }, 'POST /api/lessons/:t/:g/:l/check');
      if (a.status >= 500) this.metrics.note('check 5xx', a.json);
      n++;
      if (n % 5 === 0) await this.post('/api/retention/study/beat', {}, 'POST /api/retention/study/beat');
      if (this.persona.quits) return;
    }
    await this.think();
    const f = await this.post(`${base}/block-finish`, { read_ms: 60000, scroll_backs: 1, blocks: [] }, 'POST /api/lessons/:t/:g/:l/block-finish');
    if (f.status >= 500) this.metrics.note('block-finish 5xx', f.json);
  }

  /** A game level: the questions come with the page, each answer is posted, the end settles the level. */
  async gameLevel(level) {
    this.level = level;
    const r = await this.openLesson();
    const j = r.json || {};
    if (r.status !== 200) return;
    if (j.ordinary) { await this.sitting({ ordinary: true }); return; }
    const questions = j.questions || (j.game && j.game.questions) || (j.payload && j.payload.questions) || [];
    const base = `/api/lessons/${this.track}/${this.grade}/${level}`;
    const use = questions.slice(0, 8);
    let right = 0;
    for (let k = 0; k < use.length; k++) {
      await this.think();
      const correct = this.r() < this.persona.accuracy; if (correct) right++;
      const a = await this.post(`${base}/game-answer`, { play: j.play || '', question_id: use[k].id, question_index: k, correct, ms: 3000 + Math.floor(this.r() * 9000) }, 'POST /api/lessons/:t/:g/:l/game-answer');
      if (a.status >= 500) this.metrics.note('game-answer 5xx', a.json);
      if (this.persona.quits) return;
    }
    const f = await this.post(`${base}/game-finish`, { play: j.play || '', result: 'win', correct: right, wrong: use.length - right, questions_used: use.length }, 'POST /api/lessons/:t/:g/:l/game-finish');
    if (f.status >= 500) this.metrics.note('game-finish 5xx', f.json);
    if (!use.length) this.metrics.note('game with no questions in reply', Object.keys(j));
  }

  async sitting(extra = {}) {
    const s = await this.post('/api/sessions', { enrollment_id: this.enrollment, ...extra }, 'POST /api/sessions');
    if (s.status !== 201 && s.status !== 200) { this.metrics.note(`sessions ${s.status}`, s.json); return; }
    if (s.json && s.json.game) {
      if (s.json.game.kind === 'lesson' || s.json.game.kind === 'retention') return this.blockLevel(s.json.game.level);
      return this.gameLevel(s.json.game.level);
    }
    const sid = s.json.session_id;
    let items = s.json.items || [];
    let block = 0;
    for (let round = 0; round < (this.opts.blocks || 2); round++) {
      let n = 0;
      for (const item of items) {
        if (item.answered) continue;
        await this.think();
        if (this.r() < this.persona.tutor) {
          const c = await this.post(`/api/items/${item.id}/coach`, { messages: [] }, 'POST /api/items/:id/coach');
          if (c.status >= 500) this.metrics.note('coach 5xx', c.json);
        }
        const a = await this.post(`/api/sessions/${sid}/answer`, { item_id: item.id, answer: answerFor(item, this.r() < this.persona.accuracy, this.r), ms: 2000 + Math.floor(this.r() * 20000) }, 'POST /api/sessions/:id/answer');
        if (a.status >= 500) this.metrics.note('answer 5xx', a.json);
        n++;
        if (n % 5 === 0) await this.post('/api/retention/study/beat', {}, 'POST /api/retention/study/beat');
        if (this.persona.quits && n >= 3) return;
      }
      const b = await this.post(`/api/sessions/${sid}/block-finish`, { block }, 'POST /api/sessions/:id/block-finish');
      if (b.status >= 500) this.metrics.note('block-finish 5xx', b.json);
      if (!b.json || !b.json.can_continue || round + 1 >= (this.opts.blocks || 2)) break;
      const nx = await this.post(`/api/sessions/${sid}/next-block`, {}, 'POST /api/sessions/:id/next-block');
      if (nx.status !== 201) break;
      items = nx.json.items || []; block++;
    }
    const f = await this.post(`/api/sessions/${sid}/finish`, {}, 'POST /api/sessions/:id/finish');
    if (f.status >= 500) this.metrics.note('finish 5xx', f.json);
    this.lastItem = (s.json.items && s.json.items[0] && s.json.items[0].id) || null;
    for (const it of ((f.json && f.json.retention) || []).slice(0, 2)) {
      await this.think(0.5);
      await this.post(`/api/sessions/${sid}/answer`, { item_id: it.id, answer: answerFor(it, this.r() < this.persona.accuracy, this.r), ms: 6000 }, 'POST /api/sessions/:id/answer');
    }
  }

  async tutor() {
    const r = await this.post('/api/tutor/dock', { messages: [{ role: 'user', content: 'Can you explain why my last answer was wrong?' }], page: { path: '/dashboard' }, input_mode: 'text' }, 'POST /api/tutor/dock');
    if (r.status >= 500) this.metrics.note('tutor 5xx', r.json);
    return r;
  }

  async upload() {
    const topic = TOPICS[this.i % TOPICS.length];
    const text = `${topic}. `.repeat(10) + Array.from({ length: 60 }, (_, k) => `Point ${k} about ${topic}: this sentence holds a fact a learner would want to keep, and why it matters for the exam.`).join(' ');
    const r = await this.post('/api/materials/paste', { title: `Notes on ${topic}`, text }, 'POST /api/materials/paste');
    if (r.status >= 500) this.metrics.note('paste 5xx', r.json);
    const m = r.json && r.json.material;
    if (!m) { if (r.status !== 403) this.metrics.note(`paste ${r.status}`, r.json); return; }
    await this.get('/api/materials', 'GET /api/materials');
    await this.get(`/api/materials/${m.id}`, 'GET /api/materials/:id');
    await this.post(`/api/materials/${m.id}/course`, {}, 'POST /api/materials/:id/course');
    await this.think(2);
    await this.get(`/api/materials/${m.id}/course`, 'GET /api/materials/:id/course');
    await this.get(`/api/materials/${m.id}/pack`, 'GET /api/materials/:id/pack');
  }

  /** A learner who already has an account and history (a grown store, scripts/beta-load/grow-db.js). */
  async signIn() {
    await this.c.get('/', 'GET / (page)');
    const r = await this.c.post('/api/auth/login', { email: `grown${this.i}@example.test`, password: this.password }, 'POST /api/auth/login');
    if (r.status !== 200) { this.metrics.note(`login ${r.status}`, r.json); return false; }
    this.id = r.json.user.id;
    const e = await this.get('/api/enrollments', 'GET /api/enrollments');
    const row = e.json && e.json.enrollments && e.json.enrollments.find((x) => x.track && x.grade);
    if (!row) { this.metrics.note('no enrollment', e.json); return false; }
    this.enrollment = row.id; this.track = row.track.id; this.grade = row.grade.id; this.level = row.current_level || 1;
    return true;
  }

  /** The whole visit. `until` is when the run ends: the learner keeps studying till then. */
  async run(until) {
    if (this.opts.existing) {
      if (!await this.signIn()) return;
      await this.post('/api/retention/study/start', {}, 'POST /api/retention/study/start');
      while (Date.now() < until) {
        await this.dashboard();
        await this.think(0.5);
        await this.openPath();
        await this.think(0.5);
        await this.sitting();
        if (this.r() < this.persona.tutor * 2) await this.tutor();
        await this.think();
      }
      return;
    }
    if (!await this.signUp()) return;
    await this.think(0.5);
    await this.dashboard();
    if (!await this.enrol()) return;
    await this.think(0.5);
    await this.placement();
    await this.post('/api/retention/study/start', {}, 'POST /api/retention/study/start');
    while (Date.now() < until) {
      await this.dashboard();
      await this.think(0.5);
      await this.openPath();
      await this.think(0.5);
      await this.sitting();
      if (this.r() < this.persona.tutor * 2) await this.tutor();
      if (this.r() < this.persona.upload) await this.upload();
      await this.think();
      if (this.persona.quits) break;
    }
    await this.post('/api/retention/study/end', {}, 'POST /api/retention/study/end');
  }
}

module.exports = { Learner, TRACKS, personaOf, rng };
