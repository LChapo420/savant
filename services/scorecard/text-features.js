/**
 * Deterministic features of what a learner writes (round 9, docs/SCORECARD-EVERYTHING.md): their own tutor-chat messages and their open
 * typed answers. Computed here, on this machine, with no model call; only the per-batch means (indicators.js txt.*) are kept, never the
 * text. English lexicons: a message in another language mostly scores zero on the word lists, which reads as "no marker", not as a low
 * value of anything (the length, question and punctuation features still work).
 *
 *   features(text, { context, latencyMs })   one message -> { 'txt.len': x, ... } (a feature that does not apply is left out)
 *   summarize(messages)                      [{ text, context?, latencyMs? }] -> { 'txt.len': { mean, n }, ... } for indicators.observations
 *
 * Spelling is read only as a share of COMMON misspellings and dropped apostrophes (no dictionary is shipped), so it is a weak signal and
 * weighted as one.
 */

const words = (t) => (String(t || '').toLowerCase().match(/[a-zÀ-ɏ']+/g) || []);
const count = (re, t) => (String(t || '').match(re) || []).length;

const L = {
  hedge: /\b(maybe|perhaps|probably|possibly|might|i think|i guess|i suppose|not sure|i'?m not sure|kind of|kinda|sort of|sorta|i don'?t know|idk|unsure|seems? like|i feel like)\b/g,
  certain: /\b(definitely|certainly|obviously|clearly|of course|for sure|absolutely|totally|i know|i'?m sure|sure|easy|no doubt)\b/g,
  formal: /\b(therefore|however|furthermore|moreover|thus|regarding|would you|could you please|i would like|in addition|consequently|nevertheless)\b/g,
  informal: /\b(lol|lmao|gonna|wanna|gotta|ya|yeah|yep|nah|nope|ok|okay|u|ur|pls|plz|thx|cuz|bc|dunno|kinda|sorta|omg|btw|tbh|bruh|dude)\b|\b\w+(n't|'re|'ll|'ve|'m|'d)\b/g,
  humour: /\b(haha+|hehe+|lol|lmao|rofl|jk|just kidding|that'?s funny|so funny)\b|[\u{1F602}\u{1F923}\u{1F606}\u{1F605}]/gu,
  polite: /\b(please|thanks|thank you|thx|sorry|appreciate|cheers)\b/g,
  negemo: /\b(ugh+|annoying|annoyed|frustrat\w*|i hate|hate this|stupid|this sucks|sucks|give up|giving up|can'?t do (this|it)|hopeless|pointless|so hard|too hard|i'?m done)\b/g,
  posemo: /\b(cool|fun|interesting|love (it|this)|awesome|amazing|enjoy\w*|nice|great|yay|excited|fascinating|neat)\b/g,
  anxiety: /\b(nervous|worried|worry|anxious|scared|afraid|stress\w*|panic\w*|freak(ing)? out|the test|my exam|exam|failing)\b/g,
  boredom: /\b(boring|bored|so long|too long|meh|whatever|tedious|dull|again\?)\b/g,
  answerseek: /\b(just (tell|give) me|(tell|give) me the answer|what'?s the answer|what is the answer|solve it for me|do it for me|just the answer|the answer is what)\b/g,
  metacog: /\b(i (get|understand|see) (it|now|why|that)|i (don'?t|do not|didn'?t) (get|understand)|confused (about|by|with)|i (thought|assumed)|my mistake|i (forgot|mixed up|confused)|makes sense now|i was wrong|i realized|i noticed)\b/g,
  connect: /\b(this is like|it'?s like when|like when|same as|similar to|reminds me|just like|kind of like|connects? to|related to|like in)\b/g,
  relevance: /\b(real life|in real life|use this for|ever (use|need) this|when will i|in my job|for my (job|work|team|game|class)|in the real world|what is this used for|useful for)\b/g,
  planning: /\b(first i('ll| will)|then i('ll| will)|my plan|i plan|plan to|schedule|my goal|goal is|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week)|step by step|organi[sz]e|to-?do)\b/g,
  creative: /\b(what if|could (we|i) (try|make|change)|imagine|i made|my own|invent\w*|another way|a different way|what would happen)\b/g,
  autonomy: /\b(let me (try|do|figure|think)|don'?t (tell|give) me|i want to (try|do it|figure)|by myself|on my own|my own way|i'?ll figure)\b/g,
  compete: /\b(beat|win|winning|won|rank\w*|leaderboard|faster than|better than|compete|competition|high score|top score)\b/g,
  reward: /\b(points?|streaks?|badges?|rewards?|prizes?|xp|level up|unlock\w*|trophy|trophies)\b/g,
  examplereq: /\b((an?|another|more|one more) examples?|show me|can you show|for example\?|give me an example)\b/g,
  simplerreq: /\b(simpler|simple words|explain (it |that )?again|too (hard|complicated|confusing)|what does .{1,24} mean|what'?s .{1,24} mean|i don'?t know what .{1,24} means|in plain (words|english)|dumb it down|easier way)\b/g,
  bigpicture: /\b(what'?s the point|why (do|are|should) we (learn|doing|need)|big picture|overview|how does this fit|what is this for|why does this matter|why does it matter|what'?s it for)\b/g,
  misspell: /\b(teh|becuase|becasue|definately|recieve|alot|wierd|untill|wich|thier|beleive|seperate|occured|tommorow|wont|dont|cant|didnt|doesnt|isnt|im|ive|youre|thats|whats|theyre)\b/g,
};
const STOP = new Set('the a an and or but of to in on at for with is are was were be been it this that these those i you he she we they me my your our their what how why when where who which do does did can could would should will not no yes so if then than as by from about into over just like'.split(' '));
const INTERROGATIVE = /^(what|why|how|when|where|who|which|whose|can|could|would|should|is|are|am|do|does|did|will|was|were|isn'?t|aren'?t|don'?t|doesn'?t)\b/;
const DEEP = /\b(why|how come|how does|how do|how is|how can|what if|what would happen|what happens if|explain why|what makes)\b/;
const EMOJI = /\p{Extended_Pictographic}|[:;]-?[)(DPp]|<3/gu;

function syllables(w) {
  const s = w.replace(/[^a-z]/g, '');
  if (s.length <= 3) return 1;
  const m = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

/** The features of one message. `context`: the tutor's message it answers (for drift); `latencyMs`: the time since that message. */
function features(text, { context = null, latencyMs = null } = {}) {
  const raw = String(text || '').slice(0, 4000);
  const lower = raw.toLowerCase();
  const ws = words(raw);
  const n = ws.length;
  if (!n && !raw.trim()) return {};
  const per10 = (k) => Math.min(3, (10 * k) / Math.max(n, 5));
  const has = (re) => (count(re, lower) > 0 ? 1 : 0);
  const out = {
    'txt.len': Math.log(1 + n),
    'txt.question': /\?\s*$/.test(raw.trim()) || INTERROGATIVE.test(lower.trim()) ? 1 : 0,
    'txt.hedge': per10(count(L.hedge, lower)),
    'txt.certain': per10(count(L.certain, lower)),
    'txt.formal': Math.max(-3, Math.min(3, per10(count(L.formal, lower)) - per10(count(L.informal, lower))
      + (/^[A-Z]/.test(raw.trim()) && /[.?!]$/.test(raw.trim()) && n >= 4 ? 0.5 : 0))),
    'txt.humour': has(L.humour),
    'txt.emoji': Math.min(3, count(EMOJI, raw)),
    'txt.exclaim': Math.min(3, count(/!/g, raw)),
    'txt.polite': has(L.polite),
    'txt.negemo': has(L.negemo),
    'txt.posemo': has(L.posemo),
    'txt.anxiety': has(L.anxiety),
    'txt.boredom': has(L.boredom),
    'txt.answerseek': has(L.answerseek),
    'txt.metacog': has(L.metacog),
    'txt.connect': has(L.connect),
    'txt.relevance': has(L.relevance),
    'txt.planning': has(L.planning),
    'txt.creative': has(L.creative),
    'txt.autonomy': has(L.autonomy),
    'txt.compete': has(L.compete),
    'txt.reward': has(L.reward),
    'txt.examplereq': has(L.examplereq),
    'txt.simplerreq': has(L.simplerreq),
    'txt.bigpicture': has(L.bigpicture),
  };
  out['txt.deepq'] = out['txt.question'] && DEEP.test(lower) ? 1 : 0;
  if (n >= 5) {
    const alpha = ws.filter((w) => /^[a-z]+$/.test(w));
    if (alpha.length) out['txt.vocab'] = alpha.filter((w) => w.length >= 7).length / alpha.length;
    out['txt.nonstd'] = count(L.misspell, lower) / n;
  }
  if (n >= 8) {
    const sentences = Math.max(1, (raw.match(/[.!?]+(\s|$)/g) || []).length);
    const syl = ws.reduce((a, w) => a + syllables(w), 0);
    out['txt.grade'] = Math.max(0, Math.min(16, 0.39 * (n / sentences) + 11.8 * (syl / n) - 15.59));
  }
  if (context) {
    const content = ws.filter((w) => w.length > 2 && !STOP.has(w));
    const ctx = new Set(words(context).filter((w) => w.length > 2 && !STOP.has(w)));
    if (content.length >= 3 && ctx.size >= 3) out['txt.drift'] = content.filter((w) => !ctx.has(w)).length / content.length;
  }
  const lat = Number(latencyMs);
  if (Number.isFinite(lat) && lat > 500 && lat < 3600000) out['txt.latency'] = Math.log(lat / 1000);
  return out;
}

/** Per-batch means of every feature over a batch of messages: { key: { mean, n } }. */
function summarize(messages) {
  const acc = {};
  for (const m of messages || []) {
    const f = features(typeof m === 'string' ? m : m && m.text, typeof m === 'string' ? {} : { context: m && m.context, latencyMs: m && m.latencyMs });
    for (const [k, v] of Object.entries(f)) {
      if (!Number.isFinite(v)) continue;
      const a = acc[k] || (acc[k] = { s: 0, n: 0 });
      a.s += v;
      a.n += 1;
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([k, a]) => [k, { mean: Number((a.s / a.n).toFixed(4)), n: a.n }]));
}

module.exports = { features, summarize, syllables };
