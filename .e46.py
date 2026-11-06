p='scripts/tutor-full-test.js'
s=open(p,encoding='utf8',newline='').read(); crlf='\r\n' in s; s=s.replace('\r\n','\n')
def rep(a,b):
    global s
    assert a in s,a[:50]; s=s.replace(a,b,1)
rep("let leakVerdict = 'NO';","let leakVerdict = 'OK';\nlet factVerdict = 'OK';")
rep("  if (o.task !== 'dock_help') return leakVerdict; // the leak check","  if (o.task !== 'dock_help') return o.system === require('../services/tutor-full').LEAK_SYSTEM ? leakVerdict : factVerdict; // the leak check, or the fact check")
i=s.index("  check('a reply repeating the proposed answer is caught'")
j=s.index("  db.insert('items', { user_id: u.id, skill_id: 'x', role: 'practice', prompt: 'What is 9 x 6?'")
s=s[:i]+"""  mode = 'ok';
  leakVerdict = null; // the checker is down
  r = await dock.reply({ user: u, messages: say('is it 6?'), page: { path: '/review', question: 'Solve 2x + 5 = 17' } });
  check('a question on screen and the checker is down: the reply is held (fail closed)', r.held === true && /method/.test(r.reply), r);
  r = await dock.reply({ user: u, messages: say('what is a numerator'), page: { path: '/session' } });
  check('no question on screen: the checker is not needed', r.held === false, r);
  leakVerdict = 'LEAK';
  r = await dock.reply({ user: u, messages: say('is it 6?'), page: { path: '/session', question: 'Solve 2x + 5 = 17' } });
  check('the checker says LEAK: held, and the time it took is reported', r.held === true && typeof r.check_ms === 'number', r);
  leakVerdict = 'OK';
  factVerdict = 'WRONG';
  r = await dock.reply({ user: u, messages: say('explain what a numerator is please'), page: { path: '/session' } });
  check('a reply the fact check calls wrong is replaced by an honest not-sure', r.held === true && /not sure/.test(r.reply), r);
  factVerdict = 'OK';

"""+s[j:]
s=s.replace("\r\n","\n")
open(p,'w',encoding='utf8',newline='').write(s.replace('\n','\r\n') if crlf else s)
