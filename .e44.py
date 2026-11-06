p='public/js/tutor-dock.js'
s=open(p,encoding='utf8',newline='').read(); crlf='\r\n' in s; s=s.replace('\r\n','\n')
s=s.replace("    const fullOn = !!status.full;","    fullOn = !!status.full;",1)
s=s.replace("  const Snap = window.TutorSnapshot;","  const Snap = window.TutorSnapshot;\n  let fullOn = false; // set from the server's dock status (TUTOR_FULL for this learner)",1)
open(p,'w',encoding='utf8',newline='').write(s.replace('\n','\r\n') if crlf else s)
