/**
 * The tutor's learner model: everything the app has learned about one learner over weeks of use, compiled for ONE
 * reply, ranked for that moment and fitted to a fixed budget (tutor-depth, 1 Nov 2026; the owner's goal: "the tutor
 * has the same depth, context and precision as the material modification ... and uses all of it in every reply").
 *
 *   compile(userId, { skillId, about, budget, now }) -> { text, lines, sections, intent, used }
 *
 * Sources (each is a SECTION; every section with data keeps at least one line, so ranking shortens a source and the
 * summary line says what was left out; nothing is dropped whole):
 *
 *   now          the skill on the page: mastery, attempts, predicted recall from the forgetting model
 *                (services/mastery.js predictedRecall with the learner's own curve, scorecard.forgettingCurve), the
 *                days since it was last practised, and the mix-up they show on it.
 *   goals        goals with their target dates and days left (services/goals.js), the ACT date (act-scores), and
 *                dated goals they told the tutor (tutor-facts). A newer statement about the same event wins.
 *   measures     all 100 scorecard measures: MEASURED value and confidence (scorecard.read). The ones that lean and
 *                are measured enough are ranked by |value - 50| x confidence, boosted for what this message is
 *                about (stuck -> resilience, explain -> intake and representation, planning -> motivation, pacing,
 *                memory); the rest are counted ("9 more leaning, 31 near average, 52 not measured yet").
 *   teach        the learning spec (services/learning-spec.js, consumed, never edited): every measure folded into
 *                levers, written for the 'tutor' surface, with the interests and dislikes this file resolved.
 *   explain      which ways of explaining worked or failed for them (tutor-strategy counts, "worked" facts).
 *   mixups       misconceptions: the tutor's own (with the wrong answer and how often) and the error tags on their
 *                answers. One they have since fixed (at least 4 answers on that skill after it, 80% right, mastery
 *                0.7 or more) is shown as fixed, not current.
 *   hard         difficulties and strengths: repeated struggles and strengths from the learner record, and what they
 *                told the tutor they find hard, checked against their answers since (said hard, answers now solid).
 *   memory       what is solid and what is fading: every practised skill's predicted recall now.
 *   tastes       interests and hobbies (survey, tutor facts, learner record) minus anything they later said they
 *                dislike or dropped, and the dislikes to avoid. The newest statement about a thing wins.
 *   told         other things they told the app (learner-record preferences, opinions, feelings, notes).
 *   stale        facts that went out of date in the last 45 days and what replaced them, so an old chat snippet or
 *                summary that still says the old thing is not believed.
 *
 * What it never does: carry an answer key, quote a question's correct answer, or claim certainty (each line says how
 * sure, and the block says these are notes). It reads only this learner's rows. It makes no model call.
 *
 * Budget: MODEL_BUDGET characters (about 650 tokens). Phase 1 gives each section with data its best line; phase 2
 * fills the rest by score across sections; phase 3 adds one "(+N more: ...)" line per shortened section if room is
 * left. Tested in scripts/tutor-depth-test.js.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');

const MODEL_BUDGET = 2600;
const DAY = 86400000;
const SECTION_ORDER = ['now', 'goals', 'measures', 'teach', 'explain', 'mixups', 'hard', 'memory', 'tastes', 'told', 'stale'];
const SECTION_LABEL = {
  now: 'Right now', goals: 'Goals and deadlines', measures: 'Measures that matter here (measured value of 100, how sure)',
  teach: 'How to teach them (from all their measures)', explain: 'Ways of explaining', mixups: 'Mix-ups',
  hard: 'Difficulties and strengths', memory: 'Solid and fading', tastes: 'Interests and dislikes', told: 'They told you',
  stale: 'Out of date (do not use)',
};

const clip = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const pct = (x) => `${Math.round(x * 100)}%`;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayOf = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ''; const d = new Date(t); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const daysAgo = (iso, now) => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.max(0, Math.round((now - t) / DAY)) : null; };
const STOPW = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'what', 'how', 'are', 'you', 'they', 'them', 'their', 'when', 'from', 'have', 'has', 'not', 'but', 'can', 'does', 'did', 'was', 'were', 'will', 'about', 'which', 'your', 'into', 'than', 'then', 'there', 'here', 'who', 'why', 'some', 'any', 'just', 'like', 'get', 'got', 'its', 'it', 'me', 'my', 'is', 'do', 'to', 'of', 'in', 'on', 'a', 'i']);
function toks(t) {
  const out = new Set();
  for (const w of String(t || '').toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 3 && !STOPW.has(w)) out.add(w.replace(/(ing|ed|es|s)$/, ''));
  return out;
}
const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n += 1; return n; };

// ── what this message is about ─────────────────────────────────────────────
const INTENTS = {
  answer: /\b(just tell|tell me the answer|give (it|me) the answer|what('?s| is) the answer|is it [a-d]\b|solve it|the answer)\b/i,
  stuck: /\b(stuck|confus|don'?t (get|understand)|no idea|idk|lost|i give up|makes no sense|so hard|frustrat|ugh|hate this)\b/i,
  plan: /\b(what should i|work on|plan|study plan|how am i doing|progress|ready for|how long|how many days|deadline|schedule|today|this week|before my|prepare|review)\b/i,
  recall: /\b(remember|last time|you said|again\?|forgot|forget|keep forgetting|used to know)\b/i,
  explain: /\b(explain|why|how does|how do|what is|what are|example|understand|show me|meaning|mean)\b/i,
};
const INTENT_CATS = {
  answer: ['resilience', 'metacognition'],
  stuck: ['resilience', 'representation', 'intake'],
  plan: ['motivation', 'pacing', 'memory', 'metacognition'],
  recall: ['memory'],
  explain: ['intake', 'representation', 'reasoning', 'engagement'],
  chat: ['engagement', 'motivation'],
};
// Measures that shape a tutor's reply on any message.
const TUTOR_STATS = new Set(['frustration_threshold', 'hint_dependency', 'productive_struggle', 'help_seeking', 'brevity_preference', 'humor_receptivity',
  'praise_sensitivity', 'feedback_tone_sensitivity', 'worked_example_dependence', 'analogical_transfer', 'spatial_anchoring', 'dialogic_preference',
  'self_efficacy', 'evaluation_anxiety', 'vocabulary_ceiling', 'attention_runway', 'step_explicitness', 'abstraction_tolerance', 'interest_transfer', 'tone_formality']);

function intentOf(text) {
  const t = String(text || '');
  for (const id of ['answer', 'stuck', 'plan', 'recall', 'explain']) if (INTENTS[id].test(t)) return id;
  return 'chat';
}

// ── sources ────────────────────────────────────────────────────────────────

function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }

function recallCurve(userId) {
  // eslint-disable-next-line global-require
  return safe(() => require('./scorecard').forgettingCurve({ userId }), null);
}

/** Every practised skill with its mastery and predicted recall now. */
function skillStates(userId, now) {
  // eslint-disable-next-line global-require
  const mastery = require('./mastery');
  const rc = recallCurve(userId);
  return db.find('skill_states', (s) => s.user_id === userId && (s.attempts || 0) > 0).map((s) => {
    const last = Date.parse(s.last_seen_at);
    const days = Number.isFinite(last) ? Math.max(0, now - last) / DAY : null;
    const recall = days === null ? null : safe(() => mastery.predictedRecall(s, days, rc), null);
    return { ...s, days, recall, name: curriculum.skillName(s.skill_id) };
  });
}

/** Error tags on their answers per skill: count, last date, and whether answers since show it fixed. */
function errorTags(userId, statesById) {
  const items = db.find('items', (i) => i.user_id === userId && i.role !== 'placement' && typeof i.correct === 'boolean');
  const bySkill = {};
  for (const i of items) (bySkill[i.skill_id] = bySkill[i.skill_id] || []).push(i);
  const out = [];
  for (const [skill, list] of Object.entries(bySkill)) {
    const tags = {};
    list.forEach((i, idx) => { if (i.correct === false && i.error_tag) { const t = tags[i.error_tag] || (tags[i.error_tag] = { n: 0, last: -1, at: null, said: null }); t.n += 1; t.last = idx; t.at = i.created_at || i.answered_at || null; t.said = i.user_answer || t.said; } });
    for (const [tag, t] of Object.entries(tags)) {
      const after = list.slice(t.last + 1);
      const right = after.filter((i) => i.correct).length;
      const st = statesById[skill];
      const fixed = after.length >= 4 && right / after.length >= 0.8 && (!st || st.mastery >= 0.7);
      out.push({ skill, tag, n: t.n, at: t.at, said: t.said, fixed, after: after.length });
    }
  }
  return out;
}

function survey(userId) {
  // eslint-disable-next-line global-require
  const p = safe(() => require('./learner').getProfile(userId), {});
  return { survey: (p && p.survey) || {}, at: (p && (p.survey_at || p.updated_at)) || null };
}

function recordFacts(userId) {
  const rec = db.findOne('learner_records', (r) => r.user_id === userId);
  return ((rec && rec.facts) || []).filter((f) => f.status !== 'superseded');
}

/**
 * Interests and dislikes, newest statement per thing. Returns { interests: [{text, at, from}], dislikes: [...],
 * dropped: [{text, at, by}] } where `dropped` is an interest a later dislike overrules.
 */
function tastes(userId, facts, rec) {
  /* eslint-disable global-require */
  const tf = require('./tutor-facts');
  const ls = require('./learning-spec');
  /* eslint-enable global-require */
  const s = survey(userId);
  const said = [];
  for (const k of ['interests', 'hobbies', 'sports']) for (const d of safe(() => ls.interestsFromText(s.survey[k] || ''), [])) said.push({ pol: 1, text: d, at: s.at, from: 'survey' });
  for (const d of safe(() => ls.splitDislikes(ls.dislikesFromText(`${s.survey.notes || ''}. ${s.survey.dislikes || ''}`)).domains || [], [])) said.push({ pol: -1, text: d, at: s.at, from: 'survey' });
  for (const f of facts) {
    if (f.kind === 'interest') said.push({ pol: 1, text: f.text, at: f.last_confirmed_at || f.first_at, from: 'chat' });
    if (f.kind === 'dislike') said.push({ pol: -1, text: f.text, at: f.last_confirmed_at || f.first_at, from: 'chat' });
  }
  for (const f of rec.filter((x) => x && x.status !== 'superseded')) {
    if (f.kind === 'interest' && f.status === 'solid') said.push({ pol: 1, text: f.text, at: f.last_at || f.first_at, from: 'record' });
    if (f.kind === 'dislike' && f.status === 'solid') said.push({ pol: -1, text: f.text, at: f.last_at || f.first_at, from: 'record' });
  }
  const time = (x) => { const t = Date.parse(x.at); return Number.isFinite(t) ? t : 0; };
  said.sort((a, b) => time(b) - time(a)); // newest first
  const interests = [];
  const dislikes = [];
  const dropped = [];
  for (const x of said) {
    const newer = [...interests, ...dislikes].find((y) => tf.sharesTaste(y.text, x.text) || y.text.toLowerCase() === x.text.toLowerCase());
    if (newer) {
      if (newer.pol !== x.pol && x.pol === 1) dropped.push({ ...x, by: newer });
      continue;
    }
    (x.pol === 1 ? interests : dislikes).push(x);
  }
  return { interests, dislikes, dropped };
}

/** Short domain words for the spec ("Plays basketball on the school team" -> "basketball"). */
function domainWords(text) {
  // eslint-disable-next-line global-require
  const tt = require('./tutor-facts').tasteTokens(text);
  const words = String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && tt.has(w.replace(/(ing|es|s)$/, '')));
  return words.slice(0, 3).join(' ') || clip(text, 30);
}

function goalItems(userId, facts, now, intent) {
  const out = [];
  /* eslint-disable global-require */
  const goals = safe(() => require('./goals').listFor(userId), []);
  const tf = require('./tutor-facts');
  /* eslint-enable global-require */
  for (const g of goals.slice(0, 4)) {
    const track = curriculum.getTrack(g.track_id);
    const grade = g.grade_id ? curriculum.getGrade(g.track_id, g.grade_id) : null;
    const where = `${track ? track.name : g.track_id}${grade ? ` ${grade.name}` : ''}`;
    const when = g.target_date ? ` by ${g.target_date} (${g.days_left} days left)` : '';
    const soon = g.days_left !== null && g.days_left <= 60;
    out.push({ text: `${where}: ${g.label}${when}${g.text ? ` (their words: "${clip(g.text, 80)}")` : ''}`, score: (soon ? 2.6 : 1.3) * (intent === 'plan' ? 1.5 : 1), short: g.label });
  }
  const act = safe(() => require('./act-scores').summary(userId, now), null); // eslint-disable-line global-require
  if (act && act.profile && act.profile.test_date) {
    out.push({ text: `ACT test date ${act.profile.test_date}${act.days_to_test !== null && act.days_to_test !== undefined ? ` (${act.days_to_test} days)` : ''}${act.profile.target ? `, target ${act.profile.target}` : ''}${act.latest_composite !== null && act.latest_composite !== undefined ? `, latest composite ${act.latest_composite}` : ''}`, score: 2.4 * (intent === 'plan' ? 1.5 : 1), short: 'ACT' });
  }
  for (const f of facts.filter((x) => x.kind === 'goal')) {
    const date = tf.dateIn(f.text, Date.parse(f.first_at) || now);
    const left = date ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(new Date(now).toISOString().slice(0, 10))) / DAY) : null;
    const when = date ? (left >= 0 ? ` [${date}, ${left} days away]` : ` [${date}, already past]`) : '';
    const soon = left !== null && left >= 0 && left <= 60;
    out.push({ text: `They said: ${clip(f.text, 120)}${when} (told ${dayOf(f.last_confirmed_at || f.first_at)})`, score: (soon ? 2.7 : left !== null && left < 0 ? 0.4 : 1.6) * (intent === 'plan' ? 1.5 : 1), short: clip(f.text, 40) });
  }
  return out;
}

function measureItems(userId, intent) {
  /* eslint-disable global-require */
  const scorecard = require('./scorecard');
  const { STATS } = require('./scorecard/stats');
  /* eslint-enable global-require */
  const card = db.findOne('scorecards', (r) => r.user_id === userId);
  if (!card) return { items: [], summary: '' };
  const cats = INTENT_CATS[intent] || [];
  const reads = STATS.map((s) => ({ s, r: safe(() => scorecard.read(card, s.id, {}), null) })).filter((x) => x.r);
  const items = [];
  let near = 0;
  let unmeasured = 0;
  for (const { s, r } of reads) {
    const m = Number(r.measured);
    const c = Number(r.confidence) || 0;
    if (c < 20) { unmeasured += 1; continue; }
    if (!Number.isFinite(m) || Math.abs(m - 50) < 10) { near += 1; continue; }
    const base = (Math.abs(m - 50) / 50) * (c / 100);
    const boost = (cats.includes(s.category) ? 1.8 : 1) * (TUTOR_STATS.has(s.id) ? 1.3 : 1);
    items.push({ id: s.id, text: `${s.name} ${m} (${m >= 50 ? s.high : s.low}; ${c}% sure)`, score: 3 * base * boost, short: s.name.toLowerCase() });
  }
  items.sort((a, b) => b.score - a.score);
  return { items, summary: `of all ${reads.length}: ${items.length} lean clearly, ${near} near average, ${unmeasured} not measured enough yet` };
}

function teachItems(userId, skillId, tasteSets) {
  // eslint-disable-next-line global-require
  const ls = require('./learning-spec');
  const context = { interests: tasteSets.interests.map((x) => domainWords(x.text)), dislikes: tasteSets.dislikes.map((x) => domainWords(x.text)) };
  const spec = safe(() => ls.buildSpec(userId, { skillIds: skillId ? [skillId] : [], context }), null);
  if (!spec || spec.isDefault) return [];
  const lines = safe(() => ls.specToLines(spec, { surface: 'tutor', bare: true }), []);
  return lines.filter((l) => !/^Language: write at/.test(l) || spec.learner.esl || spec.language.plainLanguage)
    .map((l, i) => ({ text: clip(l.replace(/^Language: write at/, 'Talk at'), 220), score: 2.1 - 0.12 * i, short: clip(l, 30) }));
}

function explainItems(userId, skillId, facts, intent) {
  /* eslint-disable global-require */
  const strategy = require('./tutor-strategy');
  /* eslint-enable global-require */
  const ranked = safe(() => strategy.ranked(userId, skillId), []);
  const tried = ranked.filter((r) => r.tried > 0);
  const out = [];
  const boost = intent === 'explain' || intent === 'stuck' ? 1.3 : 1;
  const name = (s) => s.replace(/_/g, ' ');
  const worked = tried.filter((r) => r.worked / r.tried >= 0.6).sort((a, b) => b.worked - a.worked);
  const failed = tried.filter((r) => r.tried >= 2 && r.worked / r.tried < 0.34).sort((a, b) => b.tried - a.tried);
  if (worked.length) out.push({ text: `worked for them: ${worked.map((r) => `${name(r.style)} ${r.worked} of ${r.tried}`).join(', ')}`, score: 2.4 * boost, short: 'worked' });
  if (failed.length) out.push({ text: `did not land, avoid: ${failed.map((r) => `${name(r.style)} ${r.worked} of ${r.tried}`).join(', ')}`, score: 2.5 * boost, short: 'avoid' });
  for (const f of facts.filter((x) => x.kind === 'worked').slice(0, 3)) out.push({ text: `noted: ${clip(f.text, 110)} (${dayOf(f.last_confirmed_at || f.first_at)})`, score: 1.4 * boost, short: clip(f.text, 30), factId: f.id });
  return out;
}

function mixupItems(userId, skillId, facts, tags, statesById, now, about) {
  const out = [];
  const q = toks(about);
  for (const t of tags) {
    const on = skillId && t.skill === skillId;
    const name = curriculum.skillName(t.skill);
    const tag = t.tag.replace(/_/g, ' ');
    if (t.fixed) out.push({ text: `fixed: ${tag} on ${name} (${t.n}x before; right on ${t.after} answers since; watch for a relapse)`, score: on ? 1.6 : 0.5, short: tag });
    else out.push({ text: `current: ${tag} on ${name} (${t.n}x, last ${dayOf(t.at) || 'recently'})`, score: (on ? 3 : 1.2 + 0.2 * Math.min(t.n, 5)) * (overlap(toks(`${name} ${tag}`), q) ? 1.4 : 1), short: tag });
  }
  for (const f of facts.filter((x) => x.kind === 'misconception')) {
    const on = skillId && f.skill_id === skillId;
    const st = f.skill_id ? statesById[f.skill_id] : null;
    const later = st && Date.parse(st.last_seen_at) > Date.parse(f.last_confirmed_at || f.first_at);
    const fixed = !!(st && later && st.mastery >= 0.8 && st.attempts >= 8);
    const text = `${fixed ? 'probably fixed' : 'they believed'}: ${clip(f.text, 110)}${f.wrong_answer ? ` (said "${clip(f.wrong_answer, 40)}")` : ''}${f.strength > 1 ? `, ${f.strength}x` : ''}, last ${dayOf(f.last_confirmed_at || f.first_at)}${fixed ? `; mastery since ${pct(st.mastery)}` : ''}`;
    out.push({ text, score: (fixed ? 0.6 : on ? 3 : 1.3) * (overlap(toks(f.text), q) ? 1.5 : 1), short: clip(f.text, 30), factId: f.id });
  }
  return out;
}

function hardItems(userId, skillId, facts, rec, statesById, now, about) {
  const out = [];
  const q = toks(about);
  for (const f of facts.filter((x) => x.kind === 'hard')) {
    const st = f.skill_id ? statesById[f.skill_id] : null;
    const solidSince = st && st.mastery >= 0.8 && st.attempts >= 5 && Date.parse(st.last_seen_at) > Date.parse(f.last_confirmed_at || f.first_at);
    const on = skillId && f.skill_id === skillId;
    out.push({ text: solidSince ? `said it was hard (${dayOf(f.first_at)}): ${clip(f.text, 90)}; their answers since show it solid (${pct(st.mastery)})` : `finds hard: ${clip(f.text, 110)} (said ${dayOf(f.last_confirmed_at || f.first_at)})`, score: (solidSince ? 0.7 : on ? 2.6 : 1.1) * (overlap(toks(f.text), q) ? 1.5 : 1), short: clip(f.text, 30), factId: f.id });
  }
  for (const f of rec.filter((x) => (x.kind === 'struggle' && (x.support || 1) >= 2) || (x.kind === 'strength' && x.status === 'solid'))) {
    const rel = overlap(toks(`${f.topic || ''} ${f.text}`), q);
    out.push({ text: `${f.kind === 'struggle' ? `struggles (seen on ${f.support} levels)` : 'strong at'}: ${clip(`${f.topic ? `${f.topic}: ` : ''}${f.text}`, 110)}${f.hint && f.kind === 'struggle' ? `; a hint idea: ${clip(f.hint, 70)}` : ''}`, score: (f.kind === 'struggle' ? 1.3 : 0.9) * (rel ? 1.8 : 1), short: clip(f.topic || f.text, 30) });
  }
  return out;
}

function memoryItems(states, skillId, intent) {
  const out = [];
  const pb = intent === 'plan' ? 2 : intent === 'recall' ? 1.5 : 1;
  for (const s of states) {
    if (s.skill_id === skillId) continue; // in "now"
    const ago = s.days === null ? '' : `, last practised ${Math.round(s.days) === 1 ? '1 day' : `${Math.round(s.days)} days`} ago`;
    if (s.mastery >= 0.6 && s.recall !== null && s.recall < 0.7) out.push({ text: `fading: ${s.name} (was ${pct(s.mastery)}; predicted recall now ${pct(s.recall)}${ago}; review before building on it)`, score: 1.2 * pb * (1 + (0.7 - s.recall)), short: s.name });
    else if (s.mastery >= 0.75 && (s.recall === null || s.recall >= 0.8)) out.push({ text: `solid: ${s.name} (${pct(s.mastery)} over ${s.attempts}${s.recall !== null ? `, recall ${pct(s.recall)}` : ''})`, score: 0.45 * (intent === 'plan' ? 1.5 : 1), short: s.name });
    else if (s.mastery < 0.5 && s.attempts >= 3) out.push({ text: `still weak: ${s.name} (${pct(s.mastery)} over ${s.attempts})`, score: 1.0 * (intent === 'plan' ? 1.6 : 1), short: s.name });
  }
  return out;
}

function tasteItems(tasteSets, intent, now) {
  const out = [];
  const use = tasteSets.interests.slice(0, 6);
  if (use.length) out.push({ text: `use for examples when it fits: ${use.map((x) => `${clip(x.text, 50)}${x.from === 'chat' ? ` (said ${dayOf(x.at)})` : ''}`).join('; ')}`, score: 2.0 * (intent === 'explain' ? 1.4 : 1), short: 'interests' });
  const avoid = tasteSets.dislikes.slice(0, 6);
  if (avoid.length) out.push({ text: `never build examples on: ${avoid.map((x) => `${clip(x.text, 50)}${x.at ? ` (${dayOf(x.at)})` : ''}`).join('; ')}`, score: 2.8, short: 'dislikes' });
  const seenDrop = new Set();
  for (const d of tasteSets.dropped.filter((x) => { const k = x.text.toLowerCase(); if (seenDrop.has(k)) return false; seenDrop.add(k); return true; }).slice(0, 3)) out.push({ text: `no longer: ${clip(d.text, 40)} (${d.from === 'survey' ? 'on their sign-up form' : `said ${dayOf(d.at)}`}; overruled ${dayOf(d.by.at)} by "${clip(d.by.text, 60)}")`, score: 2.3, short: clip(d.text, 20) });
  return out;
}

function toldItems(rec, about) {
  const q = toks(about);
  return rec.filter((f) => ['preference', 'opinion', 'emotion', 'note'].includes(f.kind) && f.status === 'solid')
    .map((f) => ({ text: `${f.kind === 'preference' ? 'prefers' : f.kind === 'emotion' ? 'feels' : f.kind === 'opinion' ? 'thinks' : 'note'}: ${clip(`${f.topic ? `${f.topic}: ` : ''}${f.text}`, 110)}`, score: (f.kind === 'preference' ? 1.5 : 0.8) * (overlap(toks(f.text), q) ? 2 : 1), short: clip(f.text, 30) }));
}

function staleItems(userId, now) {
  // eslint-disable-next-line global-require
  const old = safe(() => require('./tutor-facts').outOfDate(userId, { now }), []);
  return old.slice(0, 4).map(({ old: o, by }) => ({ text: `"${clip(o.text, 70)}" (${dayOf(o.first_at)}) is out of date${by ? `: since ${dayOf(by.first_at)}, "${clip(by.text, 70)}"` : ''}`, score: 2.6, short: clip(o.text, 30) }));
}

function nowItems(states, skillId, tags, now) {
  if (!skillId) return [];
  const s = states.find((x) => x.skill_id === skillId);
  const name = curriculum.skillName(skillId);
  if (!s) return [{ text: `${name}: new to them (no answers on it yet)`, score: 3.5, short: name }];
  const recall = s.recall !== null ? `, predicted recall now ${pct(s.recall)}` : '';
  const ago = s.days !== null ? ` (last practised ${Math.round(s.days) === 1 ? '1 day' : `${Math.round(s.days)} days`} ago)` : '';
  const cur = tags.filter((t) => t.skill === skillId && !t.fixed).map((t) => t.tag.replace(/_/g, ' '));
  return [{ text: `${name}: mastery ${pct(s.mastery)} over ${s.attempts} answers${recall}${ago}${cur.length ? `; their mix-up here: ${cur.slice(0, 2).join(', ')}` : ''}`, score: 3.5, short: name }];
}

// ── compile ────────────────────────────────────────────────────────────────

/** Fit sections into `budget` characters: best line per section, then by score, then "(+N more)" lines. */
function fit(sections, budget) {
  const chosen = Object.fromEntries(SECTION_ORDER.map((id) => [id, []]));
  let used = 0;
  const cost = (t) => t.length + 3;
  const has = SECTION_ORDER.filter((id) => sections[id] && sections[id].items.length);
  const headCost = (id) => SECTION_LABEL[id].length + 3;
  // Phase 1: every source with data keeps its best line.
  for (const id of has) {
    const top = [...sections[id].items].sort((a, b) => b.score - a.score)[0];
    const c = cost(top.text) + headCost(id);
    if (used + c > budget) continue;
    chosen[id].push(top);
    used += c;
  }
  // Phase 2: the rest by score, across sources, with 8% held back for the summaries.
  const reserve = Math.round(budget * 0.08);
  const rest = has.flatMap((id) => sections[id].items.filter((x) => !chosen[id].includes(x)).map((x) => ({ id, x })))
    .sort((a, b) => b.x.score - a.x.score);
  for (const { id, x } of rest) {
    const c = cost(x.text) + (chosen[id].length ? 0 : headCost(id));
    if (used + c > budget - reserve) continue;
    chosen[id].push(x);
    used += c;
  }
  // Phase 3: what was left out of each source, as one short line.
  for (const id of has) {
    const left = sections[id].items.filter((x) => !chosen[id].includes(x));
    const extra = sections[id].summary || '';
    if (!left.length && !extra) continue;
    const names = left.map((x) => x.short).filter(Boolean);
    const line = left.length ? `(+${left.length} more${names.length ? `: ${clip(names.join(', '), 70)}` : ''}${extra ? `; ${extra}` : ''})` : `(${extra})`;
    if (used + cost(line) <= budget) { chosen[id].push({ text: line, summary: true }); used += cost(line); }
  }
  const lines = [];
  for (const id of SECTION_ORDER) {
    if (!chosen[id].length) continue;
    // Within a section, highest score first; the summary line last.
    const body = chosen[id].filter((x) => !x.summary).sort((a, b) => b.score - a.score).concat(chosen[id].filter((x) => x.summary));
    lines.push(`${SECTION_LABEL[id]}: ${body.map((x) => x.text).join(' | ')}`);
  }
  return { lines, used, chosen };
}

/**
 * The learner model for one reply. `skillId` is the page's skill (only a known one counts), `about` the learner's
 * message and what is on screen, `exclude` fact ids already in the prompt (tutor-facts `relevant`). Never throws:
 * an error is an empty model.
 */
function compile(userId, { skillId = null, about = '', budget = MODEL_BUDGET, now = Date.now(), exclude = null } = {}) {
  const empty = { text: '', lines: [], sections: {}, intent: 'chat', used: 0 };
  if (!userId) return empty;
  try {
    const skill = typeof skillId === 'string' && curriculum.skillName(skillId) !== skillId ? skillId : null;
    const intent = intentOf(about);
    /* eslint-disable global-require */
    const facts = safe(() => require('./tutor-facts').list(userId, now), []);
    /* eslint-enable global-require */
    const skip = exclude instanceof Set ? exclude : new Set(exclude || []);
    const rec = safe(() => recordFacts(userId), []);
    const states = safe(() => skillStates(userId, now), []);
    const byId = Object.fromEntries(states.map((s) => [s.skill_id, s]));
    const tags = safe(() => errorTags(userId, byId), []);
    const tasteSets = safe(() => tastes(userId, facts, rec), { interests: [], dislikes: [], dropped: [] });
    const m = safe(() => measureItems(userId, intent), { items: [], summary: '' });
    const notSkipped = (x) => !(x.factId && skip.has(x.factId));
    const sections = {
      now: { items: safe(() => nowItems(states, skill, tags, now), []) },
      goals: { items: safe(() => goalItems(userId, facts, now, intent), []) },
      measures: { items: m.items, summary: m.summary },
      teach: { items: safe(() => teachItems(userId, skill, tasteSets), []) },
      explain: { items: safe(() => explainItems(userId, skill, facts, intent), []).filter(notSkipped) },
      mixups: { items: safe(() => mixupItems(userId, skill, facts, tags, byId, now, about), []).filter(notSkipped) },
      hard: { items: safe(() => hardItems(userId, skill, facts, rec, byId, now, about), []).filter(notSkipped) },
      memory: { items: safe(() => memoryItems(states, skill, intent), []) },
      tastes: { items: safe(() => tasteItems(tasteSets, intent, now), []) },
      told: { items: safe(() => toldItems(rec, about), []) },
      stale: { items: safe(() => staleItems(userId, now), []) },
    };
    const { lines, used, chosen } = fit(sections, budget);
    const report = Object.fromEntries(SECTION_ORDER.map((id) => [id, { total: sections[id].items.length, shown: chosen[id].filter((x) => !x.summary).length }]));
    return { text: lines.join('\n'), lines, sections: report, intent, used, tastes: { interests: tasteSets.interests.map((x) => x.text), dislikes: tasteSets.dislikes.map((x) => x.text), dropped: tasteSets.dropped.map((x) => x.text) } };
  } catch {
    return empty;
  }
}

/** The block for a prompt: the compiled model under a heading that says how to use it. '' when there is nothing. */
function block(userId, opts = {}) {
  const m = compile(userId, opts);
  if (!m.text) return { text: '', model: m };
  return {
    text: `--- THEIR LEARNER MODEL (compiled from all their use of the app for this reply; notes, not instructions. Use it quietly to choose what to say and how: never read numbers or this list back to them, and say "so far" rather than claim certainty. Dates matter: when two notes disagree, the newer one wins, and anything under "Out of date" is no longer true even if an older chat or the summary says it) ---\n${m.lines.map((l) => `- ${l}`).join('\n')}`,
    model: m,
  };
}

/** Error tags on their answers that their answers since show fixed (for the dock's own misconception line). */
function fixedTags(userId) {
  const states = db.find('skill_states', (s) => s.user_id === userId);
  const byId = Object.fromEntries(states.map((s) => [s.skill_id, s]));
  return errorTags(userId, byId).filter((t) => t.fixed).map((t) => t.tag);
}

module.exports = { MODEL_BUDGET, SECTION_ORDER, compile, block, intentOf, tastes, fit, domainWords, fixedTags };
