/**
 * Measurement channels that raise the scorecard's accuracy (owner decision, 2026-10-31: docs/PRODUCT-DECISIONS.md "Scorecard accuracy"). Each is
 * optional and skippable, and each reaches the scorecard only through its evidence path (scorecard/hooks.js -> scorecard.observe), never as
 * a value written into the card:
 *
 *   questionnaire   sixteen public-domain IPIP items at sign-up (content/ipip-items.js), a prior on the measures they map to
 *   delayed check   about 30 seconds of questions on skills last practised a week or a month ago: memory tests for the forgetting model
 *   brain games     memory span, reaction speed, sustained attention (2 minutes each, run in the browser, scored against age norms here)
 *   silent signals  hesitation before the first move, typing rhythm, corrections: summaries only, never the keys; opt-in with a notice
 *   imported        ACT, SAT/PSAT and grade-average figures typed in, and a review-history CSV (Anki-style) for the forgetting model
 *   max accuracy    a confidence tap on every question and an experiment on every tailored page
 *   which is clearer  (round 8) now and then after a lesson page, two short versions of one explanation that differ on ONE way of teaching
 *                   (an experiment's high and low instruction, services/personalize.js EXPERIMENTS), and which helped more: preference evidence
 *                   for that stat (scorecard/index.js experimentPosterior, at a stated, conservative validity)
 *   (the reading check, services/reading-check.js, is the seventh and was built first)
 *
 * Who may use them. A learner under their country's consent age gets NO new data collection beyond what they already have unless a parent has
 * agreed to it (the consent scope \`measurement_extras\`, off by default); an account that has not answered the age screen is not offered them either.
 * What is kept is in the learner's \`profiles\` row (\`boosters\`), which account deletion and a parent's download already cover.
 */
const crypto = require('crypto');
const db = require('../config/db');
const learner = require('./learner');
const ipip = require('../content/ipip-items');

const DAY = 86400000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hooks = () => require('./scorecard/hooks'); // eslint-disable-line global-require

// ── who may ──────────────────────────────────────────────────────────────────
function allowed(user) {
  if (!user) return false;
  const check = user.age_check;
  if (!check) return false;
  if (!check.needs_parent && !check.under_13) return true;
  const consent = user.consent_id ? db.byId('parental_consents', user.consent_id) : null;
  return !!(consent && consent.status === 'active' && consent.scopes && consent.scopes.measurement_extras && consent.scopes.measurement_extras.active);
}

function ageOf(user, now = new Date()) {
  const ym = user && user.age_check && /^(\d{4})-(\d{2})$/.exec(String(user.age_check.birth_ym || ''));
  if (!ym) return null;
  const y = now.getUTCFullYear() - Number(ym[1]);
  return now.getUTCMonth() + 1 <= Number(ym[2]) ? y - 1 : y;
}

// ── what is kept ─────────────────────────────────────────────────────────────
const blank = () => ({ questionnaire: null, delayed: { taken: [], open: null }, games: {}, silent: { on: false, acc: null }, imports: null, max_accuracy: false, choice: { on: true, log: [], open: null } });
function get(userId) {
  const p = learner.getProfile(userId);
  const b = p && p.boosters ? p.boosters : {};
  return { ...blank(), ...b, delayed: { ...blank().delayed, ...(b.delayed || {}) }, silent: { ...blank().silent, ...(b.silent || {}) }, choice: { ...blank().choice, ...(b.choice || {}) } };
}
function put(userId, patch) {
  const next = { ...get(userId), ...patch };
  learner.saveProfile(userId, { boosters: next });
  return next;
}

// ── the questionnaire ────────────────────────────────────────────────────────
const questionnaire = {
  items: () => ({ scale: ipip.SCALE, items: ipip.ITEMS.map((i) => ({ id: i.id, text: i.text })), source: ipip.SOURCE }),
  submit(user, answers) {
    if (!allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
    const b = get(user.id);
    if (b.questionnaire) return { error: 'You have already answered the questionnaire.', code: 'done' };
    const clean = {};
    for (const i of ipip.ITEMS) { const v = Number(answers && answers[i.id]); if (Number.isInteger(v) && v >= 1 && v <= 5) clean[i.id] = v; }
    if (Object.keys(clean).length < 4) return { error: 'Answer at least four statements, or skip it.', code: 'too_few' };
    try { hooks().onQuestionnaire(user.id, clean, ipip.ITEMS); } catch (err) { console.warn(`boosters: questionnaire not applied: ${err.message}`); return { error: 'Your answers could not be saved.', code: 'failed' }; }
    put(user.id, { questionnaire: { at: new Date().toISOString(), answers: clean } });
    return { ok: true, answered: Object.keys(clean).length };
  },
  skip(user) { if (allowed(user) && !get(user.id).questionnaire) put(user.id, { questionnaire: { at: new Date().toISOString(), skipped: true, answers: {} } }); return { ok: true }; },
};

// ── the delayed memory check ─────────────────────────────────────────────────
const HORIZONS = [{ id: 'month', days: 28 }, { id: 'week', days: 7 }];
const CHECK_ITEMS = 3;

/** Skills practised a week or more ago whose horizon has not been checked yet, with a past question to ask on each. */
function delayedCandidates(userId, now = Date.now()) {
  const taken = new Set(get(userId).delayed.taken.map((t) => `${t.skill}:${t.horizon}`));
  const out = [];
  for (const s of db.find('skill_states', (r) => r.user_id === userId && r.attempts > 0 && r.last_seen_at)) {
    const days = (now - Date.parse(s.last_seen_at)) / DAY;
    const h = HORIZONS.find((x) => days >= x.days);
    if (!h || taken.has(`${s.skill_id}:${h.id}`)) continue;
    const rows = db.find('items', (i) => i.user_id === userId && i.skill_id === s.skill_id && i.correct === true && Array.isArray(i.choices) && i.choices.length >= 3 && typeof i.answer === 'string' && i.prompt);
    if (!rows.length) continue;
    out.push({ skill: s.skill_id, horizon: h.id, days, state: s, item: rows[rows.length - 1] });
  }
  return out.sort((a, b) => b.days - a.days);
}

const delayed = {
  due(userId, now = Date.now()) {
    const c = delayedCandidates(userId, now);
    return { due: c.length > 0, horizon: c.length ? c[0].horizon : null, questions: Math.min(CHECK_ITEMS, c.length), seconds: 30 };
  },
  start(user, now = Date.now()) {
    if (!allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
    const b = get(user.id);
    if (b.delayed.open && now - Date.parse(b.delayed.open.at) < 30 * 60000) return delayed.view(b.delayed.open);
    const picks = delayedCandidates(user.id, now).slice(0, CHECK_ITEMS);
    if (!picks.length) return { error: 'Nothing to check yet.', code: 'nothing_due' };
    const id = crypto.randomBytes(6).toString('hex');
    const qs = picks.map((p, i) => {
      const choices = p.item.choices.slice(0, 5);
      const order = choices.map((c, k) => [crypto.createHash('sha1').update(`${id}:${i}:${k}`).digest()[0], c]).sort((a, c) => a[0] - c[0]).map((x) => x[1]);
      return { n: i + 1, skill: p.skill, horizon: p.horizon, dt: Number(p.days.toFixed(2)), prompt: p.item.prompt, choices: order, key: order.indexOf(p.item.answer), nc: p.state.correct || 0, nw: Math.max(0, (p.state.attempts || 0) - (p.state.correct || 0)), ns: p.state.spaced_right || 0, nsw: p.state.spaced_wrong || 0, pk: clamp(0.6 + 0.35 * (p.state.mastery || 0), 0.6, 0.95), g: 1 / Math.max(2, order.length) };
    }).filter((q) => q.key >= 0);
    if (!qs.length) return { error: 'Nothing to check yet.', code: 'nothing_due' };
    const open = { id, at: new Date(now).toISOString(), questions: qs };
    put(user.id, { delayed: { ...b.delayed, open } });
    return delayed.view(open);
  },
  view: (open) => ({ check_id: open.id, seconds: 30, questions: open.questions.map((q) => ({ n: q.n, prompt: q.prompt, choices: q.choices })) }),
  /** answers: { n: choice index }. Each answered question is a memory test; a skipped one is not counted. */
  answer(user, checkId, answers, now = Date.now()) {
    const b = get(user.id);
    const open = b.delayed.open;
    if (!open || open.id !== String(checkId || '')) return { error: 'That check is not open any more.', code: 'not_found' };
    const tests = [];
    let right = 0;
    for (const q of open.questions) {
      const given = answers && answers[q.n];
      if (given === undefined || given === null || given === '') continue;
      const ok = Number(given) === q.key;
      if (ok) right++;
      tests.push({ dt: q.dt, nc: q.nc, nw: q.nw, ns: q.ns, nsw: q.nsw, pk: q.pk, g: q.g, right: ok });
    }
    const taken = [...b.delayed.taken, ...open.questions.map((q) => ({ skill: q.skill, horizon: q.horizon, at: new Date(now).toISOString() }))].slice(-200);
    put(user.id, { delayed: { taken, open: null } });
    if (tests.length) { try { hooks().onDelayedCheck(user.id, tests); } catch (err) { console.warn(`boosters: delayed check not applied: ${err.message}`); } }
    return { ok: true, asked: open.questions.length, answered: tests.length, right };
  },
};

// ── brain games ──────────────────────────────────────────────────────────────
// Norms are rough placeholders for a general population (a digit span of about 6.5 and a two-choice reaction of about half a second for an
// adult, lower and slower for children); they are the weakest part of this channel, which is why a game counts once a week at a small weight.
const GAMES = {
  span: { stat: 'working_memory_span', title: 'Memory span', minutes: 2, what: 'Remember a growing string of digits and type it back.' },
  speed: { stat: 'processing_velocity', title: 'Reaction speed', minutes: 2, what: 'Tap the side the arrow points to, as fast as you can.' },
  attention: { stat: 'attention_runway', title: 'Sustained attention', minutes: 2, what: 'Watch a stream of symbols and tap only for the rare one.' },
};
const probit = (p) => {
  const q = clamp(p, 0.01, 0.99);
  // Acklam-style rational approximation is overkill here; a logistic approximation (error under 0.02 in z) is enough for d'.
  return Math.log(q / (1 - q)) / 1.702;
};
function gameScore(game, r, age) {
  if (game === 'span') {
    const span = Number(r.max_span);
    if (!(span >= 2 && span <= 14) || !(Number(r.trials) >= 4)) return null;
    const norm = age === null ? 6.5 : clamp(3.5 + 0.3 * (Math.min(age, 17) - 5), 3.5, 6.5);
    return clamp(50 + (17 * (span - norm)) / 1.1, 2, 98);
  }
  if (game === 'speed') {
    const rt = Number(r.median_rt_ms);
    if (!(rt >= 150 && rt <= 3000) || !(Number(r.trials) >= 20) || !(Number(r.accuracy) >= 0.8)) return null;
    const norm = age === null ? 520 : 520 + 35 * Math.max(0, 16 - Math.min(age, 16));
    return clamp(50 - (17 * (rt - norm)) / (0.18 * norm), 2, 98);
  }
  if (game === 'attention') {
    const t = Number(r.targets); const n = Number(r.nontargets);
    if (!(t >= 8) || !(n >= 60)) return null;
    const hit = (Number(r.hits) + 0.5) / (t + 1);
    const fa = (Number(r.false_alarms) + 0.5) / (n + 1);
    const dprime = probit(hit) - probit(fa);
    const half = (h, k) => (Number(h) + 0.25) / (k / 2 + 0.5);
    const decrement = Math.max(0, half(r.first_half_hits, t) - half(r.second_half_hits, t));
    return clamp(50 + 12 * (dprime - 3) - 80 * decrement, 2, 98);
  }
  return null;
}
const games = {
  defs: () => Object.entries(GAMES).map(([id, g]) => ({ id, title: g.title, minutes: g.minutes, what: g.what })),
  submit(user, game, result, now = Date.now()) {
    if (!allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
    const def = GAMES[game];
    if (!def) return { error: 'No such game.', code: 'not_found' };
    const score = gameScore(game, result || {}, ageOf(user));
    if (score === null) return { ok: true, fed: false, reason: 'The result was too short or too fast to count.' };
    const b = get(user.id);
    const last = b.games[game];
    const fed = !(last && last.fed_at && now - Date.parse(last.fed_at) < 7 * DAY);
    if (fed) { try { hooks().onGame(user.id, def.stat, score, `${def.title} game`); } catch (err) { console.warn(`boosters: game not applied: ${err.message}`); return { error: 'The result could not be saved.', code: 'failed' }; } }
    put(user.id, { games: { ...b.games, [game]: { at: new Date(now).toISOString(), score: Math.round(score), fed_at: fed ? new Date(now).toISOString() : (last && last.fed_at) || null } } });
    return { ok: true, fed, reason: fed ? null : 'It counts once a week; this play is kept but not added again yet.', score: Math.round(score) };
  },
};

// ── silent behaviour signals ─────────────────────────────────────────────────
const SILENT_FLUSH = 10;
const silent = {
  set(user, on) {
    if (!allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
    const b = get(user.id);
    put(user.id, { silent: { ...b.silent, on: !!on, ...(on ? { since: new Date().toISOString() } : { acc: null }) } });
    return { ok: true, on: !!on };
  },
  /**
   * batch: [{ hesitation_ms, key_median_ms, key_cv, keys, backspaces, shown_ms, tab_aways, away_ms, mc, mc_changes, pauses, idle }] for answered
   * items. Summaries only: no keys, no text, no choice. The round-9 counts (tab-aways, time away, a changed multiple-choice pick, pauses while
   * typing, idle stretches) reach the scorecard as indicators (scorecard/indicators.js cap.*), one unit per answered question.
   */
  ingest(user, batch) {
    if (!allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
    const b = get(user.id);
    if (!b.silent.on) return { ok: true, kept: 0, reason: 'off' };
    const acc = b.silent.acc || { items: 0, keys: 0, backspaces: 0, hes: [], med: [] };
    const cap = acc.cap || {};
    const add = (key, v) => { if (!Number.isFinite(v)) return; const c = cap[key] || (cap[key] = [0, 0]); c[0] += v; c[1] += 1; };
    for (const s of (Array.isArray(batch) ? batch : []).slice(0, 40).filter((x) => x && typeof x === 'object')) {
      acc.items += 1;
      const h = Number(s.hesitation_ms);
      if (h >= 0 && h < 600000) acc.hes.push(h);
      const k = clamp(Number(s.keys) || 0, 0, 2000);
      const m = Number(s.key_median_ms);
      if (k >= 3 && m >= 20 && m <= 5000) { acc.keys += k; acc.med.push(m); acc.backspaces += clamp(Number(s.backspaces) || 0, 0, k); }
      const shown = Number(s.shown_ms);
      if (shown > 0 && shown < 3600000) {
        add('cap.tabaway', clamp(Number(s.tab_aways) || 0, 0, 20));
        add('cap.away', clamp((Number(s.away_ms) || 0) / shown, 0, 1));
        add('cap.idle', clamp(Number(s.idle) || 0, 0, 20));
        if (s.mc === true) add('cap.mcchange', (Number(s.mc_changes) || 0) > 0 ? 1 : 0);
        if (s.pauses !== null && s.pauses !== undefined && k >= 3) add('cap.pause', clamp(Number(s.pauses) || 0, 0, 50));
      }
    }
    let fed = false;
    if (acc.items >= SILENT_FLUSH) {
      const median = (xs) => (xs.length ? [...xs].sort((a, c) => a - c)[Math.floor(xs.length / 2)] : null);
      try {
        hooks().onSilentSignals(user.id, { items: acc.items, keys: acc.keys, hesitation_ms: median(acc.hes), key_median_ms: median(acc.med), backspace_share: acc.keys ? acc.backspaces / acc.keys : null });
        const means = Object.fromEntries(Object.entries(cap).filter(([, c]) => c[1] > 0).map(([key, c]) => [key, { mean: c[0] / c[1], n: c[1] }]));
        if (Object.keys(means).length) hooks().onIndicators(user.id, means, { source: 'silent signals' });
        fed = true;
      } catch (err) { console.warn(`boosters: silent signals not applied: ${err.message}`); }
      put(user.id, { silent: { ...b.silent, acc: null } });
    } else put(user.id, { silent: { ...b.silent, acc: { items: acc.items, keys: acc.keys, backspaces: acc.backspaces, hes: acc.hes.slice(-60), med: acc.med.slice(-60), cap } } });
    return { ok: true, kept: acc.items, fed };
  },
};

// ── max-accuracy mode ────────────────────────────────────────────────────────
const maxAccuracy = {
  set(user, on) {
    if (!allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
    put(user.id, { max_accuracy: !!on });
    return { ok: true, on: !!on };
  },
  /** For services/personalize.js and the practice screens: is this learner in it (and still allowed)? */
  isOn(userId) {
    try { const u = db.byId('users', userId); return !!(u && allowed(u) && get(userId).max_accuracy); } catch { return false; }
  },
};

// ── "which is clearer?" pairwise choices ─────────────────────────────────────
// Now and then, after a lesson page (never in a test, a quiz or a checkpoint: only the lesson-finished screen asks), the learner sees two
// short versions of the same explanation of what they just read, written for them, that differ on ONE way of teaching, and says which
// helped more, that there was no difference, or skips. At most CHOICE_PER_LESSON a lesson and CHOICE_PER_DAY a day. The two versions are
// written in the background when the lesson page is opened (prepare, never awaited, only for accounts whose levels are written for them),
// so the page never waits on a model; if they are not ready when the lesson ends, nothing is asked. Which way of teaching is asked about is
// services/personalize.js choiceDimension: where one more choice teaches the app most. On by default for an account the extras are open
// to (a learner under the consent age needs a parent's agreement, as for every extra), and switched off on the Extras page.
const CHOICE_PER_LESSON = 1;
const CHOICE_PER_DAY = Number(process.env.BOOSTER_CHOICE_PER_DAY || 3);
const CHOICE_TTL = 2 * DAY;          // a prepared pair is offered within two days or not at all
const choiceInFlight = new Map();
const PICKS = new Set(['a', 'b', 'same', 'skip']);
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
const choiceOn = () => process.env.BOOSTER_CHOICE !== 'off';
const pairFor = (userId, where) => db.findOne('choice_pairs', (r) => r.user_id === userId && r.track_id === where.trackId && r.grade_id === where.gradeId && r.level === where.level);

const choice = {
  /** May this account be asked now? Rate limits included. */
  mayAsk(user, where, now = Date.now()) {
    if (!choiceOn() || !allowed(user)) return false;
    const c = get(user.id).choice;
    if (!c.on) return false;
    const log = c.log || [];
    if (log.filter((x) => dayOf(Date.parse(x.at)) === dayOf(now)).length >= CHOICE_PER_DAY) return false;
    return log.filter((x) => x.track === where.trackId && x.grade === where.gradeId && x.level === where.level).length < CHOICE_PER_LESSON;
  },
  /**
   * Write the two versions for this lesson in the background (the lesson page was just opened). Returns a promise that never rejects;
   * callers do not await it. `write` is services/level-editor.js writeChoicePair (injectable for tests).
   */
  prepare(user, where, { kind = 'lesson', write = null } = {}) {
    try {
      if (kind !== 'lesson' || !choice.mayAsk(user, where)) return Promise.resolve(null);
      if (pairFor(user.id, where)) return Promise.resolve(null);
      const key = `${user.id}:${where.trackId}:${where.gradeId}:${where.level}`;
      if (choiceInFlight.has(key)) return choiceInFlight.get(key);
      const personalize = require('./personalize'); // eslint-disable-line global-require
      const e = personalize.choiceDimension(user.id);
      if (!e) return Promise.resolve(null);
      const writer = write || require('./level-editor').writeChoicePair; // eslint-disable-line global-require
      const job = Promise.resolve().then(() => writer(user.id, where, e)).then((out) => {
        if (!out || !out.high || !out.low) return null;
        return db.insert('choice_pairs', { user_id: user.id, track_id: where.trackId, grade_id: where.gradeId, level: where.level, stat: e.stat, label: e.label, high: String(out.high).slice(0, 2000), low: String(out.low).slice(0, 2000), model: out.model || null, at: new Date().toISOString() });
      }).catch((err) => { console.warn(`boosters: choice pair not written: ${err.message}`); return null; }).finally(() => choiceInFlight.delete(key));
      choiceInFlight.set(key, job);
      return job;
    } catch (err) {
      console.warn(`boosters: choice not prepared: ${err.message}`);
      return Promise.resolve(null);
    }
  },
  /** The question for a lesson just finished, if its two versions are ready and the learner may be asked: { offer_id, versions: [a, b] } or null. */
  offer(user, where, now = Date.now()) {
    if (!choice.mayAsk(user, where, now)) return null;
    const pair = pairFor(user.id, where);
    if (!pair || now - Date.parse(pair.at) > CHOICE_TTL) return null;
    const b = get(user.id);
    if (b.choice.open && b.choice.open.pair === pair.id) return choice.view(b.choice.open, pair);
    const id = crypto.randomBytes(6).toString('hex');
    // Which version is shown first is decided per offer, so a learner who always picks the first one reads as noise, not as a preference.
    const highFirst = crypto.createHash('sha1').update(`${id}:${pair.id}`).digest()[0] < 128;
    const open = { id, pair: pair.id, stat: pair.stat, at: new Date(now).toISOString(), high: highFirst ? 'a' : 'b', track: where.trackId, grade: where.gradeId, level: where.level };
    put(user.id, { choice: { ...b.choice, open } });
    return choice.view(open, pair);
  },
  view: (open, pair) => {
    const high = { text: pair.high }; const low = { text: pair.low };
    const [a, c] = open.high === 'a' ? [high, low] : [low, high];
    return { offer_id: open.id, question: 'Which explanation helped you more?', versions: [{ key: 'a', text: a.text }, { key: 'b', text: c.text }] };
  },
  /** pick: 'a' | 'b' | 'same' ("no difference") | 'skip'. A skip is kept (it counts toward the limits) but is not evidence. */
  answer(user, offerId, pick, now = Date.now()) {
    if (!allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
    if (!PICKS.has(pick)) return { error: 'Choose a, b, no difference, or skip.', code: 'bad_pick' };
    const b = get(user.id);
    const open = b.choice.open;
    if (!open || open.id !== String(offerId || '')) return { error: 'That question is not open any more.', code: 'not_found' };
    const side = pick === 'skip' ? null : pick === 'same' ? 'same' : pick === open.high ? 'high' : 'low';
    const log = [...(b.choice.log || []), { at: new Date(now).toISOString(), stat: open.stat, track: open.track, grade: open.grade, level: open.level, pick: side || 'skip' }].slice(-200);
    put(user.id, { choice: { ...b.choice, log, open: null } });
    if (side) { try { hooks().onChoice(user.id, open.stat, side); } catch (err) { console.warn(`boosters: choice not applied: ${err.message}`); return { error: 'Your answer could not be saved.', code: 'failed' }; } }
    return { ok: true, counted: !!side };
  },
  set(user, on) {
    if (!allowed(user)) return { error: 'Not available for this account.', code: 'not_allowed' };
    const b = get(user.id);
    put(user.id, { choice: { ...b.choice, on: !!on, open: on ? b.choice.open : null } });
    return { ok: true, on: !!on };
  },
};

// ── status, for the screens ──────────────────────────────────────────────────
function status(user) {
  const ok = allowed(user);
  if (!ok) return { allowed: false };
  const b = get(user.id);
  // eslint-disable-next-line global-require
  const reading = require('./reading-check').status(user.id);
  return {
    allowed: true,
    reading: { offer: reading.offer, taken: reading.taken, last: reading.last },
    questionnaire: { done: !!b.questionnaire, skipped: !!(b.questionnaire && b.questionnaire.skipped), items: ipip.ITEMS.length, minutes: 3 },
    delayed: delayed.due(user.id),
    games: games.defs().map((g) => ({ ...g, last: b.games[g.id] ? { at: b.games[g.id].at, score: b.games[g.id].score } : null })),
    silent: { on: !!b.silent.on },
    max_accuracy: { on: !!b.max_accuracy },
    imports: b.imports ? { at: b.imports.at, kinds: b.imports.kinds } : null,
    choice: { on: !!b.choice.on, answered: (b.choice.log || []).filter((x) => x.pick !== 'skip').length },
  };
}

module.exports = { allowed, ageOf, get, put, status, questionnaire, delayed, delayedCandidates, games, gameScore, silent, maxAccuracy, choice, GAMES, CHECK_ITEMS, CHOICE_PER_DAY, CHOICE_PER_LESSON };
