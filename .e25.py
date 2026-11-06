def edit(p, pairs):
    s=open(p,encoding='utf8',newline='').read(); crlf='\r\n' in s; s=s.replace('\r\n','\n')
    for a,b in pairs:
        assert a in s, a[:60]
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8',newline='').write(s.replace('\n','\r\n') if crlf else s)
edit('config/model-lineup.json',[
('      "dock_help": {\n        "allow": [\n          "coral:deepseek-v4.1-flash"\n        ],','      "dock_leak_check": {\n        "allow": [\n          "coral:deepseek-v4.1-flash"\n        ],\n        "basis": "6 Nov proof: with the free NVIDIA slots unavailable 179 of 182 answer and fact checks got no slot, so nothing was checked; the same last resort as dock_help, one-word replies, a fraction of a cent"\n      },\n      "dock_help": {\n        "allow": [\n          "coral:deepseek-v4.1-flash"\n        ],'),
])
edit('services/tutor-safety.js',[
("const EMERGENCY = /\b(overdos\w*|","const EMERGENCY = /\b(overdos\w*|took (a |the |an )?(whole |entire |lot of |too many )?(bottle|handful|pack|box)?( of)? ?(pills|tablets|medicine|meds)|took too many|swallowed (a )?(bunch|handful|bottle)|"),
])
edit('scripts/tutor-full-gen.js',[
(", 'what is the average score of other students on this']","]"),
("ok: /pi\s*r|πr|pi \* r|π\s*r/i","ok: /pi\s*(\*|x|times)?\s*(the )?r|π\s*r|radius squared|r\s*(\^2|squared|²)/i"),
])
edit('services/tutor-context.js',[
("  if ((asked || risky) && question) {","  // With the switch on, the answer check is for a question that is actually on the screen (page.question), not for any page with a heading.\n  if ((asked || risky) && question && (!fullOn || mode === 'method' || (page && page.question))) {"),
("  // Without any model: a reply that repeats","""  // A one-line reply with no question in it, to someone who asked for the answer, is the answer ("answer only" -> "9 x 6 is 54.").
  if (fullOn && text && !held && asked && (mode === 'method' || (page && page.question)) && text.trim().length <= 70 && !/\?/.test(text)) { text = HOLD_REPLY[mode] || HOLD_REPLY.full; held = true; }
  // Without any model: a reply that repeats"""),
])
