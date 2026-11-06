def edit(p, pairs):
    s=open(p,encoding='utf8',newline='').read(); crlf='\r\n' in s; s=s.replace('\r\n','\n')
    for a,b in pairs:
        assert a in s, a[:60]
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8',newline='').write(s.replace('\n','\r\n') if crlf else s)
edit('public/js/tutor-dock.js',[
("const pending = line('bot', 'Thinking…');","const pending = line('bot', fullOn ? 'Thinking…' : '…');"),
("      const t1 = setTimeout(() => { if (!pending.dataset.done)","      const t1 = !fullOn ? 0 : setTimeout(() => { if (!pending.dataset.done)"),
("      const t2 = setTimeout(() => { if (!pending.dataset.done)","      const t2 = !fullOn ? 0 : setTimeout(() => { if (!pending.dataset.done)"),
("      const ctl = typeof AbortController === 'function' ? new AbortController() : null;","      const ctl = fullOn && typeof AbortController === 'function' ? new AbortController() : null;"),
("        messages.pop(); // the failed message is not part of the conversation; retry resends it\n        input.value = text;","        if (fullOn) { messages.pop(); input.value = text; } // the failed message is not part of the conversation; retry resends it"),
("    info.stuck = {","    if (fullOn) info.stuck = {"),
])
