/**
 * The subject-agnostic catch-up engine.
 *
 * Target grade -> the skills below it -> a skill-by-skill check that stops early per
 * skill -> only the missed skills become blocks, in prerequisite order -> spaced
 * review -> a final mixed re-check. This module is the state machine only: it holds
 * no storage, no content and no player. A subject supplies an adapter and keeps its
 * own persistence (services/spanish/catch-up.js is the first).
 *
 * Mechanisms (curriculum-build/evidence-article/01-*.md, 02-*.md; see docs/CATCHUP-PROOF.md):
 *   diagnostic first and skip what is known on adequate evidence: the shared unitBelief;
 *   a skill left undecided after maxPerSkill questions is a gap, never skipped on a guess;
 *   prerequisite order: skills are listed lowest grade first and taught in that order;
 *   retrieval practice and interleaving: the final re-check mixes caught-up and known skills;
 *   a final re-check at a per-skill bar sends only the failed skills back.
 *
 * Adapter:
 *   gradeOrder()            -> grade ids, lowest first
 *   skillByKey(key)         -> { key, grade_id, levels: [] } or null
 *   questionsFor(skill)     -> [{ qid, ... }] in the order they should be asked
 *   maxPerSkill, mastery, recheckPerSkill, recheckKnownSample   (numbers; maxPerSkill may be a function of the skill)
 *   minAnswersToLearn       (optional, default 1; a number or a function of the skill) a skill is sent to learn only after this many answers.
 *                           With 2, one miss never decides it: a learner who knows the skill and slips once
 *                           is asked again (slip-tolerant check, docs/CATCHUP-PROOF.md C3b). It needs
 *                           maxPerSkill + recheckPerSkill questions per skill, so the subject's banks must have them.
 */
const crypto = require('crypto');
const learnerPath = require('./learner-path');

const UNDECIDED = ['pending', 'open'];

function hashOf(s) { return crypto.createHash('sha256').update(String(s)).digest().readUInt32LE(0); }

function createEngine(adapter) {
  const A = adapter;

  function decideSkill(sk) {
    const b = learnerPath.unitBelief(sk.answers.map((a) => ({ correct: a.correct, choices: a.choices })), { prior: 'past' });
    sk.p = Math.round(b.p * 10000) / 10000;
    const per = (v) => (typeof v === 'function' ? v(A.skillByKey(sk.key), sk) : v);
    const minToLearn = Math.max(1, Number(per(A.minAnswersToLearn)) || 1);
    const maxAnswers = Number(per(A.maxPerSkill));
    if (b.decision === 'known') sk.status = 'known';
    else if (b.decision === 'learn' && sk.answers.length >= minToLearn) sk.status = 'learn';
    else if (sk.answers.length >= maxAnswers) { sk.status = 'learn'; sk.unchecked = true; } // never skipped on a guess
    else sk.status = 'open';
  }

  function askedSet(state) {
    const out = new Set(state.check.asked.map((a) => `${a.key}#${a.qid}`));
    for (const r of [state.recheck, ...(state.rechecks || [])]) for (const it of (r && r.items) || []) out.add(`${it.key}#${it.qid}`);
    return out;
  }

  function freshQuestion(state, key) {
    const skill = A.skillByKey(key);
    if (!skill) return null;
    const asked = askedSet(state);
    return A.questionsFor(skill).find((q) => !asked.has(`${key}#${q.qid}`)) || null;
  }

  /** The next check question: one per skill a round, lowest grade first. Null when every skill is decided. */
  function nextCheck(state) {
    const order = A.gradeOrder();
    const live = state.skills.map((sk, i) => ({ sk, i })).filter(({ sk }) => UNDECIDED.includes(sk.status));
    live.sort((a, b) => a.sk.answers.length - b.sk.answers.length || order.indexOf(a.sk.grade_id) - order.indexOf(b.sk.grade_id) || a.i - b.i);
    for (const { sk } of live) {
      const q = freshQuestion(state, sk.key);
      if (q) return { key: sk.key, qid: q.qid };
      sk.status = 'learn'; // nothing left to ask it: a gap, never a skip
      sk.unchecked = true;
      sk.no_questions = !sk.answers.length;
    }
    return null;
  }

  function blockFor(key, extra = {}) {
    const skill = A.skillByKey(key);
    return { key, levels: skill ? skill.levels.slice() : [], done: [], status: 'todo', started_at: null, done_at: null, reopened: 0, review_seeded: 0, ...extra };
  }

  function finishCheck(state, now) {
    state.check.current = null;
    state.check.finished_at = new Date(now).toISOString();
    state.blocks = state.skills.filter((sk) => sk.status === 'learn').map((sk) => blockFor(sk.key));
    state.phase = state.blocks.length ? 'route' : 'recheck';
    if (state.phase === 'recheck') startRecheck(state, now);
  }

  /** Known skills to sample for the re-check: spread over the grades, the least certain first. */
  function knownSample(state) {
    const pool = state.skills.filter((sk) => sk.status === 'known' || sk.status === 'worked');
    const byGrade = new Map();
    for (const sk of pool) {
      if (!byGrade.has(sk.grade_id)) byGrade.set(sk.grade_id, []);
      byGrade.get(sk.grade_id).push(sk);
    }
    for (const list of byGrade.values()) list.sort((a, b) => (a.p ?? 1) - (b.p ?? 1) || hashOf(`${state.id}|${a.key}`) - hashOf(`${state.id}|${b.key}`));
    const out = [];
    const lists = [...byGrade.values()];
    for (let i = 0; out.length < A.recheckKnownSample && lists.some((l) => l[i]); i++) {
      for (const l of lists) if (l[i] && out.length < A.recheckKnownSample) out.push(l[i]);
    }
    return out;
  }

  function startRecheck(state, now) {
    const round = (state.rechecks || []).length + 1;
    const items = [];
    const taken = askedSet(state);
    const take = (key, n, role) => {
      const skill = A.skillByKey(key);
      if (!skill) return;
      let got = 0;
      for (const q of A.questionsFor(skill)) {
        if (got >= n) break;
        if (taken.has(`${key}#${q.qid}`)) continue;
        taken.add(`${key}#${q.qid}`);
        items.push({ key, qid: q.qid, role });
        got++;
      }
    };
    // The first re-check: every caught-up skill and a sample of known ones. A later one: only the skills sent back.
    const caught = round === 1 ? state.blocks.map((b) => b.key) : state.blocks.filter((b) => b.reopened && b.status === 'done' && b.recheck_round === round - 1).map((b) => b.key);
    for (const key of new Set(caught)) take(key, A.recheckPerSkill, 'caught_up');
    if (round === 1) for (const sk of knownSample(state)) take(sk.key, 1, 'known');
    items.sort((a, b) => hashOf(`${state.id}|${round}|${a.key}|${a.qid}`) - hashOf(`${state.id}|${round}|${b.key}|${b.qid}`)); // interleaved
    state.phase = 'recheck';
    state.recheck = { round, items, answers: [], started_at: new Date(now).toISOString(), finished_at: null, result: null };
  }

  function scoreRecheck(state, now) {
    const r = state.recheck;
    const bySkill = new Map();
    for (const a of r.answers) {
      if (!bySkill.has(a.key)) bySkill.set(a.key, { right: 0, total: 0, role: a.role });
      const s = bySkill.get(a.key);
      s.total++; if (a.correct) s.right++;
    }
    const right = r.answers.filter((a) => a.correct).length;
    const score = r.answers.length ? right / r.answers.length : 1;
    const failed = [...bySkill.entries()].filter(([, s]) => s.right / s.total < A.mastery).map(([key, s]) => ({ key, ...s }));
    const passed = score >= A.mastery && !failed.length;
    r.result = { score: Math.round(score * 100), right, total: r.answers.length, passed, failed: failed.map((f) => f.key), by_skill: Object.fromEntries(bySkill) };
    r.finished_at = new Date(now).toISOString();
    state.rechecks = [...(state.rechecks || []), r];
    if (passed) {
      state.phase = 'done';
      state.finished_at = new Date(now).toISOString();
      state.recheck = null;
      return;
    }
    // A miss sends the learner back to that skill only.
    for (const f of failed) {
      const b = state.blocks.find((x) => x.key === f.key);
      if (b) Object.assign(b, { status: 'todo', done: [], done_at: null, reopened: (b.reopened || 0) + 1, recheck_round: r.round });
      else {
        state.blocks.push(blockFor(f.key, { reopened: 1, recheck_round: r.round, from: 'recheck' }));
        const sk = state.skills.find((x) => x.key === f.key);
        if (sk) sk.status = 'learn';
      }
    }
    if (!failed.length) { startRecheck(state, now); return; } // cannot happen, stay safe
    state.recheck = null;
    state.phase = 'route';
  }

  function openBlocks(state) { return (state.blocks || []).filter((b) => b.status !== 'done'); }

  /** The block under way and its next level, with "k of N". */
  function position(state) {
    const blocks = state.blocks || [];
    const i = blocks.findIndex((b) => b.status !== 'done');
    if (i < 0) return { k: blocks.length, n: blocks.length, block: null, level: null };
    const b = blocks[i];
    return { k: i + 1, n: blocks.length, block: b, level: b.levels.find((l) => !b.done.includes(l)) ?? null };
  }

  /** A fresh state for the given skills ([{key, grade_id, worked?}]), lowest grade first. */
  function newState(skills, now, extra = {}) {
    const order = A.gradeOrder();
    const sorted = skills.map((s, i) => ({ s, i })).sort((a, b) => order.indexOf(a.s.grade_id) - order.indexOf(b.s.grade_id) || a.i - b.i).map((x) => x.s);
    return {
      phase: 'check',
      skills: sorted.map((s) => ({ key: s.key, grade_id: s.grade_id, status: s.worked ? 'worked' : 'pending', answers: [], p: null })),
      check: { started_at: new Date(now).toISOString(), finished_at: null, asked: [], current: null },
      blocks: [], recheck: null, rechecks: [], finished_at: null,
      ...extra,
    };
  }

  /** Begin the check: sets the first question. */
  function begin(state, now) {
    if (state.phase === 'check' && !state.check.current && !state.check.finished_at) {
      state.check.current = nextCheck(state);
      if (!state.check.current) finishCheck(state, now);
    }
    return state;
  }

  /** Record one answer in the check; `correct` and `choices` are the caller's grading. */
  function recordCheck(state, cur, correct, choices, now) {
    const sk = state.skills.find((s) => s.key === cur.key);
    sk.answers.push({ qid: cur.qid, correct, choices, at: new Date(now).toISOString() });
    decideSkill(sk);
    state.check.asked.push({ key: cur.key, qid: cur.qid, correct, at: new Date(now).toISOString() });
    state.check.current = nextCheck(state);
    if (!state.check.current) finishCheck(state, now);
    return state;
  }

  /** Record one re-check answer; scores the round when it is the last. */
  function recordRecheck(state, item, correct, now) {
    const r = state.recheck;
    r.answers.push({ key: item.key, qid: item.qid, role: item.role, correct, at: new Date(now).toISOString() });
    if (r.answers.length >= r.items.length) scoreRecheck(state, now);
    return state;
  }

  /** A level of a block was passed. Returns { blockDone }. */
  function levelPassed(block, level, now) {
    if (!block.done.includes(Number(level))) block.done.push(Number(level));
    let blockDone = false;
    if (block.levels.every((l) => block.done.includes(l))) {
      block.status = 'done';
      block.done_at = new Date(now).toISOString();
      blockDone = true;
    }
    return { blockDone };
  }
  /** After the last block is done the final re-check opens. */
  function afterBlock(state, now) {
    if (!openBlocks(state).length && state.phase === 'route') startRecheck(state, now);
  }

  return { decideSkill, askedSet, freshQuestion, nextCheck, finishCheck, blockFor, knownSample, startRecheck, scoreRecheck, openBlocks, position, newState, begin, recordCheck, recordRecheck, levelPassed, afterBlock };
}

module.exports = { createEngine, UNDECIDED, hashOf };
