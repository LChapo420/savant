p='services/tutor-full.js'
s=open(p,encoding='utf8',newline='').read(); crlf='\r\n' in s; s=s.replace('\r\n','\n')
i=s.index("// Any verdict on a proposed answer")
j=s.index("const ASKS =")
new=r'''// Round 3: the lasting fix for "does this reply give the answer away". One model reads EVERY reply to a question on screen and answers LEAK or OK. It is told the
// ways a tutor leaks without stating the answer: confirming or rejecting a proposal ("you're right", "close", "not quite", "right track"), narrowing the
// choices to one, giving a definition or rule that applied to the question leaves only one answer, working the identical question, or naming an option.
const LEAK_SYSTEM = `You are a strict examiner checking a tutor reply BEFORE a learner sees it. The learner is on a question they have not answered yet. The tutor may give hints about METHOD only. Reply with exactly one word: LEAK or OK.
LEAK if ANY of these is true:
- the reply states the answer or the final value, in any form (a word, number, option, translation, a spelled-out or partial answer);
- it confirms or rejects what the learner proposed, in any words ("right", "correct", "close", "almost", "not quite", "wrong", "good guess", "right track", "you've got it", "that's not it");
- it narrows the question to a single remaining choice, for example by explaining what each option is for and then saying which one fits the learner's situation, or by saying only one of the options can be right;
- it works the identical question (or the same numbers) through to its result;
- it repeats the learner's proposed answer as if it were settled.
OK only if the reply leaves the learner a real choice or a real step to do themselves: a method, a question back (such as why they chose it), a similar example with different numbers or words, a reminder of a rule that does not by itself decide the answer. When in doubt, say LEAK.`;

/** @returns {Promise<'LEAK'|'OK'|''>} '' when the check could not run (the caller holds the reply: fail closed) */
async function leakCheck({ ai, user, question, message, text }) {
  if (!text || !clip(question, 300)) return 'OK';
  let verdict = '';
  try {
    verdict = await withDeadline(ai.talk({
      role: 'fast', task: 'dock_leak_check', system: LEAK_SYSTEM,
      messages: [{ role: 'user', content: `Question on screen: ${clip(question, 400)}\n\nThe learner said: ${clip(message, 300)}\n\nTutor reply: ${clip(text, 1000)}\n\nLEAK or OK?` }],
      maxTokens: 6, userId: user && user.id, hedgeAfterMs: 2500, timeoutMs: 6000, temperature: 0,
    }), 7000);
  } catch { verdict = ''; }
  if (/^\W*leak/i.test(verdict || '')) return 'LEAK';
  if (/^\W*ok/i.test(verdict || '')) return 'OK';
  return '';
}

'''
s=s[:i]+new+s[j:]
s=s.replace("module.exports = { answerKeyHit, affirmsProposal, factCheck,","module.exports = { answerKeyHit, leakCheck, LEAK_SYSTEM, factCheck,",1)
s=s.replace(", echoesProposal, materialNotes",", materialNotes",1)
# on(user): TUTOR_FULL=1 everyone; adults = only a learner known to be 18 or older
s=s.replace("const on = () => String(process.env.TUTOR_FULL === undefined ? DEFAULT_ON : process.env.TUTOR_FULL).trim() === '1';","""// TUTOR_FULL=1 everyone; TUTOR_FULL=adults only a learner whose age is known and 18 or over (children and unknown ages stay on the old tutor).
function on(user) {
  const v = String(process.env.TUTOR_FULL === undefined ? DEFAULT_ON : process.env.TUTOR_FULL).trim().toLowerCase();
  if (v === '1') return true;
  if (v !== 'adults' || !user) return false;
  try { const a = require('./boosters').ageOf(user); return a !== null && a !== undefined && a >= 18; } catch { return false; } // eslint-disable-line global-require
}""",1)
s=s.replace("  if (!on() && !safetyOn()) return null;","  if (!on(user) && !safetyOn()) return null;",1)
s=s.replace("  return on() || CRISIS.has(t.kind) ? t : null;","  return on(user) || CRISIS.has(t.kind) ? t : null;",1)
open(p,'w',encoding='utf8',newline='').write(s.replace('\n','\r\n') if crlf else s)
# callers
for p,pairs in {'services/tutor-context.js':[("const fullOn = full.on();","const fullOn = full.on(user);"),("return g.length || !full.on() ? g : full.materialNotes(userId, query, mode); })()],","return g.length || !full.on(db.byId('users', userId)) ? g : full.materialNotes(userId, query, mode); })()],")],
 'routes/tutor.js':[("    if (full.on()) {\n      const last = lastSaid;","    if (full.on(req.user)) {\n      const last = lastSaid;")]}.items():
    t=open(p,encoding='utf8',newline='').read(); c='\r\n' in t; t=t.replace('\r\n','\n')
    for a,b in pairs:
        assert a in t,a[:50]; t=t.replace(a,b,1)
    open(p,'w',encoding='utf8',newline='').write(t.replace('\n','\r\n') if c else t)
