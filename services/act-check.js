/**
 * The free ACT level check: the front door of the beta funnel (owner, 2026-11-04).
 *
 * A visitor with no account runs the ACT Quick placement (the same adaptive walk the app uses, services/adaptive-placement.js
 * through services/subject-placement.js; no AI calls, the ACT question set is already written), sees an estimated composite band
 * and their three weakest areas, and may then apply for the beta with the result attached, or send the check to a friend.
 *
 * State without an account. A guest is a row in `act_guests`; the browser keeps a token `id.secret` (only the secret's SHA-256 is
 * stored). The walk itself is an ordinary subject_placements row whose user_id is `guest:<id>`, so the walk code is not forked.
 * The 13+ question comes first: a visitor under 13 never gets a row, a walk or a result. No name, email or other personal data is
 * held until the visitor chooses to apply. Guests who never apply are deleted after GUEST_DAYS.
 *
 * The result is an ESTIMATE from about a dozen questions, not an official ACT score, and it has not yet been compared with
 * real ACT scores. Each ACT grade is authored for a target composite range (content/act-grades.js); the band here is that range for
 * the grades the walk's belief puts the learner in (15th to 85th percentile). ACT is a trademark of ACT, Inc.; Savant is not affiliated.
 *
 * Qualified applicant (computed and stored on every application): finished the check, 13 or older, agreed to about 30 minutes a day,
 * and a well-formed email (syntax only; nothing is sent to check it). Skip the line: each QUALIFIED applicant who arrived through
 * someone's share code moves that someone up (qualified referrals, then earliest application).
 *
 * Counters (visits, started, finished, applied, qualified per day, ref code and channel) feed the owner's /recruit page. Visits are
 * counted in memory and written every 30 s, because each database write rewrites the whole file.
 */
const crypto = require('crypto');
const db = require('../config/db');
const sp = require('./subject-placement');
const adaptive = require('./adaptive-placement');
const rules = require('../config/subject-placement');
const areas = require('./act-areas');

const TRACK = 'act';
const GUESTS = 'act_guests';
const APPLICANTS = 'recruit_applicants';
const COUNTS = 'recruit_counts';
const GOAL = Number(process.env.RECRUIT_GOAL || 1000);
const GOAL_DATE = process.env.RECRUIT_GOAL_DATE || '2026-11-15';
const GUEST_DAYS = 30;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const AGREE_TEXT = 'I can spend about 30 minutes a day on Savant while I am in the beta.';
const EMAIL_TEXT = 'Savant may email me about the beta.';

/** What each ACT grade is written to lead to: [low, high] composite, from the grade headings in content/act-grades.js. */
const GRADE_BANDS = [[5, 10], [10, 13], [13, 15], [15, 17], [17, 19], [19, 21], [21, 23], [23, 25], [25, 27], [27, 29], [29, 31], [31, 33], [33, 34], [34, 35], [35, 36], [36, 36]];

const KINDS = ['visit', 'started', 'finished', 'applied', 'qualified'];

/* ── small helpers ───────────────────────────────────────────────────────── */

function day(at = Date.now()) {
  return new Date(at).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function cleanRef(v) {
  const s = String(v || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(s) ? s : '';
}
function cleanChannel(v) {
  const s = String(v || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,20}$/.test(s) ? s : '';
}
function makeCode() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
const walkId = (guest) => `guest:${guest.gid}`;

/* ── counters (in memory, flushed every 30 s) ────────────────────────────── */

const pending = new Map();
let timer = null;

function bump(kind, ref, channel) {
  if (!KINDS.includes(kind)) return;
  const key = `${day()}|${ref || ''}|${channel || 'direct'}`;
  const row = pending.get(key) || {};
  row[kind] = (row[kind] || 0) + 1;
  pending.set(key, row);
  if (!timer) { timer = setTimeout(flushCounts, 30 * 1000); if (timer.unref) timer.unref(); }
}

function flushCounts() {
  timer = null;
  for (const [key, add] of pending) {
    const [d, ref, channel] = key.split('|');
    const found = db.findOne(COUNTS, (r) => r.key === key);
    const patch = {};
    for (const k of KINDS) patch[k] = ((found && found[k]) || 0) + (add[k] || 0);
    if (found) db.update(COUNTS, found.id, patch);
    else db.insert(COUNTS, { key, day: d, ref, channel, ...patch });
  }
  pending.clear();
}
process.on('exit', () => { try { flushCounts(); } catch { /* exiting */ } });

/* ── guests ──────────────────────────────────────────────────────────────── */

function guestFor(token) {
  const m = /^(g[0-9a-f]{10})\.([A-Za-z0-9_-]{16,64})$/.exec(String(token || ''));
  if (!m) return null;
  const g = db.findOne(GUESTS, (r) => r.gid === m[1]);
  if (!g) return null;
  const a = Buffer.from(g.key_hash, 'hex');
  const b = Buffer.from(sha(m[2]), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? g : null;
}

let lastPrune = 0;
/** Guests who never applied go after GUEST_DAYS, with their walk. */
function prune() {
  if (Date.now() - lastPrune < 3600 * 1000) return;
  lastPrune = Date.now();
  const cutoff = Date.now() - GUEST_DAYS * 86400 * 1000;
  const applied = new Set(db.all(APPLICANTS).map((a) => a.guest_gid));
  const old = db.find(GUESTS, (g) => Date.parse(g.created_at) < cutoff && !applied.has(g.gid));
  for (const g of old) {
    db.remove('subject_placements', (p) => p.user_id === walkId(g));
    db.remove(GUESTS, (r) => r.id === g.id);
  }
}

/** Where a visit counts: the channel given, else a friend's code, else a creator's code, else direct. */
function channelFor(ref, ch) {
  const given = cleanChannel(ch);
  if (given) return given;
  if (!ref) return 'direct';
  return db.findOne(GUESTS, (g) => g.code === ref) ? 'friend' : 'creator';
}

function visit({ ref, ch }) {
  const r = cleanRef(ref);
  bump('visit', r, channelFor(r, ch));
}

/** The walk's current question block, with progress. */
function stateOf(guest) {
  const placement = sp.placementFor(walkId(guest), TRACK);
  if (!placement) return { phase: 'none' };
  if (guest.finished_at) return { phase: 'done' };
  const cur = sp.currentQuestions(placement);
  if (!cur) return { phase: 'none' };
  const cfg = adaptive.MODES.quick;
  return {
    phase: 'walk',
    grade_id: cur.grade_id,
    questions: cur.questions,
    asked_so_far: (placement.answered || []).length,
    max_questions: cfg.max,
    deadline_at: placement.deadline_at || null,
    minutes: adaptive.clockMinutes('quick', TRACK),
  };
}

/**
 * Begin (or resume) a check. The caller has already asked the 13+ question and got a yes.
 * @returns {{token?: string, guest?: object, state?: object, error?: string, status?: number}}
 */
function begin({ ref, ch, token }) {
  prune();
  const set = sp.questionSet(TRACK);
  if (!set) return { error: 'The check is not ready yet. Try again soon.', status: 503 };
  const resumed = guestFor(token);
  if (resumed && !resumed.finished_at) return { guest: resumed, token, state: stateOf(resumed) };
  if (resumed && resumed.finished_at) return { guest: resumed, token, state: { phase: 'done' } };

  const r = cleanRef(ref);
  const channel = channelFor(r, ch);
  const gid = `g${crypto.randomBytes(5).toString('hex')}`;
  const secret = crypto.randomBytes(18).toString('base64url');
  const guest = db.insert(GUESTS, {
    gid,
    key_hash: sha(secret),
    ref: r,
    channel,
    age13: true,
    age13_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    finished_at: null,
    code: null,
    result: null,
    applicant_id: null,
  });
  sp.start(walkId(guest), TRACK, { mode: 'quick' });
  bump('started', r, channel);
  return { guest, token: `${gid}.${secret}`, state: stateOf(guest) };
}

function answer(guest, gradeId, index, said) {
  return sp.recordAnswer(walkId(guest), TRACK, String(gradeId || ''), index, said);
}

/** Hand in the current block. Returns the next state; when the walk ends the result is computed and stored. */
function submit(guest, answers) {
  if (guest.finished_at) return { state: { phase: 'done' } };
  const out = sp.submitBlock(walkId(guest), TRACK, answers);
  if (out.error) return { error: out.error, status: 400 };
  if (out.stopped) {
    finish(guest);
    return { state: { phase: 'done' } };
  }
  return { state: stateOf(guest) };
}

/* ── the result ──────────────────────────────────────────────────────────── */

/** Each answered question's area, found again in its grade's set (the walk's rows keep the prompt, not the topic). */
function answeredAreas(placement) {
  const out = [];
  for (const score of placement.scores || []) {
    const bank = sp.questionsFor(TRACK, score.grade_id) || [];
    for (const a of score.answers || []) out.push(areas.areaOf(bank.find((q) => String(q.prompt).slice(0, 220) === a.prompt)));
  }
  return out;
}

function computeResult(guest) {
  const placement = sp.placementFor(walkId(guest), TRACK);
  const answered = (placement && placement.answered) || [];
  const gradeIds = (placement && placement.grade_ids) || rules.gradesFor(TRACK);
  const post = adaptive.posterior(gradeIds.length, answered);
  const rec = adaptive.recommend(gradeIds.length, post, answered);
  const idx = (q) => Math.max(0, Math.min(gradeIds.length - 1, Math.floor(adaptive.quantile(post, q))));
  const lo = GRADE_BANDS[Math.min(idx(0.15), rec.index)][0];
  const hi = GRADE_BANDS[Math.max(idx(0.85), rec.index)][1];
  const x = adaptive.median(post);

  // Weakest areas: how far each area's answers fall short of what the learner's placed level would be expected to get right.
  const tags = answeredAreas(placement || {});
  const per = {};
  answered.forEach((a, i) => {
    const id = tags[i];
    if (!id) return;
    const row = per[id] || (per[id] = { asked: 0, correct: 0, expected: 0 });
    row.asked++;
    if (a.correct) row.correct++;
    row.expected += adaptive.assumed(x, a.pos, a.guess, {}, !!a.idk);
  });
  const ranked = Object.entries(per)
    .map(([id, r]) => ({ id, ...r, gap: (r.expected - r.correct) / r.asked }))
    .sort((a, b) => (b.asked >= 2) - (a.asked >= 2) || b.gap - a.gap || a.correct / a.asked - b.correct / b.asked);
  const weakest = ranked.slice(0, 3).map((r) => ({
    id: r.id,
    name: areas.BY_ID[r.id].name,
    section: areas.BY_ID[r.id].section,
    asked: r.asked,
    correct: r.correct,
    note: r.correct === r.asked ? 'No misses here; these were the closest to your limit.' : `${r.asked - r.correct} of ${r.asked} missed.`,
  }));

  return {
    version: 1,
    kind: 'estimate',
    composite_low: lo,
    composite_high: hi,
    grade_id: gradeIds[rec.index],
    grade_name: rules.gradeName(TRACK, gradeIds[rec.index]),
    confidence: Math.round(rec.sure * 100) / 100,
    asked: answered.length,
    correct: answered.filter((a) => a.correct).length,
    weakest,
    areas_tagged: tags.filter(Boolean).length,
    made_at: new Date().toISOString(),
  };
}

function finish(guest) {
  if (guest.finished_at) return guest;
  const result = computeResult(guest);
  let code;
  do code = makeCode(); while (db.findOne(GUESTS, (g) => g.code === code));
  const updated = db.update(GUESTS, guest.id, { finished_at: new Date().toISOString(), result, code });
  bump('finished', guest.ref, guest.channel);
  return updated;
}

/* ── applications, qualification, the line ───────────────────────────────── */

function qualification(guest, applicant) {
  const parts = {
    finished: !!guest.finished_at,
    age13: guest.age13 === true,
    agreed_30_min: applicant.agree_30_min === true,
    valid_email: EMAIL_RE.test(String(applicant.email || '')),
  };
  return { parts, qualified: Object.values(parts).every(Boolean) };
}

function applicantOf(guest) {
  return guest.applicant_id ? db.byId(APPLICANTS, guest.applicant_id) : null;
}

function apply(guest, body) {
  if (!guest.finished_at) return { error: 'Finish the check first, then save your result.', status: 400 };
  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) return { error: 'Enter a valid email address.', status: 400, field: 'email' };
  if (body.consent_email !== true) return { error: 'Tick the box so we can email you about the beta.', status: 400, field: 'consent_email' };
  const name = String(body.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
  const agree = body.agree_30_min === true;

  let applicant = applicantOf(guest) || db.findOne(APPLICANTS, (a) => a.email === email);
  const wasQualified = !!(applicant && applicant.qualified);
  const base = {
    email,
    name: name || (applicant && applicant.name) || '',
    guest_gid: guest.gid,
    agree_30_min: agree || !!(applicant && applicant.agree_30_min && applicant.email === email),
    agree_text: AGREE_TEXT,
    consent_email: true,
    consent_text: EMAIL_TEXT,
    result: guest.result,
  };
  const q = qualification(guest, base);
  if (applicant) {
    applicant = db.update(APPLICANTS, applicant.id, { ...base, qualified: q.qualified, qualified_parts: q.parts, qualified_at: q.qualified ? (applicant.qualified_at || new Date().toISOString()) : null });
  } else {
    applicant = db.insert(APPLICANTS, {
      ...base,
      applied_at: new Date().toISOString(),
      // The code they arrived with (a friend's or a creator's), kept as given; credit is worked out from it when the line is read.
      ref: guest.ref || '',
      channel: guest.channel || 'direct',
      status: 'applied',
      user_id: null,
      qualified: q.qualified,
      qualified_parts: q.parts,
      qualified_at: q.qualified ? new Date().toISOString() : null,
    });
    bump('applied', guest.ref, guest.channel);
  }
  if (q.qualified && !wasQualified) bump('qualified', applicant.ref, applicant.channel);
  db.update(GUESTS, guest.id, { applicant_id: applicant.id });
  return { applicant };
}

/** Qualified applicants who came through this code. */
function qualifiedReferrals(code) {
  if (!code) return 0;
  return db.find(APPLICANTS, (a) => a.ref === code && a.qualified).length;
}

/** The line: qualified first, then more qualified referrals, then earlier. */
function lineUp() {
  const rows = db.all(APPLICANTS).map((a) => {
    const g = db.findOne(GUESTS, (x) => x.gid === a.guest_gid);
    return { a, referrals: qualifiedReferrals(g && g.code) };
  });
  rows.sort((x, y) => (y.a.qualified - x.a.qualified) || (y.referrals - x.referrals) || (Date.parse(x.a.applied_at) - Date.parse(y.a.applied_at)));
  return rows;
}

function standing(guest) {
  const applicant = applicantOf(guest);
  const line = lineUp();
  const qualifiedCount = line.filter((r) => r.a.qualified).length;
  const out = {
    applied: !!applicant,
    qualified: !!(applicant && applicant.qualified),
    qualified_parts: applicant ? applicant.qualified_parts : null,
    applicants: line.length,
    qualified_count: qualifiedCount,
    referrals: guest.code ? qualifiedReferrals(guest.code) : 0,
    share_path: guest.code ? `/act-check?ref=${guest.code}` : null,
  };
  if (applicant) {
    const at = line.findIndex((r) => r.a.id === applicant.id);
    out.position = at + 1;
  }
  return out;
}

/* ── the owner's numbers ─────────────────────────────────────────────────── */

function stats() {
  flushCounts();
  const rows = db.all(COUNTS);
  const sum = (list) => KINDS.reduce((o, k) => { o[k] = list.reduce((n, r) => n + (r[k] || 0), 0); return o; }, {});
  const byKey = new Map();
  for (const r of rows) {
    const k = `${r.ref}|${r.channel}`;
    const row = byKey.get(k) || { ref: r.ref, channel: r.channel, ...sum([]) };
    for (const kind of KINDS) row[kind] += r[kind] || 0;
    byKey.set(k, row);
  }
  const codeOwners = new Map(db.all(GUESTS).filter((g) => g.code).map((g) => [g.code, g]));
  const refs = [...byKey.values()].map((r) => {
    const owned = codeOwners.has(r.ref);
    return { ...r, owner: owned ? 'visitor' : r.ref ? 'creator' : '', referrals: owned ? db.find(APPLICANTS, (a) => a.ref === r.ref).length : null };
  }).sort((a, b) => b.qualified - a.qualified || b.applied - a.applied || b.visit - a.visit);

  const days = new Map();
  for (const r of rows) {
    const d = days.get(r.day) || { day: r.day, ...sum([]) };
    for (const kind of KINDS) d[kind] += r[kind] || 0;
    days.set(r.day, d);
  }
  let running = 0;
  const daily = [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1)).map((d) => { running += d.qualified; return { ...d, cumulative_qualified: running }; });

  const applicants = db.all(APPLICANTS);
  const qualified = applicants.filter((a) => a.qualified).length;
  const today = day();
  const left = Math.max(0, Math.ceil((Date.parse(`${GOAL_DATE}T23:59:59-06:00`) - Date.now()) / 86400000));
  return {
    goal: GOAL,
    goal_date: GOAL_DATE,
    today,
    days_left: left,
    totals: { ...sum(rows), applicants: applicants.length, qualified },
    needed_per_day: left ? Math.ceil(Math.max(0, GOAL - qualified) / left) : Math.max(0, GOAL - qualified),
    refs,
    daily,
    definition: 'Qualified = finished the check, 13 or older, agreed to about 30 minutes a day, and gave a well-formed email (syntax only; not verified).',
  };
}

function applicantList() {
  return lineUp().map(({ a, referrals }, i) => ({
    position: i + 1, email: a.email, name: a.name, applied_at: a.applied_at, qualified: a.qualified,
    qualified_parts: a.qualified_parts, ref: a.ref, channel: a.channel, qualified_referrals: referrals,
    composite: a.result ? `${a.result.composite_low}-${a.result.composite_high}` : '', status: a.status,
  }));
}

/* ── carrying the result into the real account ───────────────────────────── */

/**
 * When an applicant signs up (the owner has approved them), their check goes with them: the walk becomes the account's ACT
 * placement and the application is marked joined. Never throws; a failure leaves the sign-up untouched.
 */
function carry(user) {
  try {
    const email = String(user.email || '').trim().toLowerCase();
    const applicant = db.findOne(APPLICANTS, (a) => a.email === email);
    if (!applicant) return false;
    db.update(APPLICANTS, applicant.id, { status: 'joined', user_id: user.id, joined_at: new Date().toISOString() });
    const guest = db.findOne(GUESTS, (g) => g.gid === applicant.guest_gid);
    const walk = guest && sp.placementFor(walkId(guest), TRACK);
    if (!walk || !walk.finished_at || sp.placementFor(user.id, TRACK)) return false;
    const { id, user_id: _u, created_at: _c, updated_at: _up, ...rest } = walk;
    const result = sp.recommendAdaptive(TRACK, walk);
    db.insert('subject_placements', { ...rest, user_id: user.id, ...result, probabilities: sp.probabilitiesFor(TRACK, walk), source: 'act-check', finished_at: walk.finished_at });
    return true;
  } catch (err) {
    console.warn(`act-check: result not carried: ${err.message}`);
    return false;
  }
}

module.exports = {
  TRACK, GOAL, GOAL_DATE, GRADE_BANDS, EMAIL_RE, AGREE_TEXT, EMAIL_TEXT,
  cleanRef, cleanChannel, visit, begin, guestFor, stateOf, answer, submit, finish, computeResult,
  apply, qualification, standing, stats, applicantList, carry, flushCounts, lineUp, qualifiedReferrals,
};
