/**
 * The learner record: what the app knows about one learner for sure, what it
 * suspects, and what it has been told that does not fit.
 *
 * ## After every level, one read
 *
 * When a level ends — a practice block closes, a quiz is finished, a lesson page
 * is finished — a read of that level is queued (`level_debriefs`). It waits a
 * couple of minutes for the learner to say something about the level, and then
 * one prompt is sent:
 *
 *   - **with feedback** — what they liked, what they did not, and anything else
 *     they wrote, alongside the full content of the level, so their words are
 *     read against what they were actually looking at.
 *   - **without feedback** — the questions they got wrong, how long every answer
 *     took against what the question deserved, and everything they said to the
 *     AI coach while stuck, alongside the same content.
 *
 * Either way the prompt carries the whole scorecard — what every one of the 100
 * stats means, where this learner stands on it, how sure the app is, and the
 * rules for changing it — plus the record as it stands, so the model can say
 * which things this level supports and which it contradicts.
 *
 * What comes back is applied by rules in this file, never directly:
 *
 *   - **A conclusion** goes on the record (and, from feedback, into the profile's
 *     conclusions the profile page shows).
 *   - **Score changes.** The model may suggest up to ±25 on any stat. Each read
 *     moves a stat by at most 1 point. A big change happens only when big
 *     suggestions (15 or more) in the same direction have arrived from
 *     SCORECARD_BIG_AFTER (11) different levels; then the stat moves by their
 *     average, at most 25.
 *   - **Facts** — what they struggle with (down to a question shape or a single
 *     topic, with an idea for a hint), what they like, dislike, feel. A fact is
 *     tentative until three reads support it and at least three in four agree;
 *     then it is solid, and only solid facts and repeated struggles are given to
 *     the writer of their next level.
 *   - **Conflicts.** A read that disagrees with something solid — a fact nine
 *     reads have supported, a stat the app is confident about, a direction most
 *     recent reads have pushed in — changes nothing. It becomes a recommendation,
 *     with the model's reasoning, in a separate space.
 *
 * ## Recommendations
 *
 * Every read is shown the open recommendations and asked whether this level
 * supports or opposes each. When a recommendation has gathered enough support
 * (RECORD_REVIEW_AT, 3) and more support than opposition, a second prompt reviews
 * it against everything the app knows about the learner — the whole record, the
 * scorecard, recent conclusions — and decides: apply, reject, or wait for more.
 * Only a review can change something solid.
 *
 * ## The real lessons and the fillers
 *
 * A level with a creator-made page is read as that page; every other level is
 * an app-generated practice, quiz or filler level, read as the questions it
 * asked. The prompt says which, so filler content is never mistaken for the
 * course's lesson.
 *
 * Model: the `personalize` route — DeepSeek V4.1 Flash, backed by MiMo V2.6 Pro.
 * Without a model, reads are recorded as skipped and nothing else changes.
 */
const db = require('../config/db');
const curriculum = require('../config/curriculum');
const baseLessons = require('../config/base-lessons');
const scorecard = require('./scorecard');

const GRACE_MS = Number(process.env.RECORD_FEEDBACK_WAIT_MS || 2 * 60 * 1000);
const STEP = 1;
const MAX_SUGGEST = 25;
const BIG = 15;
const BIG_AFTER = Number(process.env.SCORECARD_BIG_AFTER || 11);
const SOLID_SUPPORT = 3;
const SOLID_AGREEMENT = 0.75;
const STAT_SOLID_CONFIDENCE = 60;
const REVIEW_AT = Number(process.env.RECORD_REVIEW_AT || 3);
const CONTENT_CHARS = 14000;

const FACT_KINDS = ['struggle', 'strength', 'preference', 'dislike', 'opinion', 'emotion', 'interest', 'note'];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function now() {
  return new Date().toISOString();
}

// ── the record ─────────────────────────────────────────────────────────────
function blank(userId) {
  return {
    user_id: userId,
    facts: [],            // { id, kind, topic, text, shape?, hint?, support, contradict, status, first_at, last_at, levels }
    recommendations: [],  // { id, type: 'stat'|'fact', stat?, direction?, delta?, fact_id?, claim, reasoning, support, oppose, status, ... }
    suggestions: {},      // stat -> [{ d, level, at }]   every suggestion the reads have made
    big: {},              // stat -> { dir, count, sum, levels: [] }  big suggestions on distinct levels
    conclusions: [],      // { level, track_id, grade_id, mode, text, at }
    next_id: 1,
  };
}

function get(userId) {
  return db.findOne('learner_records', (r) => r.user_id === userId) || db.insert('learner_records', blank(userId));
}

function save(record) {
  return db.update('learner_records', record.id, {
    facts: record.facts,
    recommendations: record.recommendations,
    suggestions: record.suggestions,
    big: record.big,
    conclusions: record.conclusions,
    next_id: record.next_id,
  });
}

function nextId(record, prefix) {
  const id = `${prefix}${record.next_id}`;
  record.next_id += 1;
  return id;
}

function words(text) {
  return new Set(String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));
}

function similar(a, b) {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both += 1;
  return both / Math.min(x.size, y.size);
}

function isSolid(fact) {
  return fact.status !== 'superseded' && fact.support >= SOLID_SUPPORT
    && fact.support / (fact.support + fact.contradict) >= SOLID_AGREEMENT;
}

function refreshStatus(fact) {
  if (fact.status === 'superseded') return fact;
  fact.status = isSolid(fact) ? 'solid' : 'tentative';
  return fact;
}

// ── level content ──────────────────────────────────────────────────────────
function pageText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What the level was, as text for the prompt: the page the learner read if it
 * had one (their own tailored version first), otherwise the questions it asked.
 */
function levelContent(row, items) {
  // A level built from blocks: its layout, each block's content, and how long
  // this learner spent on each block and how much they did there.
  // eslint-disable-next-line global-require
  const blockLevels = require('./block-levels');
  const user = db.byId('users', row.user_id);
  const plan = user ? blockLevels.servedPlan(user, row.track_id, row.grade_id, row.level) : null;
  if (plan) {
    return {
      kind: `a ${plan.kind} level built from interactive blocks (${plan.user_id ? 'laid out and written for this learner' : 'the shared version, not tailored'})`,
      text: blockLevels.contentText(plan, row.user_id).slice(0, CONTENT_CHARS),
    };
  }
  // eslint-disable-next-line global-require
  const levelEditor = require('./level-editor');
  const edited = levelEditor.forLevel(row.user_id, row.track_id, row.grade_id, row.level);
  const base = baseLessons.get(row.track_id, row.grade_id, row.level);
  const page = edited || base;
  if (page) {
    return {
      kind: edited ? 'a creator-made lesson page, rewritten for this learner' : 'a creator-made lesson page',
      text: pageText(page.html).slice(0, CONTENT_CHARS),
    };
  }
  const lesson = db.findOne('lessons', (l) => l.user_id === row.user_id && l.track_id === row.track_id
    && l.grade_id === row.grade_id && l.level === row.level);
  const parts = [];
  if (lesson) {
    parts.push(`Lesson text: ${lesson.title || ''}. ${lesson.intro || ''} ${(lesson.sections || []).map((s) => `${s.heading}: ${s.body}`).join(' ')}`);
  }
  for (const [n, i] of items.slice(0, 25).entries()) {
    parts.push(`Q${n + 1} [${i.skill_name || curriculum.skillName(i.skill_id)}, ${i.format}, difficulty ${i.difficulty}]: ${String(i.prompt).slice(0, 400)}`
      + `${i.choices ? ` | choices: ${i.choices.join(' / ')}` : ''} | answer: ${i.answer}`);
  }
  if (items.some((i) => i.role === 'game')) {
    return {
      kind: 'a game level: multiple-choice questions on the level\'s topic, played inside an arcade-style game (the game says whether each answer was right, not which wrong option was picked)',
      text: parts.join('\n').slice(0, CONTENT_CHARS),
    };
  }
  return {
    kind: `an app-generated ${row.kind || 'practice'} level (a filler made from the question bank, not one of the course's lesson pages)`,
    text: parts.join('\n').slice(0, CONTENT_CHARS),
  };
}

/**
 * Everything else the learner put into this level, as lines for the read:
 *
 *   - chat assist: every message they wrote to the assist on a block, a game
 *     question or a check, and what it was about
 *   - what they did inside the level when it has no questions of its own to
 *     record it (a lesson page's controls, a block's own activity)
 *   - the tutor conversation after a failed checkpoint
 *
 * Their own words are quoted rather than summarised: what someone says while
 * stuck is the most direct evidence there is of where understanding broke.
 */
function levelEvidence(row) {
  const lines = [];
  const at = (r) => r.user_id === row.user_id && r.track_id === row.track_id
    && r.grade_id === row.grade_id && r.level === row.level;
  for (const chat of db.find('assist_chats', at).slice(-12)) {
    const said = (chat.messages || []).filter((m) => m.role === 'user').map((m) => `"${String(m.content).slice(0, 200)}"`);
    if (!said.length) continue;
    lines.push(`- chat assist on ${chat.about}${chat.answered ? ' (after answering)' : ' (before answering)'}: ${said.slice(-6).join(' / ')}`);
  }
  for (const log of db.find('level_logs', at).slice(-6)) {
    for (const b of (log.blocks || []).slice(0, 20)) {
      const did = (b.log || []).slice(0, 12).join('; ');
      const outcome = (b.right || b.wrong) ? ` — the block marked ${b.right || 0} right, ${b.wrong || 0} wrong` : '';
      if (did || outcome) lines.push(`- in ${b.block || 'the page'}: ${did || 'interacted'}${outcome}`);
    }
  }
  for (const r of db.find('remediations', (x) => x.user_id === row.user_id && x.level === row.level).slice(-2)) {
    for (const area of r.areas || []) {
      const said = (area.messages || []).filter((m) => m.role === 'user').map((m) => `"${String(m.content).slice(0, 200)}"`);
      if (said.length) lines.push(`- with the tutor after the failed ${r.kind}, on ${area.skill_name || area.headline}: ${said.slice(-6).join(' / ')}`);
    }
  }
  return lines.slice(0, 60);
}

function performance(items) {
  // eslint-disable-next-line global-require
  const signals = require('./scorecard/signals');
  const answered = items.filter((i) => i.correct !== null && i.correct !== undefined);
  return answered.map((i, n) => {
    const secs = Math.round((i.ms || 0) / 1000);
    const expected = Math.round(signals.expectedMs(i) / 1000);
    const bits = [`Q${n + 1} ${i.correct ? 'RIGHT' : 'WRONG'} in ${secs}s (a reasonable time is about ${expected}s)`];
    if (!i.correct) bits.push(`answered "${String(i.user_answer || '').slice(0, 120)}", correct "${String(i.answer).slice(0, 120)}"`);
    if (i.confidence) bits.push(`said they were "${i.confidence}"`);
    if (i.answer_changes) bits.push(`revised the answer ${i.answer_changes} times`);
    if (i.coach_used) bits.push('asked the AI coach for help');
    if (!i.correct || i.coach_used) bits.push(`question: ${String(i.prompt).slice(0, 300)}`);
    if (i.coach_log && i.coach_log.length) bits.push(`said to the coach: ${i.coach_log.map((t) => `"${t}"`).join(' / ')}`);
    if (i.ask_log && i.ask_log.length) bits.push(`asked after answering: ${i.ask_log.map((t) => `"${t}"`).join(' / ')}`);
    return bits.join('; ');
  }).join('\n');
}

// ── the prompt ─────────────────────────────────────────────────────────────
const RULES = `HOW THE SCORECARD WORKS
- Every learner has 100 stats, each 0 to 100. 50 is neutral. A stat describes HOW this person learns best, not how good they are: 0 means the "low" description is true of them, 100 means the "high" one is.
- Each stat also has a confidence (0 to 100%): how much MEASURED evidence (what the learner did) stands behind it. How their levels are written changes only on measured evidence. Your suggestions are recorded and move the score their profile shows, but never the confidence and never the lesson, so judge each stat from this level alone; you are not shown where the learner stands.
- You suggest changes; you do not make them. Suggest a change of -25 to +25 on any stat this level is real evidence for. The app applies at most 1 point per level. A large change is applied only after large suggestions in the same direction have come from 11 different levels — so suggest the size you genuinely believe, and do not exaggerate.
- If what this level shows disagrees with something the app is confident about, say so honestly. It will not change anything solid; it goes into a list of recommendations that is reviewed when more evidence arrives.
- Most levels are evidence for only a handful of stats. Never pad. Suggest nothing for a stat this level says nothing about.`;

/**
 * What every stat means, for a prompt. The after-level read gets the
 * definitions only: showing it where the learner stands invites it to confirm
 * what the card already says (the research report's anchoring loop), and
 * without any learner's numbers the guide is the same text for every learner
 * and every level, so it sits in the cacheable prefix of the prompt right after
 * the fixed system prompt. A recommendation review, which has to weigh a claim
 * against the card, still gets where the learner is (withValues).
 */
function statGuide(card, trackId, { withValues = false } = {}) {
  return scorecard.STATS.map((s) => {
    const line = `${s.id} — ${s.name}: 0 = ${s.low}; 100 = ${s.high}.`;
    if (!withValues) return line;
    const r = scorecard.read(card, s.id, { trackId });
    return `${line} Now ${r.score} (${r.confidence}% sure).`;
  }).join('\n');
}

function recordForPrompt(record) {
  const facts = record.facts.filter((f) => f.status !== 'superseded').slice(-60);
  const recs = record.recommendations.filter((r) => r.status === 'open').slice(-20);
  const lines = [];
  lines.push(facts.length ? facts.map((f) => `${f.id} [${f.status}, ${f.kind}${f.topic ? `, ${f.topic}` : ''}, supported ${f.support}x]: ${f.text}`).join('\n') : '(nothing recorded yet)');
  lines.push('');
  lines.push('OPEN RECOMMENDATIONS (things one read said that did not fit; say whether this level supports or opposes each)');
  lines.push(recs.length ? recs.map((r) => `${r.id}: ${r.claim} (support ${r.support}, oppose ${r.oppose})`).join('\n') : '(none)');
  return lines.join('\n');
}

const DEBRIEF_SCHEMA = {
  type: 'object',
  properties: {
    conclusion: { type: 'string' },
    emotions: { type: 'array', items: { type: 'string' } },
    stat_changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { stat: { type: 'string' }, delta: { type: 'number' }, reason: { type: 'string' } },
        required: ['stat', 'delta', 'reason'],
        additionalProperties: false,
      },
    },
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: FACT_KINDS },
          topic: { type: 'string' },
          text: { type: 'string' },
          question_shape: { type: 'string' },
          hint_idea: { type: 'string' },
          relation: { type: 'string', enum: ['new', 'supports', 'contradicts'] },
          fact_id: { type: 'string' },
          reasoning: { type: 'string' },
        },
        required: ['kind', 'topic', 'text', 'question_shape', 'hint_idea', 'relation', 'fact_id', 'reasoning'],
        additionalProperties: false,
      },
    },
    recommendation_votes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, stance: { type: 'string', enum: ['supports', 'opposes'] }, why: { type: 'string' } },
        required: ['id', 'stance', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['conclusion', 'emotions', 'stat_changes', 'facts', 'recommendation_votes'],
  additionalProperties: false,
};

/** The single prompt for one level. Exported so the test can read it. */
function buildDebriefPrompt({ row, record, card, content, items, feedback }) {
  const mode = feedback.length ? 'feedback' : 'performance';
  // Stat suggestions are asked for only when the learner said something.
  // How they performed is already measured by the scorecard's own rules
  // (scorecard/signals.js), and a read's suggestions never change a lesson, so
  // on a performance-only read the 100-stat guide (~2,700 tokens) bought only a
  // second, unmeasured opinion of the same answers. The read still writes the
  // conclusion, the facts and the struggles it is there for.
  const withStats = mode === 'feedback';
  const what = feedback.length
    ? feedback.map((f) => [
      f.liked ? `What they liked: ${f.liked}` : '',
      f.disliked ? `What they did not like: ${f.disliked}` : '',
      f.comments ? `Anything else they said: ${f.comments}` : '',
      [f.pace && `pace felt ${f.pace === 'right' ? 'right' : `too ${f.pace}`}`,
        f.length && `length felt ${f.length === 'right' ? 'right' : `too ${f.length}`}`,
        f.difficulty && `difficulty felt ${f.difficulty === 'right' ? 'right' : `too ${f.difficulty}`}`].filter(Boolean).join(', '),
    ].filter(Boolean).join('\n')).join('\n\n')
    : '';

  const system = `You read what happened on one level of an online course and update what is known about how one learner learns.

You are given: how the learning scorecard works and every stat in it, what is already on this learner's record, the full content of the level, and either what the learner said about the level or how they performed on it.

Your job:
1. conclusion — two or three sentences a teacher could act on: the most important points, opinions and feelings from this level, specific to this learner. Never praise, never generic.
2. emotions — the feelings this level showed or produced (for example "frustrated by the long intro", "proud after the hard question"), only if there is evidence.
${withStats
    ? '3. stat_changes — the stats this level is real evidence for, each with a suggested change from -25 to +25 and a one-sentence reason that names what in the level shows it. Use only stat ids from the list.'
    : '3. stat_changes — leave this empty: without anything the learner said, how they performed is already measured by the app\'s own rules.'}
4. facts — specific, durable things learned about this learner. For anything they struggled with, use kind "struggle", name the topic and the question_shape (the structure of question that tripped them, such as "multiple choice with two near-identical options" or "rewrite a sentence in a different tone"), and give a hint_idea: a hint that would help them understand and remember it next time. For each fact, say whether it is new, supports an existing fact (give its id), or contradicts one (give its id and your reasoning). Leave question_shape, hint_idea, fact_id and reasoning empty when they do not apply.
5. recommendation_votes — for each open recommendation this level is evidence about, whether it supports or opposes it, and why.

${withStats ? RULES : ''}`;

  const user = [
    ...(withStats ? ['THE 100 STATS (id — name: what 0 and 100 mean)', statGuide(card, row.track_id), ''] : []),
    'THIS LEARNER\'S RECORD',
    recordForPrompt(record),
    '',
    `THE LEVEL: ${row.track_id} / ${row.grade_id}, level ${row.level} — ${content.kind}.`,
    content.text || '(no content available)',
    '',
    mode === 'feedback'
      ? `WHAT THE LEARNER SAID ABOUT THIS LEVEL\n${what}`
      : 'The learner did not leave feedback on this level. Read how they performed instead.',
    '',
    items.length ? `HOW THEY DID ON ITS QUESTIONS\n${performance(items)}` : '(this level had no questions)',
  ].join('\n');

  return { system, user, mode };
}

// ── applying a read ────────────────────────────────────────────────────────
/** The direction most recent suggestions for a stat have pushed in, if there is a clear one. */
function establishedDirection(history) {
  const recent = (history || []).slice(-8);
  if (recent.length < 5) return 0;
  const up = recent.filter((h) => h.d > 0).length;
  const down = recent.filter((h) => h.d < 0).length;
  if (up / recent.length >= 0.8) return 1;
  if (down / recent.length >= 0.8) return -1;
  return 0;
}

function openRecommendation(record, match, build) {
  const existing = record.recommendations.find((r) => r.status === 'open' && match(r));
  if (existing) {
    existing.support += 1;
    existing.last_at = now();
    existing.reasons = [...(existing.reasons || []), build.reasoning].filter(Boolean).slice(-6);
    return existing;
  }
  const rec = {
    id: nextId(record, 'R'),
    status: 'open',
    support: 1,
    oppose: 0,
    created_at: now(),
    last_at: now(),
    reasons: [build.reasoning].filter(Boolean),
    ...build,
  };
  record.recommendations.push(rec);
  return rec;
}

function applyStatChange(record, card, userId, change, ctx, report) {
  const stat = String(change.stat || '').trim();
  if (!scorecard.BY_ID[stat]) return;
  const d = Math.round(clamp(Number(change.delta) || 0, -MAX_SUGGEST, MAX_SUGGEST));
  if (!d) return;
  const dir = Math.sign(d);
  const reason = String(change.reason || '').slice(0, 240);
  const history = record.suggestions[stat] || [];
  const { score, confidence } = scorecard.read(card, stat, { trackId: ctx.trackId });

  // A suggestion that pushes against what the app is sure of changes nothing.
  const againstSolid = confidence >= STAT_SOLID_CONFIDENCE && Math.abs(d) >= 10
    && ((score >= 65 && dir < 0) || (score <= 35 && dir > 0));
  const established = establishedDirection(history);
  const againstTrend = established !== 0 && dir !== established;

  record.suggestions[stat] = [...history, { d, level: ctx.level, at: now() }].slice(-40);

  if (againstSolid || againstTrend) {
    const rec = openRecommendation(record, (r) => r.type === 'stat' && r.stat === stat && r.direction === dir, {
      type: 'stat',
      stat,
      direction: dir,
      delta: d,
      claim: `${scorecard.BY_ID[stat].name} should move ${dir > 0 ? 'up' : 'down'} (now ${score}, ${confidence}% sure): ${reason}`,
      reasoning: reason,
    });
    report.held.push({ stat, suggested: d, recommendation: rec.id, why: againstSolid ? 'disagrees with a confident score' : 'disagrees with the direction recent levels pushed in' });
    return;
  }

  scorecard.shift(userId, stat, dir * STEP, { source: 'after-level read', note: reason, trackId: ctx.trackId });
  report.applied.push({ stat, suggested: d, applied: dir * STEP });

  // Big suggestions in one direction, counted once per level.
  if (Math.abs(d) >= BIG) {
    const big = record.big[stat] && record.big[stat].dir === dir ? record.big[stat] : { dir, count: 0, sum: 0, levels: [] };
    const levelKey = `${ctx.trackId}/${ctx.gradeId}/${ctx.level}`;
    if (!big.levels.includes(levelKey)) {
      big.count += 1;
      big.sum += d;
      big.levels = [...big.levels, levelKey].slice(-BIG_AFTER * 2);
    }
    if (big.count >= BIG_AFTER) {
      const move = Math.round(clamp(big.sum / big.count, -MAX_SUGGEST, MAX_SUGGEST)) - dir * STEP;
      scorecard.shift(userId, stat, move, {
        source: 'after-level read, confirmed by many levels',
        note: `${big.count} levels asked for a big move`,
        trackId: ctx.trackId,
      });
      report.applied.push({ stat, suggested: Math.round(big.sum / big.count), applied: move + dir * STEP, big: true });
      record.big[stat] = { dir, count: 0, sum: 0, levels: [] };
    } else {
      record.big[stat] = big;
    }
  } else if (record.big[stat] && record.big[stat].dir !== dir) {
    // A suggestion the other way is not a big one, so it does not reset the count.
  }
}

function applyFact(record, raw, ctx, report) {
  const kind = FACT_KINDS.includes(raw.kind) ? raw.kind : 'note';
  const text = String(raw.text || '').trim().slice(0, 300);
  if (text.length < 6) return;
  const topic = String(raw.topic || '').trim().slice(0, 80);
  const live = record.facts.filter((f) => f.status !== 'superseded');

  let target = raw.fact_id ? live.find((f) => f.id === String(raw.fact_id).trim()) : null;
  // A "new" fact that says what an existing one says is support for it.
  if (!target && raw.relation !== 'contradicts') {
    target = live.find((f) => f.kind === kind
      && (topic && f.topic && f.topic.toLowerCase() === topic.toLowerCase() ? similar(f.text, text) >= 0.35 : similar(f.text, text) >= 0.6));
  }

  const levelKey = `${ctx.trackId}/${ctx.gradeId}/${ctx.level}`;
  if (raw.relation === 'contradicts' && target) {
    if (isSolid(target)) {
      const rec = openRecommendation(record, (r) => r.type === 'fact' && r.fact_id === target.id && similar(r.replacement || '', text) >= 0.4, {
        type: 'fact',
        fact_id: target.id,
        replacement: text,
        claim: `Instead of "${target.text}": ${text}`,
        reasoning: String(raw.reasoning || '').slice(0, 240),
      });
      report.held.push({ fact: target.id, recommendation: rec.id, why: 'disagrees with a solid fact' });
    } else {
      target.contradict += 1;
      target.last_at = now();
      refreshStatus(target);
      report.facts.push({ id: target.id, change: 'contradicted' });
    }
    return;
  }

  if (target) {
    target.support += 1;
    target.last_at = now();
    if (!target.levels.includes(levelKey)) target.levels = [...target.levels, levelKey].slice(-20);
    if (raw.hint_idea && !target.hint) target.hint = String(raw.hint_idea).slice(0, 240);
    if (raw.question_shape && !target.shape) target.shape = String(raw.question_shape).slice(0, 160);
    const was = target.status;
    refreshStatus(target);
    report.facts.push({ id: target.id, change: was !== target.status ? `now ${target.status}` : 'supported' });
    return;
  }

  const fact = refreshStatus({
    id: nextId(record, 'F'),
    kind,
    topic,
    text,
    shape: String(raw.question_shape || '').slice(0, 160) || null,
    hint: String(raw.hint_idea || '').slice(0, 240) || null,
    support: 1,
    contradict: 0,
    first_at: now(),
    last_at: now(),
    levels: [levelKey],
  });
  record.facts.push(fact);
  report.facts.push({ id: fact.id, change: 'new' });
}

/**
 * Apply one read's result to the record and the scorecard, by the rules at the
 * top of this file. Exported for the test.
 */
function applyDebrief(userId, result, ctx) {
  const record = get(userId);
  const card = scorecard.get(userId);
  const report = { applied: [], held: [], facts: [], votes: [] };

  for (const change of (result.stat_changes || []).slice(0, 25)) applyStatChange(record, card, userId, change, ctx, report);
  for (const fact of (result.facts || []).slice(0, 15)) applyFact(record, fact, ctx, report);
  for (const vote of result.recommendation_votes || []) {
    const rec = record.recommendations.find((r) => r.id === String(vote.id || '').trim() && r.status === 'open');
    if (!rec) continue;
    if (vote.stance === 'supports') rec.support += 1;
    else rec.oppose += 1;
    rec.last_at = now();
    if (vote.why) rec.reasons = [...(rec.reasons || []), `${vote.stance}: ${vote.why}`].slice(-6);
    report.votes.push({ id: rec.id, stance: vote.stance });
  }

  const conclusion = String(result.conclusion || '').trim().slice(0, 600);
  if (conclusion) {
    record.conclusions = [...record.conclusions, {
      level: ctx.level, track_id: ctx.trackId, grade_id: ctx.gradeId, mode: ctx.mode, text: conclusion,
      emotions: (result.emotions || []).map(String).slice(0, 5), at: now(),
    }].slice(-60);
  }
  save(record);

  // What the learner said, concluded, goes where the profile page reads it.
  if (conclusion && ctx.mode === 'feedback') {
    // eslint-disable-next-line global-require
    const learner = require('./learner');
    const existing = learner.getProfile(userId).feedback_conclusions || [];
    learner.saveProfile(userId, { feedback_conclusions: [conclusion, ...existing].slice(0, 5) });
  }
  return report;
}

// ── reviewing a recommendation ─────────────────────────────────────────────
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    decision: { type: 'string', enum: ['apply', 'reject', 'wait'] },
    reasoning: { type: 'string' },
    delta: { type: 'number' },
    replacement: { type: 'string' },
  },
  required: ['decision', 'reasoning', 'delta', 'replacement'],
  additionalProperties: false,
};

/**
 * Weigh one recommendation against everything known about the learner. Only
 * this can change something solid.
 */
async function review(userId, recId) {
  // eslint-disable-next-line global-require
  const ai = require('./ai');
  const record = get(userId);
  const rec = record.recommendations.find((r) => r.id === recId && r.status === 'open');
  if (!rec) return null;
  const card = scorecard.get(userId);
  const target = rec.type === 'fact' ? record.facts.find((f) => f.id === rec.fact_id) : null;

  const result = await ai.structured({
    role: 'personalize',
    task: 'personalize_read',
    system: `You review one recommended change to what is known about a learner, against everything known about them.

The recommendation came from reads of individual levels that disagreed with something the app already treats as solid. It has gathered support since. Decide:
- apply: the evidence for it is now strong and consistent with the rest of what is known, so the record should change.
- reject: it is outweighed by the rest of what is known, or it was a one-off.
- wait: it is plausible but not yet established.
For a stat, give delta: how far the stat should move, -25 to +25 (0 unless you decide apply). For a fact, give replacement: the corrected fact (empty unless you decide apply). Reasoning: two or three sentences that weigh both sides.

${RULES}`,
    user: [
      `THE RECOMMENDATION (${rec.id}): ${rec.claim}`,
      `Support from ${rec.support} level reads, opposed by ${rec.oppose}. What they said:`,
      ...(rec.reasons || []).map((r) => `- ${r}`),
      target ? `\nTHE FACT IT WOULD REPLACE (${target.id}, supported ${target.support}x): ${target.text}` : '',
      '',
      'THE WHOLE RECORD',
      recordForPrompt(record),
      '',
      'RECENT CONCLUSIONS',
      ...record.conclusions.slice(-10).map((c) => `- level ${c.level} (${c.mode}): ${c.text}`),
      '',
      'THE SCORECARD',
      statGuide(card, null, { withValues: true }),
    ].join('\n'),
    schema: REVIEW_SCHEMA,
    schemaName: 'submit_review',
    maxTokens: 3000,
    effort: 'medium',
    userId,
  });
  if (!result || !['apply', 'reject', 'wait'].includes(result.decision)) return null;

  const fresh = get(userId);
  const live = fresh.recommendations.find((r) => r.id === recId);
  live.reviews = [...(live.reviews || []), { at: now(), decision: result.decision, reasoning: String(result.reasoning || '').slice(0, 600) }];
  live.reviewed_support = live.support;

  if (result.decision === 'apply') {
    if (live.type === 'stat') {
      const delta = Math.round(clamp(Number(result.delta) || live.direction * STEP, -MAX_SUGGEST, MAX_SUGGEST));
      scorecard.shift(userId, live.stat, delta, { source: 'recommendation reviewed and applied', note: String(result.reasoning || '').slice(0, 200) });
      // The new direction is now the established one.
      fresh.suggestions[live.stat] = (fresh.suggestions[live.stat] || []).filter((h) => Math.sign(h.d) === Math.sign(delta));
      live.applied_delta = delta;
    } else {
      const old = fresh.facts.find((f) => f.id === live.fact_id);
      if (old) old.status = 'superseded';
      fresh.facts.push({
        id: nextId(fresh, 'F'),
        kind: old ? old.kind : 'note',
        topic: old ? old.topic : '',
        text: String(result.replacement || live.replacement || '').slice(0, 300),
        shape: old ? old.shape : null,
        hint: old ? old.hint : null,
        support: live.support,
        contradict: live.oppose,
        status: 'solid',
        first_at: now(),
        last_at: now(),
        levels: [],
        replaces: old ? old.id : null,
      });
    }
    live.status = 'applied';
  } else if (result.decision === 'reject') {
    live.status = 'rejected';
  }
  save(fresh);
  return { decision: result.decision, recommendation: live };
}

/** Recommendations with enough new support since their last review. */
function dueForReview(record) {
  return record.recommendations.filter((r) => r.status === 'open'
    && r.support >= REVIEW_AT && r.support > r.oppose
    && r.support >= (r.reviewed_support || 0) + (r.reviewed_support ? 2 : 0));
}

// ── the queue ──────────────────────────────────────────────────────────────
/**
 * Queue the read of one level. It waits GRACE_MS for feedback, so a learner who
 * says something about the level gets the feedback version of the read.
 */
function scheduleDebrief({ userId, trackId, gradeId, level, kind, source, sessionId = null, itemIds = [] }) {
  if (!userId || !trackId || !gradeId || !level) return null;
  // One level, one read. A level reported twice before its read has run (left
  // early, then finished; or a game's two endings) joins the read already
  // waiting, so the same work is never counted twice.
  const waiting = db.find('level_debriefs', (d) => d.user_id === userId && d.track_id === trackId
    && d.grade_id === gradeId && d.level === level && d.status === 'pending').pop();
  if (waiting) {
    return db.update('level_debriefs', waiting.id, {
      kind: kind || waiting.kind,
      source: source || waiting.source,
      session_id: sessionId || waiting.session_id,
      item_ids: [...new Set([...(waiting.item_ids || []), ...itemIds])],
      due_at: new Date(Date.now() + GRACE_MS).toISOString(),
    });
  }
  return db.insert('level_debriefs', {
    user_id: userId,
    track_id: trackId,
    grade_id: gradeId,
    level,
    kind: kind || 'practice',
    source: source || 'level',
    session_id: sessionId,
    item_ids: itemIds,
    feedback_ids: [],
    status: 'pending',
    due_at: new Date(Date.now() + GRACE_MS).toISOString(),
  });
}

/**
 * The learner said something about a level. The read waiting for it runs now,
 * as the feedback version; if it has already run, a feedback read is queued.
 */
function attachFeedback(userId, { trackId, gradeId, level, feedbackId }) {
  const waiting = db.find('level_debriefs', (d) => d.user_id === userId && d.track_id === trackId
    && d.grade_id === gradeId && d.level === level && d.status === 'pending').pop();
  if (waiting) {
    return db.update('level_debriefs', waiting.id, {
      feedback_ids: [...(waiting.feedback_ids || []), feedbackId], due_at: now(),
    });
  }
  const earlier = db.find('level_debriefs', (d) => d.user_id === userId && d.track_id === trackId
    && d.grade_id === gradeId && d.level === level).pop();
  return db.insert('level_debriefs', {
    user_id: userId,
    track_id: trackId,
    grade_id: gradeId,
    level,
    kind: earlier ? earlier.kind : 'level',
    source: 'feedback',
    session_id: earlier ? earlier.session_id : null,
    item_ids: earlier ? earlier.item_ids : [],
    feedback_ids: [feedbackId],
    status: 'pending',
    due_at: now(),
  });
}

/** Run one queued read now. Returns what changed, or null. */
async function runDebrief(rowId) {
  // eslint-disable-next-line global-require
  const ai = require('./ai');
  // eslint-disable-next-line global-require
  const personalize = require('./personalize');
  const row = db.byId('level_debriefs', rowId);
  if (!row || row.status !== 'pending') return null;
  db.update('level_debriefs', row.id, { status: 'running', started_at: now() });

  const items = (row.item_ids || []).map((id) => db.byId('items', id)).filter(Boolean);
  const feedback = (row.feedback_ids || []).map((id) => db.byId('level_feedback', id)).filter(Boolean);
  const extra = levelEvidence(row);
  if (!feedback.length && !extra.length && !items.some((i) => i.correct !== null && i.correct !== undefined)) {
    db.update('level_debriefs', row.id, { status: 'skipped', reason: 'no feedback and no answered questions' });
    return null;
  }
  if (!personalize.isEnabled()) {
    db.update('level_debriefs', row.id, { status: 'skipped', reason: 'no AI provider configured' });
    return null;
  }

  const record = get(row.user_id);
  const card = scorecard.get(row.user_id);
  const content = levelContent(row, items);
  if (extra.length) {
    content.text = `${content.text}\n\nWHAT ELSE THEY DID ON THIS LEVEL\n${extra.join('\n')}`.slice(0, CONTENT_CHARS + 3000);
  }
  const prompt = buildDebriefPrompt({ row, record, card, content, items, feedback });

  const result = await ai.structured({
    role: 'personalize',
    task: 'personalize_read',
    system: prompt.system,
    user: prompt.user,
    schema: DEBRIEF_SCHEMA,
    schemaName: 'submit_level_read',
    maxTokens: 6000,
    effort: 'medium',
    userId: row.user_id,
  });
  if (!result) {
    db.update('level_debriefs', row.id, { status: 'failed', reason: 'the model returned nothing usable' });
    return null;
  }

  const ctx = { trackId: row.track_id, gradeId: row.grade_id, level: row.level, mode: prompt.mode };
  const report = applyDebrief(row.user_id, result, ctx);

  // Recommendations that have gathered enough support are reviewed now, against
  // everything known about the learner.
  const reviews = [];
  for (const rec of dueForReview(get(row.user_id)).slice(0, 2)) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await review(row.user_id, rec.id);
    if (outcome) reviews.push({ id: rec.id, decision: outcome.decision });
  }

  db.update('level_debriefs', row.id, {
    status: 'done',
    mode: prompt.mode,
    finished_at: now(),
    conclusion: String(result.conclusion || '').slice(0, 600),
    report,
    reviews,
  });
  return { report, reviews, mode: prompt.mode };
}

let running = false;

/** Run every read that is due, one at a time. */
async function processDue(limit = 5) {
  if (running) return 0;
  running = true;
  let done = 0;
  try {
    const due = db.find('level_debriefs', (d) => d.status === 'pending' && Date.parse(d.due_at) <= Date.now())
      .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))
      .slice(0, limit);
    for (const row of due) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await runDebrief(row.id);
      } catch (err) {
        console.warn(`learner-record: reading level ${row.level} for user ${row.user_id} failed: ${err.message}`);
        db.update('level_debriefs', row.id, { status: 'failed', reason: err.message.slice(0, 200) });
      }
      done += 1;
    }
  } finally {
    running = false;
  }
  return done;
}

/** Started by the server: check the queue every 20 seconds. */
function start() {
  // A read left 'running' by a restart is put back in the queue.
  for (const row of db.find('level_debriefs', (d) => d.status === 'running')) {
    db.update('level_debriefs', row.id, { status: 'pending' });
  }
  const timer = setInterval(() => { processDue().catch(() => {}); }, 20000);
  if (timer.unref) timer.unref();
  return timer;
}

// ── what the next level's writer is told ───────────────────────────────────
/**
 * The record as lines for the details brief: solid facts, struggles with the
 * hints to give, and what was concluded about recent levels. Tentative facts and
 * recommendations are not here — only what the app is sure of reaches a page.
 */
function briefLines(userId, where = {}, { recent: withRecent = true } = {}) {
  const record = db.findOne('learner_records', (r) => r.user_id === userId);
  if (!record) return [];
  const lines = [];
  const solid = record.facts.filter((f) => f.status === 'solid' && f.kind !== 'struggle');
  if (solid.length) {
    lines.push('WHAT WE KNOW FOR SURE ABOUT THEM (confirmed across several levels)');
    for (const f of solid.slice(-12)) lines.push(`- ${f.kind}${f.topic ? ` (${f.topic})` : ''}: ${f.text}`);
    lines.push('');
  }
  const struggles = record.facts.filter((f) => f.kind === 'struggle' && f.status !== 'superseded' && f.support >= 2)
    .sort((a, b) => b.support - a.support).slice(0, 8);
  if (struggles.length) {
    lines.push('WHERE THEY STRUGGLE — wherever this level touches one of these, add a short hint at that exact point,');
    lines.push('written to help them understand it and remember it next time (not to give the answer away)');
    for (const f of struggles) {
      lines.push(`- ${f.topic || 'general'}: ${f.text}${f.shape ? ` [question shape: ${f.shape}]` : ''}`
        + `${f.hint ? ` — hint idea: ${f.hint}` : ''} (seen on ${f.support} levels)`);
    }
    lines.push('');
  }
  if (!withRecent) return lines;
  return [...lines, ...recentConclusionLines(userId, where, record)];
}

/**
 * The part of the record the tutor may use, as plain rows: facts the app is sure of (not struggles) and
 * struggles seen on two or more levels, each with its topic, support and last time seen. No stat values,
 * no conclusions, no recommendations: those stay with the level writer.
 */
function tutorFacts(userId) {
  const record = db.findOne('learner_records', (r) => r.user_id === userId);
  if (!record) return [];
  return record.facts
    .filter((f) => f.status !== 'superseded' && (f.kind === 'struggle' ? f.support >= 2 : f.status === 'solid'))
    .map((f) => ({
      kind: f.kind, topic: f.topic || '', text: f.text, hint: f.hint || '', shape: f.shape || '',
      support: f.support || 1, last_at: f.last_at || f.first_at || null,
    }));
}

/** What the after-level reads concluded about the last few levels: the part of the record that changes every level. */
function recentConclusionLines(userId, where = {}, known = null) {
  const record = known || db.findOne('learner_records', (r) => r.user_id === userId);
  if (!record) return [];
  const lines = [];
  const recent = record.conclusions.filter((c) => (!where.trackId || c.track_id === where.trackId)).slice(-4);
  if (recent.length) {
    lines.push('WHAT WE CONCLUDED AFTER THEIR RECENT LEVELS (oldest first)');
    for (const c of recent) lines.push(`- level ${c.level}${c.mode === 'feedback' ? ', from what they said' : ''}: ${c.text}`);
    lines.push('');
  }
  return lines;
}

module.exports = {
  tutorFacts,
  recentConclusionLines,
  get,
  scheduleDebrief,
  attachFeedback,
  runDebrief,
  processDue,
  start,
  review,
  applyDebrief,
  buildDebriefPrompt,
  briefLines,
  dueForReview,
  levelContent,
  levelEvidence,
  pageText,
  DEBRIEF_SCHEMA,
  BIG_AFTER,
  REVIEW_AT,
  SOLID_SUPPORT,
  GRACE_MS,
};
