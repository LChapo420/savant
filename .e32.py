def edit(p, pairs):
    s=open(p,encoding='utf8',newline='').read(); crlf='\r\n' in s; s=s.replace('\r\n','\n')
    for a,b in pairs:
        assert a in s, a[:60]
        s=s.replace(a,b,1)
    open(p,'w',encoding='utf8',newline='').write(s.replace('\n','\r\n') if crlf else s)
edit('services/tutor-full.js',[
("    const item = (q && open.reverse().find((i) => norm2(i.prompt) === q)) || (q ? null : open[open.length - 1]);","    const item = q ? open.reverse().find((i) => norm2(i.prompt) === q) : null; // only the question the page says is on screen: a stale unanswered item must not hold an unrelated reply"),
("(the learner's own unanswered question (by the text on screen, else the newest one)","(the learner's own unanswered question (matched by the text on screen)"),
])
edit('scripts/tutor-full-test.js',[
("  console.log('switch off');","""  db.insert('items', { user_id: u.id, skill_id: 'x', role: 'practice', prompt: 'What is 9 x 6?', answer: '54', correct: null });
  check('the answer key holds a reply that contains the answer, never put in a prompt', full.answerKeyHit(u.id, { question: 'What is 9 x 6?' }, 'It is 54, easy.') && !full.answerKeyHit(u.id, { question: 'What is 9 x 6?' }, 'Think of six groups of nine.') && !full.answerKeyHit(u.id, { question: 'Something else' }, '54'));
  mode = 'ok';
  r = await dock.reply({ user: u, messages: say('give me the answer please'), page: { path: '/skill-practice', question: 'What is 9 x 6?' } });
  check('on screen, a model reply naming the answer is held end to end', r.held === true && !calls[calls.length - 1].system.includes('54'), r);
  console.log('switch off');"""),
])
