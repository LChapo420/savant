p='scripts/tutor-full-test.js'
s=open(p,encoding='utf8',newline='').read(); crlf='\r\n' in s; s=s.replace('\r\n','\n')
a="  console.log('switch off');"
assert s.count(a)==1
blk="""  process.env.TUTOR_FULL = '1';
  mode = 'null';
  r = await dock.reply({ user: kid, messages: say('i think i have anxiety, do i need pills'), page: { path: '/dashboard' } });
  check('no provider, a child asking about anxiety and pills: a kind fixed reply naming a grown-up, not a page tip', r.source === 'fallback' && /grown-up/.test(r.reply) && !/Today's plan/.test(r.reply), r.reply);
  r = await dock.reply({ user: u, messages: say('what dose of ibuprofen should i take'), page: { path: '/dashboard' } });
  check('no provider, a health question: pointed to a doctor', /doctor/.test(r.reply), r.reply);
  mode = 'ok';
  process.env.TUTOR_FULL = 'adults';
  const grown = db.insert('users', { email: 'adult@example.test', display_name: 'Pat', password_hash: 'x', age_check: { needs_parent: false, under_13: false, age_at_check: 30, consent_age: 13, country: 'US', birth_ym: `${new Date().getUTCFullYear() - 30}-01` } });
  check('TUTOR_FULL=adults: on for a known adult, off for a child, a learner of unknown age and no learner', full.on(grown) === true && full.on(kid) === false && full.on(u) === false && full.on() === false);
  process.env.TUTOR_FULL = '1';
"""
s=s.replace(a,blk+a,1)
open(p,'w',encoding='utf8',newline='').write(s.replace('\n','\r\n') if crlf else s)
