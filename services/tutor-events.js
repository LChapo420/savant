/**
 * Learner events on the Savant calendar (owner, 8 Nov 2026: "make it so users can tell the tutor what days they have
 * tests or anything and the tutor can put that on their calendar"; docs/TUTOR-EVENTS.md).
 *
 * Three parts, none of which calls a model:
 *   1. storage   `tutor_events` rows { user_id, title, date YYYY-MM-DD, time HH:MM|null, kind, enrollment_id|null,
 *                source 'tutor'|'manual', created_at } through config/db, one per event, owned by the learner
 *                (deleted with the account: routes/consent.js KNOWN_COLLECTIONS; exported: routes/profile.js EXPORT_MORE).
 *   2. parser    detect(text, { today, country }): the dates are understood HERE, deterministically, in the learner's own
 *                time zone (today is their local date). A message may hold several events. A date that has passed, an
 *                ambiguous one (11/12 where the country's convention is unknown, "Thursday" said on a Thursday), "next week"
 *                or an impossible one (30 Feb) gives a suggestion with no date and a question to ask, never a guess.
 *   3. pending   what the tutor offered and the learner has not answered, in memory for 30 minutes: a "yes" / "add it" (typed
 *                or spoken in a call) writes it; nothing is written before that. A second, explicit offer sets the subject's
 *                retention goal to the test date (services/retention-goal.js); never automatic.
 *
 * TUTOR_EVENTS: default on; 0/off/false turns the detection, the routes and the context line off (stored rows are kept).
 * Nothing here leaves the server, so a child account without a parent's outside-AI yes gets it as well.
 */
const db = require('../config/db');

const COLLECTION = 'tutor_events';
const KINDS = ['test', 'quiz', 'exam', 'due', 'other'];
const MAX_PER_USER = 400;
const PENDING_MS = 30 * 60 * 1000;
const MAX_AHEAD_DAYS = 400;
const PAST_GRACE_DAYS = 45; // "Oct 20" said on 8 Nov is a date that has passed; "Jan 15" is next year's

function on() { return !/^(0|off|false|no)$/i.test(String(process.env.TUTOR_EVENTS || '').trim()); }

// ---- dates (pure) -----------------------------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validYmd = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };
const toUtc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const addDays = (iso, n) => new Date(toUtc(iso) + n * 86400000).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((toUtc(a) - toUtc(b)) / 86400000);
const weekdayOf = (iso) => new Date(toUtc(iso)).getUTCDay(); // 0 Sunday

const WEEKDAYS = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tues: 2, tue: 2, wednesday: 3, wed: 3, thursday: 4, thurs: 4, thur: 4, thu: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
const MONTHS = { january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12 };
const NUMWORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14 };
const MDY_COUNTRIES = new Set(['US', 'PH']);
const DMY_COUNTRIES = new Set(['GB', 'IE', 'AU', 'NZ', 'IN', 'ZA', 'FR', 'DE', 'ES', 'IT', 'NL', 'BE', 'PT', 'MX', 'BR', 'AR', 'CL', 'CO', 'SG', 'PL', 'SE', 'NO', 'DK', 'FI', 'AT', 'CH', 'GR', 'TR', 'ID', 'MY', 'TH', 'VN', 'NG', 'KE', 'EG', 'PK', 'BD', 'RU', 'UA', 'RO', 'CZ', 'HU']);

const WD_RE = '(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)';
const MON_RE = '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
const NUM_RE = '(?:\\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen)';

/**
 * Find the date a clause names. Returns null when it names none, else
 * { date: 'YYYY-MM-DD'|null, ask: string|null, candidates?: [iso], span: [start, end] }.
 * `today` is the learner's local YYYY-MM-DD; `country` is the account's ISO code (decides 11/12).
 */
function findDate(text, { today, country } = {}) {
  const t = ` ${String(text).toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ')} `;
  const res = (m, date, ask, extra) => ({ date: date || null, ask: ask || null, ...(extra || {}), span: [m.index, m.index + m[0].length] });
  const fix = (iso, what) => {
    if (iso < today) return { date: null, ask: `${what} has already passed. Which day is it?` };
    if (diffDays(iso, today) > MAX_AHEAD_DAYS) return { date: null, ask: `${what} is more than a year away. Which day is it?` };
    return { date: iso, ask: null };
  };
  let m;
  // ISO
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t))) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!validYmd(y, mo, d)) return res(m, null, 'That date does not exist. Which day is it?');
    const f = fix(isoOf(y, mo, d), 'That date');
    return res(m, f.date, f.ask);
  }
  // "Nov 12", "november 12th 2027", "nov. 12"
  if ((m = new RegExp(`\\b(${MON_RE})\\.? (?:the )?(\\d{1,2})(?:st|nd|rd|th)?(?: (\\d{4}))?\\b(?! ?(?:am|pm|:))`).exec(t)) || (m = null)) {
    if (m) return monthDay(m, MONTHS[m[1]], Number(m[2]), m[3] && Number(m[3]));
  }
  // "12 november", "12th of nov"
  if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${MON_RE})\\b(?: (\\d{4}))?`).exec(t))) {
    return monthDay(m, MONTHS[m[2]], Number(m[1]), m[3] && Number(m[3]));
  }
  // 11/12, 11/12/2026, 12.11.2026
  if ((m = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/.exec(t))) {
    const a = Number(m[1]); const b = Number(m[2]);
    let y = m[3] ? Number(m[3]) : null;
    if (y !== null && y < 100) y += 2000;
    const cc = String(country || '').toUpperCase();
    let order = null; // 'md' | 'dm'
    if (a > 12 && b <= 12) order = 'dm';
    else if (b > 12 && a <= 12) order = 'md';
    else if (a === b) order = 'md';
    else if (MDY_COUNTRIES.has(cc)) order = 'md';
    else if (DMY_COUNTRIES.has(cc)) order = 'dm';
    if (!order) {
      // both readings, if both are real dates and in range, are offered as candidates; the learner picks
      const cand = [[a, b], [b, a]].map(([mo, d]) => (validYmd(y || Number(today.slice(0, 4)), mo, d) ? resolveYear(mo, d, y, today) : null)).filter((c) => c && c.date);
      return res(m, null, `Is ${m[0].trim()} ${cand.length === 2 ? `${niceDate(cand[0].date)} or ${niceDate(cand[1].date)}` : 'month first or day first'}?`, { candidates: cand.map((c) => c.date) });
    }
    return monthDay(m, order === 'md' ? a : b, order === 'md' ? b : a, y);
  }
  // relative words
  if ((m = /\bday after tomorrow\b/.exec(t))) return res(m, addDays(today, 2));
  if ((m = /\b(tomorrow|tmrw|tmr)\b/.exec(t))) return res(m, addDays(today, 1));
  if ((m = /\b(today|tonight|this evening|this afternoon|this morning)\b/.exec(t))) return res(m, today);
  if ((m = new RegExp(`\\bin (${NUM_RE}) (day|days|week|weeks)\\b`).exec(t))) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMWORDS[m[1]];
    const days = /week/.test(m[2]) ? n * 7 : n;
    if (!n) return res(m, null, 'How many days away is it?');
    const f = fix(addDays(today, days), 'That date');
    return res(m, f.date, f.ask);
  }
  if ((m = /\b(?:next|this|the following) (week|weekend|month)\b/.exec(t)) || (m = /\b(next|this) (week)\b/.exec(t))) {
    return res(m, null, `${/month/.test(m[1]) ? 'Which day next month?' : 'Which day of the week?'} I don't want to guess.`);
  }
  // weekdays: "next tuesday", "this friday", "on thursday", "thursday"
  if ((m = new RegExp(`\\b(?:(next|this|coming|upcoming) )?(${WD_RE})\\b`).exec(t))) {
    const want = WEEKDAYS[m[2]];
    const have = weekdayOf(today);
    const mondayThis = addDays(today, -((have + 6) % 7)); // Monday of this week
    const offsetFromMonday = (want + 6) % 7;
    if (m[1] === 'next') {
      // The named day in NEXT calendar week (Monday to Sunday). The card shows the full date, and the learner edits it if they meant the nearer one.
      return res(m, addDays(mondayThis, 7 + offsetFromMonday));
    }
    if (m[1] === 'this') {
      // "this Friday": the next one on or after today (said on a Sunday it means the coming one).
      return res(m, addDays(today, (want - have + 7) % 7));
    }
    // bare weekday (also "coming"/"upcoming"): the next one after today. Said on that same day: today or a week away, so ask.
    if (want === have && m[1] !== 'coming' && m[1] !== 'upcoming') {
      return res(m, null, `Is that today (${niceDate(today)}) or next ${cap(m[2])} (${niceDate(addDays(today, 7))})?`, { candidates: [today, addDays(today, 7)] });
    }
    return res(m, addDays(today, ((want - have + 7) % 7) || 7));
  }
  // "the 15th"
  if ((m = /\b(?:on |by )?the (\d{1,2})(?:st|nd|rd|th)\b/.exec(t))) {
    const day = Number(m[1]);
    const [y, mo] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
    for (let k = 0; k < 13; k++) {
      const yy = y + Math.floor((mo - 1 + k) / 12); const mm = ((mo - 1 + k) % 12) + 1;
      if (validYmd(yy, mm, day) && isoOf(yy, mm, day) >= today) return res(m, isoOf(yy, mm, day));
    }
  }
  return null;

  function monthDay(mm, mo, d, y) {
    if (!mo || mo < 1 || mo > 12 || !d) return res(mm, null, 'Which day is it?');
    if (y && (y < 2000 || y > 2100)) return res(mm, null, 'Which year is that?');
    const r = resolveYear(mo, d, y, today);
    if (!r) return res(mm, null, 'That date does not exist. Which day is it?');
    return res(mm, r.date, r.ask);
  }
  function cap(s) { const full = Object.keys(WEEKDAYS).find((k) => WEEKDAYS[k] === WEEKDAYS[s] && k.length > 4) || s; return full[0].toUpperCase() + full.slice(1); }
}

/** A month and day (year given or not) to a date in [today - grace, today + a year]; null if it is not a real date. */
function resolveYear(mo, d, y, today) {
  const ty = Number(today.slice(0, 4));
  if (y) {
    if (!validYmd(y, mo, d)) return null;
    const iso = isoOf(y, mo, d);
    if (iso < today) return { date: null, ask: `${niceDate(iso)} has already passed. Which day is it?` };
    return { date: iso, ask: null };
  }
  for (const yy of [ty, ty + 1]) {
    if (!validYmd(yy, mo, d)) continue;
    const iso = isoOf(yy, mo, d);
    if (iso >= today) return { date: iso, ask: null };
    if (diffDays(today, iso) <= PAST_GRACE_DAYS) return { date: null, ask: `${niceDate(iso)} has already passed. Which day is it?` };
  }
  return validYmd(ty, mo, d) || validYmd(ty + 1, mo, d) ? { date: null, ask: 'That date does not look right. Which day is it?' } : null;
}

function niceDate(iso) {
  const d = new Date(toUtc(iso));
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`;
}

/** "at 3pm", "3:30 pm", "at 14:00", "noon": HH:MM or null. */
function findTime(text) {
  const t = String(text).toLowerCase();
  let m;
  if ((m = /\b(?:at )?(\d{1,2}):(\d{2}) ?(am|pm)?\b/.exec(t))) {
    let h = Number(m[1]); const min = Number(m[2]);
    if (min > 59) return null;
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    return h <= 23 ? `${pad(h)}:${m[2]}` : null;
  }
  if ((m = /\b(?:at )?(\d{1,2}) ?(am|pm)\b/.exec(t))) {
    let h = Number(m[1]);
    if (h < 1 || h > 12) return null;
    if (m[2] === 'pm' && h < 12) h += 12;
    if (m[2] === 'am' && h === 12) h = 0;
    return `${pad(h)}:00`;
  }
  if (/\bat noon\b|\bnoon\b/.test(t)) return '12:00';
  return null;
}

// ---- the event words ----------------------------------------------------------------------------------------------

const KIND_WORDS = [
  ['exam', /\b(final exams?|exams?|midterms?|finals?|boards?|sat|act exam|regents|test prep)\b/],
  ['quiz', /\b(quizz?es|quiz)\b/],
  ['test', /\b(tests?|assessments?|unit tests?)\b/],
  ['due', /\b(due|deadline|turn(?:ed)? in|hand(?:ed)? in|submit(?:ted)?)\b/],
  ['other', /\b(presentations?|recitals?|interviews?|appointments?|games?|meets?|concerts?|performances?|field trips?|competitions?|tournaments?|auditions?|orals?|lab practical|practical|speech|debate|rehearsals?)\b/],
];
const STOP = new Set(['i', 'we', 'my', 'our', 'the', 'a', 'an', 'have', 'has', 'got', 'gotta', 'there', 'theres', "there's", 'is', 'are', 'was', 'be', 'big', 'huge', 'hard', 'another', 'also', 'and', 'then', 'plus', 'on', 'in', 'for', 'at', 'by', 'to', 'of', 'next', 'this', 'that', 'it', 'its', "it's", 'um', 'so', 'oh', 'yeah', 'ok', 'okay', 'btw', 'hey', 'hi', 'actually', 'also', 'final', 'upcoming', 'new', 'coming', 'today', 'tomorrow', 'tonight', 'when', 'what', 'about', 'with', 'can', 'you', 'please', 'put', 'add', 'calendar', 'remind', 'me', 'tell', 'know', 'just', 'quick', 'pop', 'surprise', 'one', 'will', 'gonna', 'going', 'need', 'to', 'study', 'dont', "don't", 'forget', 'im', "i'm", 'ive', "i've", 'told', 'said', 'heads', 'up']);
const SUBJECT_ALIASES = {
  math: ['math', 'maths', 'algebra', 'geometry', 'calculus', 'trig', 'trigonometry', 'precalc', 'arithmetic', 'fractions'],
  english: ['english', 'ela', 'writing', 'grammar', 'literature', 'essay'],
  reading: ['reading'],
  spanish: ['spanish', 'espanol', 'español'],
  act: ['act'],
  iq: ['iq'],
  chess: ['chess'],
  piano: ['piano'],
  basketball: ['basketball'],
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clean = (s) => String(s).replace(/[^\p{L}\p{N}' -]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Split a message into clauses: sentence ends, semicolons, "and then", and " and " when both halves name an event. */
function clauses(text) {
  const out = [];
  const hasKind = (s) => KIND_WORDS.some(([, re]) => re.test(s.toLowerCase()));
  for (const sent of String(text).split(/[.!?;\n]+/)) {
    const parts = sent.split(/\b(?:and then|and also|plus|then|but also)\b|,(?= *(?:and )?(?:my |a |an |the )?\w+ (?:test|quiz|exam|midterm|final))/i).filter((p) => p && p.trim());
    for (const p of parts) {
      const halves = p.split(/ and /i);
      if (halves.length > 1 && halves.every((h) => hasKind(h))) out.push(...halves);
      else out.push(p);
    }
  }
  return out.map((c) => c.trim()).filter(Boolean);
}

/** The kind and title words of a clause: { kind, title, subject } or null when it names no event. */
function eventOf(clause) {
  const lower = clause.toLowerCase().replace(/[’]/g, "'");
  let kind = null; let hit = null;
  for (const [k, re] of KIND_WORDS) {
    const m = re.exec(lower);
    if (m && (!hit || m.index < hit.index)) { kind = k; hit = m; }
  }
  if (!kind) return null;
  // a question about a past or imagined event is not a new one: "how did my test go", "was the quiz hard"
  if (/\b(how did|how was|how'd|did i|was the|was my|went|passed|failed|got a|got an? [a-f][+-]?\b|score)/.test(lower) && !/\b(have|got|gotta|there's|theres|is on|is due|due)\b/.test(lower.replace(/got an? [a-f]\b/, ''))) return null;
  const words = lower.slice(0, hit.index).split(/\s+/).map((w) => clean(w)).filter(Boolean);
  while (words.length && ['is', 'are', 'was', 'be', 'will', 'gonna', 'going', 'has', 'have', 'got', 'the', 'a', 'my'].includes(words[words.length - 1])) words.pop();
  const kindWord = hit[0].replace(/^final exam$/, 'final exam');
  // subject words just before the kind word, "math test"; or after "in/on/for/about": "test in chemistry"
  const before = [];
  for (let i = words.length - 1; i >= 0 && before.length < 3; i--) {
    if (STOP.has(words[i]) || WEEKDAYS[words[i]] !== undefined || MONTHS[words[i]] !== undefined || /^\d/.test(words[i])) break;
    before.unshift(words[i]);
  }
  let subj = before.join(' ');
  if (!subj) {
    const after = /\b(?:in|on|for|about|of)\s+([a-z' -]{3,30}?)(?= (?:on|next|this|tomorrow|today|at|in|by|is|and)\b|$)/.exec(lower.slice(hit.index + hit[0].length));
    if (after) { const ws = after[1].split(' ').filter((w) => w && !STOP.has(w) && WEEKDAYS[w] === undefined && MONTHS[w] === undefined && !/^\d/.test(w)); subj = ws.slice(0, 3).join(' '); }
  }
  let title;
  if (kind === 'due') title = subj ? `${cap(subj)} due` : 'Due date';
  else if (kind === 'other') title = subj ? `${cap(subj)} ${kindWord}` : cap(kindWord);
  else if (/^(midterm|final|boards?|regents|sat|act exam)/.test(kindWord) && !/exam/.test(kindWord)) title = subj ? `${cap(subj)} ${kindWord}` : cap(kindWord);
  else title = subj ? `${cap(subj)} ${kind === 'exam' ? kindWord.replace(/s$/, '') : kind}` : cap(kind === 'exam' ? kindWord.replace(/s$/, '') : kind);
  return { kind, title: title.slice(0, 80), subject: subj };
}

/**
 * The events a message names. `today`: the learner's local date. Returns [{ title, kind, date|null, time|null, subject, ask|null, candidates? }].
 * A clause with an event word and no date at all yields nothing (no guess, no nagging); one with a date but no event word yields nothing.
 */
function detect(text, { today, country } = {}) {
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  const found = [];
  for (const c of clauses(String(text || '').slice(0, 1500))) {
    const ev = eventOf(c);
    if (!ev) continue;
    const d = findDate(c, { today, country });
    if (!d) continue;
    found.push({ ...ev, date: d.date, time: findTime(c), ask: d.ask, ...(d.candidates ? { candidates: d.candidates } : {}) });
    if (found.length >= 5) break;
  }
  // the same event said twice in one message is one
  return found.filter((e, i) => found.findIndex((o) => o.title === e.title && o.date === e.date && o.time === e.time) === i);
}

/** A bare date answer ("Thursday", "Nov 12") to a question the tutor asked: { date, ask } or null. */
function detectDateOnly(text, opts) {
  if (!opts || !opts.today) return null;
  const d = findDate(String(text || '').slice(0, 200), opts);
  return d ? { date: d.date, ask: d.ask } : null;
}

const YES = /^(?:yes|yeah|yep|yup|ya|sure|ok|okay|alright|please|yes please|please do|do it|add it|add them|add that|go ahead|sounds good|that works|sure thing|yes add it|yeah add it|yes do it|put it on|put it there)(?: (?:please|thanks|thank you|add it|do it))?[.! ]*$/i;
const NO = /^(?:no|nope|nah|not now|no thanks|no thank you|never ?mind|don'?t|skip( it)?|cancel|leave it|not yet|later)[.! ]*$/i;
const isYes = (t) => YES.test(String(t || '').trim());
const isNo = (t) => NO.test(String(t || '').trim());

// ---- storage ------------------------------------------------------------------------------------------------------

const cleanTitle = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Validate a learner's event fields: { value } or { error }. */
function validate(body, { today, partial = false } = {}) {
  const b = body || {};
  const out = {};
  if (!partial || b.title !== undefined) { out.title = cleanTitle(b.title); if (!out.title) return { error: 'Give the event a title.' }; }
  if (!partial || b.date !== undefined) {
    const d = String(b.date || '');
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(d) && validYmd(Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8)));
    if (!ok) return { error: 'Choose a real date.' };
    if (today && diffDays(d, today) > MAX_AHEAD_DAYS * 2) return { error: 'That date is too far ahead.' };
    if (d < '2000-01-01') return { error: 'Choose a real date.' };
    out.date = d;
  }
  if (!partial || b.time !== undefined) {
    if (b.time === null || b.time === '' || b.time === undefined) out.time = null;
    else if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.time))) out.time = String(b.time);
    else return { error: 'Time looks like 14:30.' };
  }
  if (!partial || b.kind !== undefined) {
    const k = String(b.kind || 'other');
    if (!KINDS.includes(k)) return { error: 'Kind must be test, quiz, exam, due or other.' };
    out.kind = k;
  }
  if (b.enrollment_id !== undefined) out.enrollment_id = b.enrollment_id === null || b.enrollment_id === '' ? null : Number(b.enrollment_id);
  return { value: out };
}

const view = (r) => ({ id: r.id, title: r.title, date: r.date, time: r.time || null, kind: r.kind, enrollment_id: r.enrollment_id || null, source: r.source, created_at: r.created_at });
function list(userId, { from, to } = {}) {
  return db.find(COLLECTION, (r) => r && r.user_id === userId && (!from || r.date >= from) && (!to || r.date <= to))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) || a.id - b.id).map(view);
}
function ownEnrollment(userId, id) {
  if (id === null || id === undefined) return null;
  const e = db.byId('enrollments', Number(id));
  return e && e.user_id === userId ? e.id : null;
}
/** Add one event. Returns { event, existing } (an identical title/date/time is not added twice) or { error, status }. */
function add(userId, body, { source = 'manual', today } = {}) {
  const v = validate(body, { today });
  if (v.error) return { error: v.error, status: 400 };
  const row = v.value;
  if (source === 'tutor' && today && row.date < today) return { error: 'That date has already passed.', status: 400 };
  const same = db.find(COLLECTION, (r) => r && r.user_id === userId && r.date === row.date && r.title.toLowerCase() === row.title.toLowerCase() && (r.time || null) === row.time)[0];
  if (same) return { event: view(same), existing: true };
  if (db.find(COLLECTION, (r) => r && r.user_id === userId).length >= MAX_PER_USER) return { error: 'That is a lot of events. Delete some old ones first.', status: 409 };
  const rec = db.insert(COLLECTION, { user_id: userId, ...row, enrollment_id: ownEnrollment(userId, row.enrollment_id), source: source === 'tutor' ? 'tutor' : 'manual', created_at: new Date().toISOString() });
  return { event: view(rec), existing: false };
}
function update(userId, id, body, { today } = {}) {
  const r = db.byId(COLLECTION, Number(id));
  if (!r || r.user_id !== userId) return { error: 'Not found.', status: 404 };
  const v = validate(body, { today, partial: true });
  if (v.error) return { error: v.error, status: 400 };
  const patch = { ...v.value };
  if (patch.enrollment_id !== undefined) patch.enrollment_id = ownEnrollment(userId, patch.enrollment_id);
  return { event: view(db.update(COLLECTION, r.id, patch) || db.byId(COLLECTION, r.id)) };
}
function remove(userId, id) {
  const r = db.byId(COLLECTION, Number(id));
  if (!r || r.user_id !== userId) return false;
  db.remove(COLLECTION, (x) => x && x.id === r.id);
  return true;
}

// ---- enrollment match and the retention-goal offer ---------------------------------------------------------------

/** The learner's enrollment a subject phrase belongs to ({ id, title } or null); never guesses between two. */
function matchEnrollment(userId, subject) {
  const s = ` ${String(subject || '').toLowerCase()} `;
  if (!s.trim()) return null;
  const curriculum = require('../config/curriculum'); // eslint-disable-line global-require
  const hits = [];
  for (const e of db.find('enrollments', (x) => x && x.user_id === userId)) {
    const track = curriculum.getTrack(e.track_id);
    const names = new Set([...(SUBJECT_ALIASES[e.track_id] || []), String(e.track_id).toLowerCase(), ...(track ? String(track.name).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3) : [])]);
    if ([...names].some((n) => new RegExp(`\\b${n}\\b`).test(s))) {
      const grade = curriculum.getGrade(e.track_id, e.grade_id);
      hits.push({ id: e.id, title: `${track ? track.name : e.track_id}${grade ? `: ${grade.name}` : ''}`, track_id: e.track_id });
    }
  }
  const byTrack = [...new Set(hits.map((h) => h.track_id))];
  return byTrack.length === 1 ? hits[0] : null;
}

/** What setting the subject's goal to this date would do, in words, or null when it cannot be set (a date that is not ahead). */
function goalOffer(userId, ev, today) {
  if (!['test', 'exam'].includes(ev.kind) || !ev.date || ev.date <= today) return null;
  const m = ev.enrollment_id ? (() => { const e = db.byId('enrollments', ev.enrollment_id); return e && e.user_id === userId ? matchEnrollment(userId, e.track_id) : null; })() : matchEnrollment(userId, ev.subject);
  if (!m) return null;
  const goals = require('./retention-goal'); // eslint-disable-line global-require
  const n = goals.normalize({ horizon: 'date', test_date: ev.date }, today);
  if (n.error) return null;
  const e = db.byId('enrollments', m.id);
  const cur = e && e.retention_goal && e.retention_goal.horizon === 'date' && e.retention_goal.test_date === ev.date;
  if (cur) return null;
  return { enrollment_id: m.id, subject: m.title, test_date: ev.date, text: `Reviews will aim at ${niceDate(ev.date)}.` };
}

// ---- pending offers -----------------------------------------------------------------------------------------------

const pendingBy = new Map(); // userId -> { stage: 'add'|'goal', items, at }
function setPending(userId, p) { if (p) pendingBy.set(userId, { ...p, at: Date.now() }); else pendingBy.delete(userId); }
function getPending(userId) {
  const p = pendingBy.get(userId);
  if (!p) return null;
  if (Date.now() - p.at > PENDING_MS) { pendingBy.delete(userId); return null; }
  return p;
}
function clearPending(userId) { pendingBy.delete(userId); }

const sayDate = (e) => `${e.title}, ${niceDate(e.date)}${e.time ? ` at ${e.time}` : ''}`;
const todayOf = (user) => require('./retention-goal').todayFor(user.id); // eslint-disable-line global-require
const countryOf = (user) => String((user.age_check && user.age_check.country) || '').toUpperCase() || null;

/** One suggestion for the card (the text of its question is what a card shows and a voice call says). */
function suggestionOf(user, ev, today, id) {
  const enr = ev.subject ? matchEnrollment(user.id, ev.subject) : null;
  const s = { id, title: ev.title, kind: ev.kind, date: ev.date, time: ev.time || null, enrollment_id: enr ? enr.id : null, ask: ev.ask || null, ...(ev.candidates ? { candidates: ev.candidates } : {}), subject: ev.subject || '' };
  s.question = ev.date ? `Add ${sayDate(ev)}?` : (ev.ask || 'Which day is it?');
  const offer = goalOffer(user.id, { ...ev, enrollment_id: s.enrollment_id }, today);
  if (offer) s.goal_offer = offer;
  return s;
}

/**
 * Before the tutor is asked: does this message answer a pending offer (yes / no / a date for an undated one)?
 * Returns { reply, added?, goal_set?, dismissed?, events? } or null (the message goes to the tutor as usual).
 */
function answer(user, text) {
  if (!on()) return null;
  const p = getPending(user.id);
  if (!p) return null;
  const today = todayOf(user);
  if (p.stage === 'add') {
    if (isNo(text)) { clearPending(user.id); return { reply: 'No problem, I left it off your calendar.', dismissed: true }; }
    if (isYes(text)) {
      const undated = p.items.filter((i) => !i.date);
      if (undated.length) return { reply: undated[0].ask || 'Which day is it?', events: { suggestions: p.items, ask: [undated[0].ask || 'Which day is it?'] } };
      const added = []; const offers = [];
      for (const s of p.items) {
        const r = add(user.id, { title: s.title, date: s.date, time: s.time, kind: s.kind, enrollment_id: s.enrollment_id }, { source: 'tutor', today });
        if (r.event) { added.push(r.event); if (s.goal_offer) offers.push(s.goal_offer); }
      }
      if (!added.length) { clearPending(user.id); return { reply: 'I could not add that. You can add it from the calendar page.' }; }
      let reply = `Done, I put ${added.map(sayDate).join(' and ')} on your Savant calendar.`;
      const offer = offers[0] || null;
      if (offer) { setPending(user.id, { stage: 'goal', items: [offer] }); reply += ` Want me to aim ${offer.subject} reviews at that date too? ${offer.text}`; } else clearPending(user.id);
      return { reply, added, ...(offer ? { goal_offer: offer } : {}) };
    }
    // a bare date for an event that was waiting for one: fill it in and ask again
    const wait = p.items.find((i) => !i.date);
    const d = wait ? detectDateOnly(text, { today, country: countryOf(user) }) : null;
    if (wait && d && !detect(text, { today, country: countryOf(user) }).length) {
      wait.date = d.date; wait.ask = d.ask; wait.candidates = undefined;
      const fresh = suggestionOf(user, { ...wait }, today, wait.id);
      Object.assign(wait, fresh);
      setPending(user.id, { stage: 'add', items: p.items });
      return { reply: wait.date ? `Got it. Want me to add it to your calendar? ${wait.question}` : wait.question, events: { suggestions: p.items, ask: wait.date ? [] : [wait.question] } };
    }
    return null;
  }
  if (p.stage === 'goal') {
    if (isNo(text)) { clearPending(user.id); return { reply: 'Okay, your reviews stay as they are.', dismissed: true }; }
    if (isYes(text)) {
      const o = p.items[0];
      const goals = require('./retention-goal'); // eslint-disable-line global-require
      const r = goals.save(user.id, 'enrollment', o.enrollment_id, { horizon: 'date', test_date: o.test_date });
      clearPending(user.id);
      if (r.error) return { reply: 'I could not change the review goal. You can set it on the retention goals page.' };
      return { reply: `Done. Your ${o.subject} reviews now aim at ${niceDate(o.test_date)}.`, goal_set: o };
    }
  }
  return null;
}

/**
 * After the tutor has replied: the suggestions this message holds. Sets the pending offer and returns the `events` block for the
 * reply ({ suggestions, ask }) or null. `voice` appends the spoken question to `reply` text through the route.
 */
function suggest(user, text) {
  if (!on() || !text) return null;
  const today = todayOf(user);
  const found = detect(text, { today, country: countryOf(user) });
  if (!found.length) return null;
  const stamp = Date.now().toString(36);
  const items = found.map((ev, i) => suggestionOf(user, ev, today, `${stamp}${i}`));
  setPending(user.id, { stage: 'add', items });
  return { suggestions: items, ask: items.filter((i) => !i.date).map((i) => i.question) };
}

/** What the tutor says aloud after its own reply when an offer is waiting, "Want me to add it to your calendar?" */
function spoken(block) {
  if (!block || !block.suggestions.length) return '';
  const dated = block.suggestions.filter((s) => s.date);
  const undated = block.suggestions.filter((s) => !s.date);
  if (undated.length && !dated.length) return undated[0].question;
  return `${dated.map((s) => `${sayDate(s)}.`).join(' ')} Want me to add ${dated.length > 1 ? 'them' : 'it'} to your calendar?`;
}

/** The learner tapped Add / Not now on a card: the offer is answered (it is not asked again by a later "yes"). */
function settle(userId, suggestionId) {
  const p = getPending(userId);
  if (!p || p.stage !== 'add') return;
  p.items = p.items.filter((i) => i.id !== suggestionId);
  if (!p.items.length) clearPending(userId);
}

// ---- the tutor's context ------------------------------------------------------------------------------------------

/** Upcoming events, next 30 days, as short lines for the tutor's context (never more than 6). */
function contextLines(userId, today) {
  if (!on()) return [];
  try {
    const t = today || require('./retention-goal').todayFor(userId); // eslint-disable-line global-require
    return list(userId, { from: t, to: addDays(t, 30) }).slice(0, 6).map((e) => {
      const n = diffDays(e.date, t);
      return `${e.title} ${niceDate(e.date)}${e.time ? ` ${e.time}` : ''} (${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`})`;
    });
  } catch { return []; }
}

module.exports = {
  COLLECTION, KINDS, on, findDate, findTime, detect, detectDateOnly, isYes, isNo, niceDate, addDays,
  validate, list, add, update, remove, matchEnrollment, goalOffer, answer, suggest, spoken, settle, contextLines, getPending, clearPending, setPending, todayOf,
};
