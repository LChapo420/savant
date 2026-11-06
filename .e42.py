def edit(p, pairs):
    s=open(p,encoding='utf8',newline='').read(); crlf='\r\n' in s; s=s.replace('\r\n','\n')
    for a,b in pairs:
        assert a in s, a[:60]
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8',newline='').write(s.replace('\n','\r\n') if crlf else s)
edit('routes/tutor.js',[("res.json({ mode, input_mode:","res.json({ mode, full: full.on(req.user), input_mode:")])
edit('public/js/tutor-dock.js',[
("    if (status.mode === 'off') return;","    if (status.mode === 'off') return;\n    // Everything added for the always-there tutor (chips, the stuck nudge, restarting on a new question, the slow-reply ladder) is for the learners the server says TUTOR_FULL covers; all others see the dock as before.\n    const fullOn = !!status.full;"),
("      <div class=\"tdock-chips\" role=\"group\" aria-label=\"Quick questions\">","      <div class=\"tdock-chips\" role=\"group\" aria-label=\"Quick questions\"${fullOn ? '' : ' hidden'}>"),
("      if (info0.question && askedQuestion && info0.question !== askedQuestion) {","      if (fullOn && info0.question && askedQuestion && info0.question !== askedQuestion) {"),
("      if (nudged || panel.dataset.open === 'true'","      if (!fullOn || nudged || panel.dataset.open === 'true'"),
])
