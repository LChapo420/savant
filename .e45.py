def edit(p, pairs):
    s=open(p,encoding='utf8',newline='').read(); crlf='\r\n' in s; s=s.replace('\r\n','\n')
    for a,b in pairs:
        assert a in s, a[:60]
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8',newline='').write(s.replace('\n','\r\n') if crlf else s)
edit('services/tutor-safety.js',[
("FIXED.medical = ","FIXED.medical_child = \"That's a question for a grown-up you trust, like a parent, and for a doctor or a nurse. I can't tell what's going on in your body or what medicine to take. If it feels bad or scary, tell a grown-up right now. I'm happy to help you learn whenever you're ready.\";\nFIXED.feelings_teen = \"I'm sorry you're feeling that way, and I'm glad you said it. I'm a study app, so I can't tell what is going on or what would help; that is for a doctor, a school counselor or someone you trust, and it is worth telling a parent or another adult. If it ever feels like too much, you can call or text 988 any time. I'm here for your studying whenever you want it.\";\nFIXED.feelings_child = \"Thank you for telling me. Feelings like that matter, and a grown-up you trust, like a parent, a teacher or the school counselor, is the right person to talk to. I'm only a study app, so I can't help with this the way a person can. I'll be here when you want to learn.\";\nFIXED.medical = "),
("  if (MEDICAL.test(t)) return { kind: 'medical', directive: MEDICAL_DIRECTIVE };","  // A health or feelings question gets a model reply under a directive, and, with no model, a kind fixed reply (never a page tip): `fixed`.\n  if (FEELINGS.test(t)) return { kind: 'feelings', directive: MEDICAL_DIRECTIVE, fixed: young ? FIXED.feelings_child : FIXED.feelings_teen };\n  if (MEDICAL.test(t)) return { kind: 'medical', directive: MEDICAL_DIRECTIVE, fixed: young ? FIXED.medical_child : FIXED.medical };"),
("const MEDICAL = /","const FEELINGS = /\b(anxiety|anxious|depress(ed|ion|ing)|panic attacks?|i('| a)?m (so )?(stressed|overwhelmed|lonely)|can'?t sleep|no friends|hopeless|worthless|feel(ing)? (so )?(sad|empty|numb) (all the time|every day))\b/i;\nconst MEDICAL = /"),
])
edit('services/tutor-full.js',[
("  if (tri && tri.kind === 'medical') parts.push(safety.FIXED.medical);","  if (tri && tri.fixed) parts.push(tri.fixed);"),
("  const tri = safety.triage(msg, { age: null });","  let age0 = null;\n  try { age0 = user ? require('./boosters').ageOf(require('../config/db').byId('users', user.id)) : null; } catch { age0 = null; } // eslint-disable-line global-require\n  const tri = safety.triage(msg, { age: age0 });"),
])
