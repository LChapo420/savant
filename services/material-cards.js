/**
 * "Learn from your own material": the flashcard deck, scheduled like the path's skills.
 *
 *   study pack cards + the learner's own misses + cards they write  ->  one deck per material
 *
 *   material_cards   one per material   { user_id, material_id, cards[], forget_m, seq }
 *   card             { id, front, back, quote, passage_id, skill, source: pack|mistake|own, edited,
 *                      right, wrong, due, interval_days, last, key }
 *
 * Tied to the skills: a pack card takes the first course skill (in path order) that cites its passage; a mistake card
 * is made from a question the learner missed in the course (the prompt, the right answer, the explanation and the
 * misunderstanding behind the pick) and sits on that question's skill. No model is called here: the cards already
 * exist or are the learner's own words, so nothing new leaves the server.
 *
 * Scheduling is the path's: services/material-path.js intervalDays (the forgetting curve at 75% recall, with the right
 * and wrong counts of the card) and updateForgetting (this learner's half-life multiplier, moved by how far the curve
 * missed). The multiplier is shared with the course: it is read from material_progress.forget_m whenever the course
 * has one, and every card review writes its move back there, so a card and a skill learn the same half-life. Again = a miss (due in 10 minutes), Hard = a pass with the
 * interval halved, Good = a pass, Easy = a pass with the interval stretched by half.
 */
const db = require('../config/db');
const path = require('./material-path');
const courses = require('./course-builder');
const materials = require('./materials');

const DAY = 24 * 60 * 60 * 1000;
const MAX_CARDS = 400;
const MAX_INTERVAL = 180;
const RATINGS = { again: 0, hard: 0.6, good: 1, easy: 1 };

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const norm = (s) => String(s || '').toLowerCase().replace(/[“”„"‘’']/g, '').replace(/\s+/g, ' ').trim();

function row(userId, materialId) {
  const mid = Number(materialId);
  let r = db.findOne('material_cards', (c) => c.user_id === userId && c.material_id === mid);
  if (!r) {
    const prog = db.findOne('material_progress', (p) => p.user_id === userId && p.material_id === mid);
    r = db.insert('material_cards', { user_id: userId, material_id: mid, cards: [], forget_m: (prog && prog.forget_m) || 0, seq: 0, created_at: new Date().toISOString() });
  } else {
    // The course's multiplier is the shared one: pick up whatever its reviews have learned since.
    const prog = db.findOne('material_progress', (p) => p.user_id === userId && p.material_id === mid);
    if (prog && prog.forget_m != null) r.forget_m = prog.forget_m;
  }
  return r;
}
const save = (r) => db.update('material_cards', r.id, { cards: r.cards, forget_m: r.forget_m, seq: r.seq, dismissed: r.dismissed || [], updated_at: new Date().toISOString() });

function addCard(r, fields) {
  if (r.cards.length >= MAX_CARDS) return null;
  r.seq++;
  const card = {
    id: `k${r.seq}`, front: fields.front, back: fields.back, quote: fields.quote || null, passage_id: fields.passage_id || null,
    skill: fields.skill || null, source: fields.source, edited: false, right: 0, wrong: 0, due: fields.now, interval_days: 0, last: null,
    key: fields.key || null, misconception: fields.misconception || null,
  };
  r.cards.push(card);
  return card;
}

const correctText = (q) => (q.type === 'multiple_choice' ? (q.choices || [])[q.answer_index] : q.answer);

/**
 * Bring the deck up to date with the pack and the learner's misses. Adds only; a card the learner edited or reviewed
 * is never touched, and a card with the same front is not added twice.
 */
function sync(userId, materialId, now = Date.now()) {
  const r = row(userId, materialId);
  const have = new Set(r.cards.map((c) => norm(c.front)));
  const keys = new Set([...r.cards.map((c) => c.key).filter(Boolean), ...(r.dismissed || [])]);
  const iso = new Date(now).toISOString();
  let added = 0;
  const course = courses.get(userId, materialId);
  const skills = (course && course.skills) || [];
  const skillOfPassage = (pid) => { const s = skills.find((x) => (x.passage_ids || []).includes(pid)); return s ? s.id : null; };

  const pack = db.findOne('material_packs', (p) => p.user_id === userId && p.material_id === Number(materialId));
  for (const c of (pack && pack.cards) || []) {
    const key = `pack:${c.passage_id}:${norm(c.front)}`;
    if (keys.has(key) || have.has(norm(c.front))) continue;
    if (addCard(r, { front: c.front, back: c.back, quote: c.quote, passage_id: c.passage_id, skill: skillOfPassage(c.passage_id), source: 'pack', key, now: iso })) { added++; have.add(norm(c.front)); keys.add(key); }
  }

  const prog = db.findOne('material_progress', (p) => p.user_id === userId && p.material_id === Number(materialId));
  if (prog && course) {
    for (const s of skills) {
      const st = (prog.skills || {})[s.id];
      if (!st || !(st.wrong || []).length) continue;
      for (const qid of st.wrong) {
        const q = (s.questions || []).find((x) => x.id === qid);
        const key = `miss:${s.id}:${qid}`;
        if (!q || keys.has(key)) continue;
        const back = clean(correctText(q), 400);
        const front = clean(q.prompt, 300);
        if (!back || !front || have.has(norm(front))) continue;
        const mis = (st.misconceptions || []).find((m) => typeof m === 'object' && m.q === qid);
        const why = clean(q.explanation, 300);
        if (addCard(r, { front, back: why ? `${back}. ${why}` : back, quote: q.quote, passage_id: q.passage_id, skill: s.id, source: 'mistake', key, misconception: mis ? clean(mis.text, 300) : null, now: iso })) { added++; have.add(norm(front)); keys.add(key); }
      }
    }
  }
  if (added) { save(r); db.flush(); }
  return { row: r, added };
}

const isDue = (c, now) => !c.due || Date.parse(c.due) <= now;

function viewCard(c, now, skillTitles) {
  return {
    id: c.id, front: c.front, back: c.back, quote: c.quote || null, source: c.source, edited: !!c.edited,
    skill: c.skill || null, skill_title: (c.skill && skillTitles[c.skill]) || null, misconception: c.misconception || null,
    reviews: c.right + c.wrong, due: !!isDue(c, now), due_at: c.due || null, interval_days: c.interval_days || 0,
  };
}

/** The deck: every card, how many are due, and the next due time. */
function deck(userId, materialId, now = Date.now()) {
  if (!materials.get(userId, materialId, false)) return { error: 'No such material.', code: 'not_found' };
  const { row: r, added } = sync(userId, materialId, now);
  const course = courses.get(userId, materialId);
  const titles = {};
  for (const s of (course && course.skills) || []) titles[s.id] = s.title;
  const cards = r.cards.map((c) => viewCard(c, now, titles));
  const upcoming = r.cards.filter((c) => !isDue(c, now)).map((c) => Date.parse(c.due)).sort((a, b) => a - b)[0];
  return { cards, total: cards.length, due_count: cards.filter((c) => c.due).length, next_due_at: upcoming ? new Date(upcoming).toISOString() : null, added };
}

/** The cards due now, oldest due first, at most `limit`. */
function due(userId, materialId, limit = 20, now = Date.now()) {
  const d = deck(userId, materialId, now);
  if (d.error) return d;
  const cards = d.cards.filter((c) => c.due).sort((a, b) => (Date.parse(a.due_at) || 0) - (Date.parse(b.due_at) || 0)).slice(0, Math.max(1, Math.min(50, limit)));
  return { cards, due_count: d.due_count, total: d.total };
}

/** Record one review. rating: again | hard | good | easy. */
function review(userId, materialId, cardId, rating, now = Date.now()) {
  if (!Object.prototype.hasOwnProperty.call(RATINGS, rating)) return { error: 'Choose again, hard, good or easy.', code: 'bad_rating' };
  if (!materials.get(userId, materialId, false)) return { error: 'No such material.', code: 'not_found' };
  const r = row(userId, materialId);
  const c = r.cards.find((x) => x.id === cardId);
  if (!c) return { error: 'No such card.', code: 'no_card' };
  const score = RATINGS[rating];
  const elapsed = c.last ? Math.max(0.1, (now - Date.parse(c.last)) / DAY) : 1;
  if (c.last) r.forget_m = path.updateForgetting(r.forget_m || 0, elapsed, c.right, c.wrong, score);
  if (rating === 'again') c.wrong++; else c.right++;
  let days;
  if (rating === 'again') {
    c.due = new Date(now + 10 * 60 * 1000).toISOString();
    days = 0;
  } else {
    days = path.intervalDays(c.right, c.wrong, r.forget_m || 0);
    if (rating === 'hard') days = Math.max(1, Math.floor(days / 2));
    if (rating === 'easy') days = Math.min(MAX_INTERVAL, Math.ceil(days * 1.5));
    c.due = new Date(now + days * DAY).toISOString();
  }
  c.interval_days = days;
  c.last = new Date(now).toISOString();
  save(r);
  const prog = db.findOne('material_progress', (p) => p.user_id === userId && p.material_id === Number(materialId));
  if (prog) db.update('material_progress', prog.id, { forget_m: r.forget_m || 0 });
  db.flush();
  return { card: c.id, rating, next_in_days: days, due_at: c.due };
}

function fieldsOf(body) {
  const b = body && typeof body === 'object' ? body : {};
  return { front: clean(b.front, 300), back: clean(b.back, 600) };
}

/** Write a card of the learner's own. */
function add(userId, materialId, body, now = Date.now()) {
  if (!materials.get(userId, materialId, false)) return { error: 'No such material.', code: 'not_found' };
  const f = fieldsOf(body);
  if (!f.front || !f.back) return { error: 'A card needs a front and a back.', code: 'empty' };
  const r = row(userId, materialId);
  const card = addCard(r, { ...f, source: 'own', now: new Date(now).toISOString() });
  if (!card) return { error: 'This deck is full.', code: 'full' };
  save(r); db.flush();
  return { card: card.id };
}

/** Edit the front and/or back of a card. The schedule stays; the card is marked edited so a pack rebuild leaves it. */
function edit(userId, materialId, cardId, body) {
  if (!materials.get(userId, materialId, false)) return { error: 'No such material.', code: 'not_found' };
  const r = row(userId, materialId);
  const c = r.cards.find((x) => x.id === cardId);
  if (!c) return { error: 'No such card.', code: 'no_card' };
  const b = body && typeof body === 'object' ? body : {};
  const front = b.front === undefined ? c.front : clean(b.front, 300);
  const back = b.back === undefined ? c.back : clean(b.back, 600);
  if (!front || !back) return { error: 'A card needs a front and a back.', code: 'empty' };
  Object.assign(c, { front, back, edited: true });
  save(r); db.flush();
  return { card: c.id };
}

function remove(userId, materialId, cardId) {
  const r = row(userId, materialId);
  const n = r.cards.length;
  // A removed pack or mistake card keeps its key so a later sync does not bring it back.
  const gone = r.cards.find((x) => x.id === cardId);
  if (!gone) return { error: 'No such card.', code: 'no_card' };
  r.cards = r.cards.filter((x) => x.id !== cardId);
  if (gone.key) r.dismissed = [...(r.dismissed || []), gone.key].slice(-500);
  save(r); db.flush();
  return { removed: n - r.cards.length };
}

function removeForMaterial(userId, materialId) {
  return db.remove('material_cards', (c) => c.user_id === userId && c.material_id === Number(materialId));
}

module.exports = { RATINGS, sync, deck, due, review, add, edit, remove, removeForMaterial };
