/**
 * The learner's scorecard and context, as the Spanish path uses them.
 *
 * services/learning-spec.js turns a learner's scorecard (every measure, with its confidence) and context
 * (interests, dislikes, difficulties, strengths, goal) into one spec of numbers and leans. The other subjects hand that
 * spec to a model as a prompt; the Spanish path is built by code from the unit's written phrases, so here the spec
 * is turned into code-level knobs instead, and the per-subject wording stays in this file:
 *
 *   activity mix    game / quiz / lesson / dialogue steps of a level's recipe: engagement.novelty, gamification and
 *                   dialogue move the share of game-like steps (match pairs, tap what you hear) and dialogue steps
 *                   (complete the chat, read and respond); typedAnswers moves typed against picked answers.
 *   length          session.items (the scorecard's brevity, velocity and persistence reach it through the spec) sets the number of
 *                   steps in a level, bounded 5..16, and never cuts the introductions of the new phrases.
 *   practice count  practice.tryItems adds (or removes) retrieval steps on the new phrases; scaffolding sets how many new
 *                   phrases arrive at once (more support: fewer at a time, each met first, then asked).
 *   review share    review.reviewShare sets how many of a level's practice steps use earlier phrases.
 *   interests       exampleDomains put the unit's phrases that touch them first (and pick the small-talk topics of
 *                   the role-play partner); avoidDomains push phrases that touch them last and are never named in a topic.
 *   pacing          the speaking sprint's seconds per prompt: brisk (pace, challenge, pressure) shortens it, a low-stakes
 *                   learner gets longer and no clock-style wording.
 *
 * A learner with no scorecard (or the owner base account) gets the default spec, which changes nothing: knobs()
 * is the identity then, so the goal-fit recipes stay exactly as written in goal-fit.js.
 */
const learningSpec = require('../learning-spec');

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Keywords (English and Spanish) that put a unit phrase "in" an interest. Interests are matched through the aliases. */
const DOMAINS = {
  sports: ['sport', 'soccer', 'football', 'basketball', 'team', 'ball', 'run', 'swim', 'gym', 'win', 'deporte', 'fútbol', 'futbol', 'baloncesto', 'equipo', 'pelota', 'correr', 'nadar', 'gimnasio', 'ganar'],
  music: ['music', 'song', 'sing', 'guitar', 'piano', 'band', 'concert', 'dance', 'música', 'musica', 'canción', 'cancion', 'cantar', 'guitarra', 'banda', 'concierto', 'bailar'],
  games: ['game', 'video', 'console', 'play', 'player', 'juego', 'videojuego', 'jugar', 'jugador'],
  food: ['eat', 'food', 'cook', 'restaurant', 'pizza', 'bread', 'coffee', 'drink', 'comer', 'comida', 'cocinar', 'restaurante', 'pan', 'café', 'cafe', 'beber'],
  travel: ['travel', 'trip', 'hotel', 'train', 'airport', 'beach', 'ticket', 'viaje', 'viajar', 'tren', 'aeropuerto', 'playa', 'boleto'],
  animals: ['dog', 'cat', 'animal', 'pet', 'bird', 'horse', 'perro', 'gato', 'mascota', 'pájaro', 'caballo'],
  movies: ['movie', 'film', 'series', 'show', 'watch', 'theater', 'actor', 'cine', 'película', 'pelicula', 'serie', 'ver', 'teatro'],
  tech: ['computer', 'phone', 'internet', 'app', 'online', 'screen', 'computadora', 'ordenador', 'teléfono', 'telefono', 'móvil', 'movil', 'pantalla'],
  art: ['draw', 'paint', 'art', 'picture', 'museum', 'dibujar', 'pintar', 'arte', 'cuadro', 'museo'],
  books: ['book', 'read', 'story', 'write', 'poem', 'libro', 'leer', 'historia', 'escribir', 'poema'],
  cars: ['car', 'drive', 'road', 'bus', 'coche', 'carro', 'conducir', 'manejar', 'carretera', 'autobús'],
  nature: ['sun', 'moon', 'tree', 'mountain', 'river', 'weather', 'rain', 'garden', 'sol', 'luna', 'árbol', 'montaña', 'río', 'tiempo', 'lluvia', 'jardín'],
  fashion: ['clothes', 'shirt', 'shoes', 'dress', 'wear', 'ropa', 'camisa', 'zapatos', 'vestido', 'llevar'],
  science: ['science', 'space', 'planet', 'experiment', 'lab', 'ciencia', 'espacio', 'planeta', 'laboratorio'],
  school: ['school', 'class', 'teacher', 'student', 'homework', 'exam', 'escuela', 'clase', 'profesor', 'estudiante', 'tarea', 'examen'],
  money: ['money', 'buy', 'price', 'pay', 'store', 'shop', 'dinero', 'comprar', 'precio', 'pagar', 'tienda'],
};
const ALIASES = {
  sports: ['sport', 'soccer', 'football', 'basketball', 'baseball', 'tennis', 'volleyball', 'swimming', 'running', 'gym', 'fitness', 'hockey', 'sports'],
  music: ['music', 'guitar', 'piano', 'singing', 'drums', 'band', 'rap', 'hip hop', 'concerts', 'dancing', 'dance'],
  games: ['game', 'gaming', 'video game', 'minecraft', 'fortnite', 'roblox', 'esports', 'chess', 'board game'],
  food: ['food', 'cooking', 'baking', 'cook', 'restaurant', 'pizza', 'coffee', 'cuisine'],
  travel: ['travel', 'trip', 'vacation', 'beach', 'adventure', 'tourism'],
  animals: ['animal', 'dog', 'cat', 'pet', 'horse', 'wildlife', 'birds'],
  movies: ['movie', 'film', 'anime', 'tv', 'show', 'netflix', 'youtube', 'series', 'cinema', 'manga'],
  tech: ['tech', 'computer', 'coding', 'programming', 'phone', 'ai', 'robot', 'internet', 'app'],
  art: ['art', 'drawing', 'painting', 'design', 'photography', 'museum'],
  books: ['book', 'reading', 'writing', 'poetry', 'novel', 'story', 'comic'],
  cars: ['car', 'cars', 'driving', 'motorcycle', 'racing', 'truck'],
  nature: ['nature', 'outdoor', 'hiking', 'camping', 'fishing', 'garden', 'weather', 'mountain'],
  fashion: ['fashion', 'clothes', 'shoes', 'style', 'makeup'],
  science: ['science', 'space', 'physics', 'chemistry', 'biology', 'astronomy'],
  school: ['school', 'homework', 'class', 'exam'],
  money: ['money', 'business', 'shopping', 'finance', 'invest', 'sales'],
};

/** The domain ids a list of interest strings ("basketball, anime") belongs to. */
function domainsOf(list) {
  const text = (Array.isArray(list) ? list : [list]).map((x) => String(x || '').toLowerCase()).filter(Boolean);
  const out = new Set();
  for (const t of text) for (const [d, words] of Object.entries(ALIASES)) if (words.some((w) => new RegExp(`(^|[^a-z])${w}`).test(t))) out.add(d);
  return [...out];
}
/** The raw words of an interest list too, so "origami" can still match a phrase that says "origami". */
function wordsOf(list) {
  return (Array.isArray(list) ? list : [list]).flatMap((x) => String(x || '').toLowerCase().split(/[^a-záéíóúñü]+/)).filter((w) => w.length >= 4);
}

const textOfPhrase = (p) => `${String(p.es || '')} ${(p.en || []).join(' ')}`.toLowerCase();
/** How strongly a phrase touches a set of domains (number of keyword hits). */
function touches(p, domains, words = []) {
  const t = textOfPhrase(p);
  let n = 0;
  for (const d of domains) for (const k of DOMAINS[d] || []) if (new RegExp(`(^|[^a-záéíóúñü])${k}`).test(t)) { n++; break; }
  for (const w of words) if (t.includes(w)) n++;
  return n;
}

/**
 * The spec for one learner at one level. Never throws; the default spec when there is nothing to go on.
 * `context` overrides gathered values (tests and the simulations pass interests / dislikes / metrics through it).
 */
function specFor(userId, gradeId, row, context = null) {
  try {
    const opts = { trackId: 'spanish', gradeId, topic: row && row.title ? String(row.title).slice(0, 120) : null, context };
    return learningSpec.buildSpec(userId, opts);
  } catch {
    return learningSpec.defaultSpec();
  }
}

/** The code-level knobs of a spec. Neutral (identity) for a default spec. */
function knobs(spec) {
  const s = spec || learningSpec.defaultSpec();
  if (s.isDefault) return { neutral: true, size: 1, tryItems: 0, reviewScale: 1, game: 0, dialogue: 0, typed: 0, newDelta: 0, interests: [], avoid: [], sprintScale: 1, lowStakes: false, hints: 0 };
  const session = s.session || {}; const prac = s.practice || {}; const eng = s.engagement || {}; const scaf = s.scaffolding || {}; const rev = s.review || {};
  const lev = s.levers || {};
  const items = Number(session.items) || 8;
  const novelty = Number(eng.novelty); const noveltyV = Number.isFinite(novelty) ? novelty : 0.5;
  const hintLevel = Number(scaf.hintLevel); const scaffold = Number.isFinite(Number(scaf.level)) ? Number(scaf.level) : 0.5;
  const intr = s.interests || {};
  return {
    neutral: false,
    // The scorecard's brevity, velocity and persistence reach the length through lesson.minutes (8 at the default) and session.items.
    size: clamp(0.7 * ((Number((s.lesson || {}).minutes) || 8) / 8) + 0.3 * (items / 8), 0.6, 1.5),
    tryItems: clamp(Math.round((Number(prac.tryItems) || 2) - 2), -1, 2),
    reviewScale: clamp((Number(rev.reviewShare) || 0.3) / 0.3, 0.5, 1.6),
    game: clamp((noveltyV - 0.5) * 0.9 + (eng.gamification ? 0.12 : 0) - (eng.gamification === false && noveltyV < 0.4 ? 0.05 : 0), -0.35, 0.4),
    dialogue: clamp((eng.dialogue ? 0.18 : 0) + (eng.choices ? 0.05 : 0) + (Number(lev.dialogic) > 0.2 ? 0.1 : 0) - (Number(lev.dialogic) < -0.2 ? 0.1 : 0), -0.1, 0.3),
    typed: clamp((Number(prac.typedAnswers) || 0.5) - 0.5, -0.5, 0.5),
    // Support: the more scaffold, the fewer new phrases at once; the less, the more.
    newDelta: scaffold >= 0.7 || hintLevel >= 3 ? -1 : scaffold <= 0.3 || hintLevel === 0 ? 1 : 0,
    hints: Number.isFinite(hintLevel) ? hintLevel : 2,
    interests: Array.isArray(intr.exampleDomains) ? intr.exampleDomains : [],
    avoid: Array.isArray(intr.avoidDomains) ? intr.avoidDomains : [],
    // Pace: positive pace / challenge / pressure leans make the sprint's clock tighter, low stakes looser.
    sprintScale: clamp(1 - 0.25 * (Number(lev.pace) || 0) - 0.15 * (Number(lev.pressure) || 0) - 0.1 * (Number(lev.challenge) || 0), 0.7, 1.45),
    lowStakes: Number(lev.pressure) < -0.3,
  };
}

// ── the recipe ─────────────────────────────────────────────────────────────

const kindOf = (step) => step.split(':')[0];
const useOf = (step) => step.split(':')[1];
const GAME = new Set(['match_pairs', 'tap_heard', 'listen_image']);
const DIALOGUE = new Set(['complete_chat', 'read_respond']);
const QUIZ = new Set(['select_meaning', 'select_translation', 'fill_choice', 'translate_es', 'translate_en', 'complete_translation', 'type_heard', 'listen_choose', 'listen_meaning']);
const TYPED = new Set(['translate_en', 'translate_es', 'type_heard', 'complete_translation']);
const PICKED = new Set(['select_meaning', 'select_translation', 'listen_choose', 'listen_meaning']);
/** Extra retrieval for the new phrases, in the order they are added. */
const EXTRA = ['select_meaning:new', 'translate_en:new', 'type_heard:new', 'translate_es:new', 'select_translation:new'];
/** Slots whose steps are about the skill itself (speaking, pronunciation): the reshape leaves their kinds alone. */
const FIXED_KIND_SLOTS = new Set(['pronunciation']);

/**
 * A recipe (goal-fit.js) reshaped for the learner. Pure and deterministic; the same steps for the same knobs.
 * `unitHas` says what the unit holds ({chats, reads}) so no dialogue step is added that cannot be built.
 */
function reshape(steps, k, slot, unitHas = { chats: true, reads: true }) {
  if (!k || k.neutral) return steps.slice();
  let out = steps.slice();
  // Length: bounded, introductions kept.
  const target = clamp(Math.round(steps.length * k.size), 5, 16);
  const intros = out.filter((s) => kindOf(s) === 'intro').length;
  while (out.length > Math.max(target, intros + 3)) {
    const at = [...out.keys()].reverse().find((i) => kindOf(out[i]) !== 'intro');
    if (at === undefined) break;
    out.splice(at, 1);
  }
  let e = 0;
  while (out.length < target && e < 6) { out.push(EXTRA[e % EXTRA.length]); e++; }

  const protectedAt = (i) => kindOf(out[i]) === 'intro';
  const nonIntro = () => out.map((s, i) => i).filter((i) => !protectedAt(i));

  if (!FIXED_KIND_SLOTS.has(slot)) {
    // Game / dialogue / quiz mix.
    const total = nonIntro().length;
    const gameTarget = Math.round(clamp(out.filter((s) => GAME.has(kindOf(s))).length / Math.max(1, total) + k.game, 0, 0.6) * total);
    let games = out.filter((s) => GAME.has(kindOf(s))).length;
    const gameSteps = ['match_pairs:any', 'tap_heard:new', 'match_pairs:old', 'tap_heard:old'];
    let gi = 0;
    while (games < gameTarget) {
      const at = nonIntro().reverse().find((i) => PICKED.has(kindOf(out[i])));
      if (at === undefined) break;
      const step = gameSteps[gi++ % gameSteps.length];
      if (kindOf(step) === 'match_pairs' && out.filter((s) => kindOf(s) === 'match_pairs').length >= 2) { if (gi > 8) break; continue; }
      out[at] = step; games++;
    }
    while (games > gameTarget) {
      const at = nonIntro().find((i) => GAME.has(kindOf(out[i])));
      if (at === undefined) break;
      out[at] = `select_meaning:${useOf(out[at]) === 'old' ? 'old' : 'new'}`; games--;
    }
    // Dialogue steps (the unit's chats and short readings).
    const can = [];
    if (unitHas.chats) can.push('complete_chat:unit');
    if (unitHas.reads && ['reading', 'grammar', 'vocabulary', 'writing'].includes(slot)) can.push('read_respond:unit');
    const dlg = out.filter((s) => DIALOGUE.has(kindOf(s))).length;
    const dlgTarget = Math.max(0, Math.round(dlg + k.dialogue * total));
    let d = dlg; let di = 0;
    while (can.length && d < dlgTarget) {
      const open = nonIntro().reverse();
      // Quiz steps first, then the game steps beyond the first two; speaking and the pairs game stay.
      const at = open.find((i) => PICKED.has(kindOf(out[i])) || kindOf(out[i]) === 'fill_choice') ?? open.find((i) => kindOf(out[i]) === 'tap_heard' || QUIZ.has(kindOf(out[i])));
      if (at === undefined) break;
      out[at] = can[di++ % can.length]; d++;
    }
    while (d > dlgTarget && d > 1) {
      const at = nonIntro().reverse().find((i) => DIALOGUE.has(kindOf(out[i])));
      if (at === undefined) break;
      out[at] = 'select_meaning:new'; d--;
    }
    // Typed against picked answers.
    const typedWanted = Math.round(Math.abs(k.typed) * 4);
    for (let n = 0; n < typedWanted; n++) {
      if (k.typed > 0) {
        const at = nonIntro().reverse().find((i) => kindOf(out[i]) === 'select_meaning' || kindOf(out[i]) === 'select_translation');
        if (at === undefined) break;
        out[at] = `${kindOf(out[at]) === 'select_meaning' ? 'translate_en' : 'translate_es'}:${useOf(out[at])}`;
      } else {
        const at = nonIntro().reverse().find((i) => kindOf(out[i]) === 'type_heard' || kindOf(out[i]) === 'translate_en');
        if (at === undefined) break;
        out[at] = `${kindOf(out[at]) === 'type_heard' ? 'tap_heard' : 'select_meaning'}:${useOf(out[at])}`;
      }
    }
  }

  // Review share: steps that use earlier phrases ("old").
  const practice = nonIntro().filter((i) => useOf(out[i]) === 'new' || useOf(out[i]) === 'old');
  const oldNow = practice.filter((i) => useOf(out[i]) === 'old').length;
  const oldWanted = Math.round(clamp((oldNow / Math.max(1, practice.length)) * k.reviewScale, 0, 0.8) * practice.length);
  for (let n = oldNow; n < oldWanted; n++) { const at = practice.reverse().find((i) => useOf(out[i]) === 'new'); if (at === undefined) break; out[at] = `${kindOf(out[at])}:old`; }
  for (let n = oldNow; n > oldWanted; n--) { const at = practice.find((i) => useOf(out[i]) === 'old'); if (at === undefined) break; out[at] = `${kindOf(out[at])}:new`; }

  // Practice count: extra retrieval on the new phrases (the length above is the base; these come on top, at most 16 in all).
  if (k.tryItems > 0) for (let n = 0; n < k.tryItems; n++) out.splice(Math.max(1, Math.ceil(out.length * 0.6)) + n, 0, EXTRA[n % EXTRA.length]);
  if (k.tryItems < 0) for (let n = 0; n < -k.tryItems; n++) { const at = nonIntro().reverse().find((i) => useOf(out[i]) === 'new' && QUIZ.has(kindOf(out[i]))); if (at !== undefined) out.splice(at, 1); }

  while (out.length > 16) { const at = [...out.keys()].reverse().find((i) => kindOf(out[i]) !== 'intro'); out.splice(at, 1); }
  return out;
}

/** The first n phrases of `list`, after the learner's interests put matching ones first and avoided ones last (stable otherwise). */
function orderByInterest(phrases, k) {
  if (!k || k.neutral || (!k.interests.length && !k.avoid.length)) return phrases;
  const likeDomains = domainsOf(k.interests); const likeWords = wordsOf(k.interests);
  const avoidDomains = domainsOf(k.avoid); const avoidWords = wordsOf(k.avoid);
  const score = (p) => touches(p, likeDomains, likeWords) - 3 * touches(p, avoidDomains, avoidWords);
  return phrases.map((p, i) => ({ p, i, s: score(p) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
}

/** Small-talk topics for the role-play partner: the learner's interests that are not disliked. Empty when none. */
function topicsFor(k) {
  if (!k || k.neutral) return { like: [], avoid: [] };
  const avoid = new Set(domainsOf(k.avoid));
  const like = k.interests.filter((x) => !domainsOf(x).some((d) => avoid.has(d)) && !k.avoid.some((a) => String(a).toLowerCase() === String(x).toLowerCase()));
  return { like: like.slice(0, 3), avoid: k.avoid.slice(0, 4) };
}

/**
 * The lines the model-run Spanish activities (role-play partner, writing coach) add for this learner: tone and feedback size from
 * the spec's feedback block, hint size from scaffolding, and the learner's interests as small-talk topics (never the dislikes).
 * Empty for a default spec, so a learner with no scorecard gets the activities exactly as before. 'surface' is 'partner' or 'coach'.
 */
function linesFor(spec, surface) {
  if (!spec || spec.isDefault) return [];
  const out = [];
  const fb = spec.feedback || {}; const tone = fb.tone || {}; const scaf = spec.scaffolding || {};
  const k = knobs(spec);
  const t = topicsFor(k);
  if (surface === 'partner') {
    if (t.like.length) out.push(`If it fits the scene, let the small talk turn to what the learner likes: ${t.like.join(', ')}.`);
    if (t.avoid.length) out.push(`Never bring up: ${t.avoid.join(', ')}.`);
    if (scaf.hintSize === 'small') out.push('Keep the "hint" a short nudge (a few words), not the whole sentence.');
    else if (scaf.hintSize === 'full' || scaf.hintLevel >= 3) out.push('Make the "hint" generous: give the sentence start the learner needs.');
    if (tone.correction === 'gentle') out.push('When the learner slips, recast the correct form inside your reply and never point out the error.');
    else if (tone.correction === 'direct') out.push('When the learner slips on a practised form, name the fix plainly in one short clause before you carry on.');
  } else {
    if (fb.granularity === 'brief') out.push('Give exactly 2 priorities, one line each.');
    else if (fb.granularity === 'detailed') out.push('Explain the reason behind each priority in a full sentence and show a second example.');
    if (tone.correction === 'gentle') out.push('Say what is already right before each fix and never call a sentence plainly wrong.');
    else if (tone.correction === 'direct') out.push('State each fix directly, without softening.');
    if (tone.warmth >= 0.65) out.push('Be warm and encouraging.'); else if (tone.warmth <= 0.35) out.push('Be matter-of-fact; no cheerleading.');
    if (t.like.length) out.push(`Where you give a corrected example sentence, build it around: ${t.like.join(', ')}.`);
    if (t.avoid.length) out.push(`Never use these as example topics: ${t.avoid.join(', ')}.`);
  }
  return out;
}

/** The sprint's seconds per prompt for this learner. */
function sprintSeconds(base, k) {
  if (!k || k.neutral) return base;
  return Math.max(3, Math.round(base * k.sprintScale));
}

module.exports = { specFor, knobs, reshape, orderByInterest, topicsFor, sprintSeconds, linesFor, domainsOf, touches, DOMAINS };
