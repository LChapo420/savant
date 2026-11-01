const fs=require('fs');
function patch(p, pairs){let s=fs.readFileSync(p,'utf8');const crlf=s.includes('\r\n');s=s.replace(/\r\n/g,'\n');for(const [a,b] of pairs){if(!s.includes(a))throw new Error(p+' missing: '+a.slice(0,80));s=s.split(a).join(b);}fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s);}
patch('services/tutor-facts.js',[
// split mixed taste facts
[`  for (const raw of (Array.isArray(proposed) ? proposed : []).slice(0, MAX_PER_TURN)) {
    const f = clean(raw);`,`  for (const raw of (Array.isArray(proposed) ? proposed : []).slice(0, MAX_PER_TURN).flatMap(splitTaste)) {
    const f = clean(raw);`],
[`const NEGATED = /\b(no longer|not into|not interested|isn'?t into|stopped|quit|gave up|don'?t (?:like|enjoy|care)|doesn'?t (?:like|enjoy)|dislikes?|hates?|can'?t stand|bored (?:of|by|with)|finds? .{0,30}boring|anymore|any more|over (?:it|that))\b/i;`,
 `const NEGATED = /\b(no longer|not into|not interested|isn'?t into|stopped|quit|gave up|don'?t (?:like|enjoy|care)|doesn'?t (?:like|enjoy)|dislikes?|hates?|can'?t stand|bored (?:of|by|with)|finds? .{0,30}boring|anymore|any more|over (?:it|that)|over [a-z0-9'-]+ now|done with)\b/i;

/**
 * One taste fact that says two things ("Over Minecraft now, playing Zelda instead") is two facts: the dislike and the
 * interest. Anything else is returned as it came.
 */
function splitTaste(raw) {
  if (!raw || (raw.kind !== 'interest' && raw.kind !== 'dislike') || typeof raw.text !== 'string') return [raw];
  const parts = raw.text.split(/[,;]\s*|\s+but\s+|\s+and now\s+|\s+now into\s+/i).map((p) => p.trim()).filter((p) => p.length >= 4);
  if (parts.length < 2) return [raw];
  const neg = parts.filter((p) => NEGATED.test(p));
  const pos = parts.filter((p) => !NEGATED.test(p) && tasteTokens(p).size);
  if (!neg.length || !pos.length) return [raw];
  // "quit the team" after "no longer into basketball" says nothing new: only clauses naming a thing become facts.
  return [{ ...raw, kind: 'dislike', text: neg.join(', ') }, { ...raw, kind: 'interest', text: pos.join(', '), replaces: undefined }];
}`],
// evidence note in relevant
[`  for (const { f } of scored) {
    const line = factLine(f);`,`  for (const { f } of scored) {
    const line = \`\${factLine(f)}\${f.from_record ? '' : sinceNote(userId, f)}\`;`],
[`/** Current mastery on a skill as one plain line, or '' when they have not tried it. */`,`/**
 * What their answers since say about a "hard" or "mix-up" fact on a skill: solid now (mastery 0.8 or more over 5 or more
 * answers, practised after the fact was noted) is said, so an old difficulty is not taken as current. '' otherwise.
 */
function sinceNote(userId, f) {
  if (!f.skill_id || (f.kind !== 'hard' && f.kind !== 'misconception')) return '';
  const s = db.findOne('skill_states', (r) => r.user_id === userId && r.skill_id === f.skill_id);
  if (!s || !(s.attempts >= 5) || !(s.mastery >= 0.8)) return '';
  if (!(Date.parse(s.last_seen_at) > Date.parse(f.last_confirmed_at || f.first_at))) return '';
  return \`; but their answers since show it solid now (\${Math.round(s.mastery * 100)}% over \${s.attempts})\`;
}

/** Current mastery on a skill as one plain line, or '' when they have not tried it. */`],
[`  dateIn, eventKey, datesDiffer, tasteTokens, sharesTaste, supersede, outOfDate, NEGATED, SUPERSEDED_KEEP_DAYS,`,`  dateIn, eventKey, datesDiffer, tasteTokens, sharesTaste, supersede, outOfDate, NEGATED, SUPERSEDED_KEEP_DAYS, splitTaste, sinceNote,`],
]);
