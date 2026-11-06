p='services/tutor-full.js'
s=open(p,encoding='utf8',newline='').read(); crlf='\r\n' in s; s=s.replace('\r\n','\n')
a="      if (DISCOURAGED.test(msg)) parts.push(\"That sounds really frustrating"
assert a in s
s=s.replace(a,"      if (explaining) parts.push(\"I can't explain that properly without the live tutor, and I don't want to give you a half answer. Try me again in a moment.\");\n"+a,1)
open(p,'w',encoding='utf8',newline='').write(s.replace('\n','\r\n') if crlf else s)
