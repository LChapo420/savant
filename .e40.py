p='services/tutor-context.js'
s=open(p,encoding='utf8',newline='').read(); crlf='\r\n' in s; s=s.replace('\r\n','\n')
# 1 wrap the old check so it only runs with the switch off
a="  if ((asked || risky) && question && (!fullOn || mode === 'method' || (page && page.question))) {"
assert a in s
s=s.replace(a,"  if (!fullOn && (asked || risky) && question) {",1)
# 2 remove the fail-closed else and phrase guards
i=s.index("    // On a graded page a checker that could not run is not a pass")
j=s.index("    else if (fullOn && mode === 'method'")
j2=s.index("\n",j)+1
s=s[:i]+s[j2:]
i=s.index("  // A one-line reply with no question in it")
j=s.index("  // The server knows the answer to the question on screen")
s=s[:i]+s[j:]
i=s.index("  // Without any model: a reply that repeats")
j=s.index("  // Round 2: a fast fact check")
s=s[:i]+"""  // Round 3: with the switch on, EVERY reply to a question on screen is read by a model for confirm / reject / reveal (including narrowing to one
  // choice), and a check that cannot run holds the reply (fail closed). This replaces the phrase guards of round 2.
  let checkMs = null;
  if (fullOn && text && !held && (mode === 'method' || (page && page.question))) {
    const t0 = Date.now();
    const v = await full.leakCheck({ ai, user, question: page && page.question ? page.question : question, message: last ? last.content : '', text });
    checkMs = Date.now() - t0;
    if (v === 'LEAK' || v === '') { text = HOLD_REPLY[mode] || HOLD_REPLY.full; held = true; }
  }
"""+s[j:]
s=s.replace("(!fullOn || mode === 'method' || (page && page.question))","true")
s=s.replace("return { reply: out, source: text ? 'ai' : 'fallback', feature,","return { reply: out, source: text ? 'ai' : 'fallback', feature, check_ms: checkMs,",1)
open(p,'w',encoding='utf8',newline='').write(s.replace('\n','\r\n') if crlf else s)
