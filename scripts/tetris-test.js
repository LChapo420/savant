/** Real Tetris regression tests: physics, timers, UI and the shared game contract.
 * Run: node scripts/tetris-test.js. No database access or model calls.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

function run() {
  const problems = [];
  let checks = 0;
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'games', 'engines', 'tetris.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', (err) => errors.push(err.message));
  const dom = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ''), {
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console,
  });
  const { window } = dom;
  const timers = new Map();
  let timerId = 0;
  window.setInterval = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay, repeat: true }); return id; };
  window.setTimeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay, repeat: false }); return id; };
  window.clearInterval = window.clearTimeout = (id) => timers.delete(id);
  const tick = (repeat) => {
    for (const [id, timer] of [...timers]) {
      if (timer.repeat !== repeat || !timers.has(id)) continue;
      if (!timer.repeat) timers.delete(id);
      timer.fn();
    }
  };
  const events = [];
  ['start', 'answer', 'win', 'lose', 'draw'].forEach((name) => {
    window.addEventListener('game:' + name, (e) => events.push({ name, ...e.detail }));
  });
  window.addEventListener('error', (e) => errors.push(e.message));
  const cursor = { at: 0, next(total) { const index = this.at % total; const wrapped = this.at > 0 && index === 0; this.at++; return { index, wrapped }; } };
  window.PolymathGame = { cursor, nextLevelUrl: '/session?enrollment=1&level=37' };
  window.eval(script);
  const create = window.PolymathTetris.createModel;
  let model;
  window.PolymathTetris.createModel = () => { model = create(() => 0.5); return model; };
  const root = window.document.getElementById('game-root');
  const q = (name) => root.querySelector('[data-game-' + name + ']');
  const click = (element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const control = (name) => click(root.querySelector('[data-tet-control="' + name + '"]'));
  const key = (name, target = q('board'), repeat = false) => target.dispatchEvent(new window.KeyboardEvent('keydown', { key: name, repeat, bubbles: true, cancelable: true }));
  const freshBoard = () => Array.from({ length: 20 }, () => Array(10).fill(null));
  const payload = {
    engineId: 'tetris', schemaVersion: 1,
    meta: { topic: 'Test topic' }, settings: { questionCount: 999 },
    questions: Array.from({ length: 50 }, (_, i) => ({
      id: 'q' + (i + 1), prompt: 'Test question ' + (i + 1), choices: ['One', 'Two', 'Three', 'Four'],
      answerIndex: i % 4, explanation: 'Explanation ' + (i + 1), difficulty: 7, skill: 'test', topic: 'Test topic',
    })), feedback: { correct: 'Correct.', incorrect: 'Incorrect.', win: 'Round complete.', lose: 'Stack full.', draw: 'Finished.', outOfQuestions: 'Pool wrapped.' },
  };
  function test(name, fn) {
    try { fn(); checks++; } catch (err) { problems.push(name + ': ' + err.message); }
  }
  function lineFixture(lines = 1, column = 4) {
    model.board = freshBoard();
    for (let y = 20 - lines; y < 20; y++) model.board[y] = Array.from({ length: 10 }, (_, x) => x === column ? null : 'J');
    model.active = { type: 'I', shape: [[1], [1], [1], [1]], x: column, y: 0 };
    control('drop');
  }
  function choose(correct = true) {
    const index = (cursor.at - 1) % payload.questions.length;
    const answer = payload.questions[index].answerIndex;
    click(root.querySelector('[data-game-choice="' + (correct ? answer : (answer + 1) % 4) + '"]'));
  }

  test('base engine and question schema preserve the injection contract', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'games', 'schemas', 'tetris.question-schema.json'), 'utf8'));
    assert.equal(schema.engineId, 'tetris'); assert.equal(schema.questionCount, 50);
    assert.equal(schema.choicesPerQuestion, 4);
    assert.equal(html.split('/* __DATA_INJECTION__ */').length - 1, 1);
    assert.equal(typeof window.initGame, 'function'); assert.equal(window.GAME_ID, 'tetris');
    assert.match(schema.mechanic, /one multiple-choice question per cleared row/);
  });

  test('seven-bag produces all seven pieces before repeating', () => {
    const m = create(() => 0.5), types = [];
    for (let i = 0; i < 14; i++) { m.board = freshBoard(); assert.equal(m.spawn(), true); types.push(m.active.type); m.hardDrop(); }
    assert.equal(new Set(types.slice(0, 7)).size, 7);
    assert.equal(new Set(types.slice(7)).size, 7);
  });
  test('movement respects walls, stack and floor', () => {
    const m = create(); m.next = 'O'; m.spawn();
    while (m.move(-1, 0)) { /* reach wall */ }
    assert.equal(m.active.x, 0); assert.equal(m.move(-1, 0), false);
    while (m.move(1, 0)) { /* reach opposite wall */ }
    assert.equal(m.active.x, 8);
    m.board[2][8] = 'T'; assert.equal(m.move(0, 1), false);
    m.board = freshBoard(); while (m.move(0, 1)) { /* reach floor */ }
    assert.equal(m.active.y, 18); assert.equal(m.move(0, 1), false);
  });
  test('ghost matches hard drop without changing the live piece', () => {
    const m = create(); m.next = 'O'; m.spawn();
    assert.equal(m.ghost().y, 18); assert.equal(m.active.y, 0);
    assert.equal(m.hardDrop(), 0); assert.equal(m.active, null);
    assert.equal(m.board[19][4], 'O'); assert.equal(m.board[18][5], 'O');
  });
  test('rotation is reversible and square stays fixed', () => {
    const m = create(); m.next = 'T'; m.spawn(); const original = JSON.stringify(m.active.shape);
    assert.equal(m.rotate(1), true); assert.notEqual(JSON.stringify(m.active.shape), original);
    assert.equal(m.rotate(-1), true); assert.equal(JSON.stringify(m.active.shape), original);
    m.next = 'O'; m.spawn(); assert.equal(m.rotate(1), false);
  });
  test('wall and floor kicks keep pieces in bounds', () => {
    const m = create(); m.next = 'I'; m.spawn(); m.rotate(1);
    while (m.move(-1, 0)) { /* vertical I at left wall */ }
    assert.equal(m.rotate(1), true); assert.ok(m.active.x >= 0);
    m.board = freshBoard(); m.next = 'T'; m.spawn();
    while (m.move(0, 1)) { /* bottom */ }
    assert.equal(m.rotate(1), true);
    assert.ok(m.active.y <= 17);
  });
  test('blocked rotation does not overwrite stack or move piece', () => {
    const m = create(); m.board = Array.from({ length: 20 }, () => Array(10).fill('J'));
    m.active = { type: 'T', shape: [[0,1,0],[1,1,1],[0,0,0]], x: 4, y: 6 };
    m.active.shape.forEach((row, y) => row.forEach((v, x) => { if (v) m.board[6 + y][4 + x] = null; }));
    const before = JSON.stringify(m.active); assert.equal(m.rotate(1), false); assert.equal(JSON.stringify(m.active), before);
  });
  test('four-line clear collapses board and inserts empty rows', () => {
    const m = create();
    for (let y = 16; y < 20; y++) m.board[y] = Array.from({ length: 10 }, (_, x) => x === 4 ? null : 'J');
    m.board[15][0] = 'Z'; m.active = { type: 'I', shape: [[1],[1],[1],[1]], x: 4, y: 0 };
    assert.equal(m.hardDrop(), 4); assert.equal(m.cleared, 4);
    assert.equal(m.board[19][0], 'Z'); assert.equal(m.board.length, 20);
    assert.ok(m.board.slice(0, 4).every((row) => row.every((v) => !v)));
  });
  test('top-out refuses blocked spawn and above-board lock', () => {
    const m = create(); m.board = Array.from({ length: 20 }, () => Array(10).fill('J'));
    assert.equal(m.spawn(), false); assert.equal(m.over, true); assert.equal(m.active, null);
    const n = create(); n.active = { type: 'O', shape: [[1,1],[1,1]], x: 4, y: -1 };
    assert.equal(n.lock(), 0); assert.equal(n.over, true);
    assert.ok(n.board.every((row) => row.every((v) => !v)));
  });

  window.initGame(payload);
  test('initial real board waits for a clear, not an automatic question', () => {
    assert.equal(q('board').children.length, 200); assert.equal(q('preview').children.length, 16);
    assert.equal(root.querySelectorAll('[data-game-choice]').length, 0);
    assert.equal(cursor.at, 0); assert.equal(events[0].name, 'start'); assert.equal(timers.size, 1);
    assert.equal(q('next').getAttribute('href'), window.PolymathGame.nextLevelUrl);
  });
  test('keyboard, touch and gravity move pieces without advancing questions', () => {
    const x = model.active.x, y = model.active.y;
    key('ArrowLeft'); assert.equal(model.active.x, x - 1);
    control('right'); assert.equal(model.active.x, x);
    tick(true); assert.equal(model.active.y, y + 1); assert.equal(cursor.at, 0);
    key(' ', q('board'), true); assert.equal(model.active.y, y + 1);
    const outside = window.document.createElement('input'); window.document.body.appendChild(outside);
    key('ArrowLeft', outside); assert.equal(model.active.x, x);
  });
  test('pause stops timers and blocks controls; blur pauses safely', () => {
    click(q('pause')); assert.equal(q('pause').textContent, 'Resume'); assert.equal(timers.size, 0);
    const before = JSON.stringify(model.active); key('ArrowLeft'); control('drop'); tick(true);
    assert.equal(JSON.stringify(model.active), before);
    click(q('pause')); assert.equal(timers.size, 1);
    window.dispatchEvent(new window.Event('blur')); assert.equal(timers.size, 0);
    click(q('pause')); assert.equal(timers.size, 1);
    Object.defineProperty(window.document, 'hidden', { configurable: true, value: true });
    window.document.dispatchEvent(new window.Event('visibilitychange')); assert.equal(timers.size, 0);
    Object.defineProperty(window.document, 'hidden', { configurable: true, value: false });
    click(q('pause'));
  });
  test('grounded piece has 500ms lock delay and locks once', () => {
    model.board = freshBoard(); model.active = { type:'O', shape:[[1,1],[1,1]], x:4, y:18 };
    control('soft'); assert.ok([...timers.values()].some((t) => !t.repeat && t.delay === 500));
    tick(false); assert.equal(model.board[19][4], 'O'); assert.equal(timers.size, 1);
  });
  test('multi-line clear pauses for every row and banks only correct answers', () => {
    lineFixture(4); assert.equal(model.cleared, 4); assert.equal(cursor.at, 1);
    assert.equal(q('counter').textContent, 'Question 1 of 50'); // ignores stale settings count
    assert.equal(root.querySelectorAll('[data-game-choice]').length, 4); assert.equal(timers.size, 0);
    const row = JSON.stringify(model.board); key('ArrowLeft'); control('drop'); assert.equal(JSON.stringify(model.board), row);
    choose(false); choose(false);
    assert.equal(events.filter((e) => e.name === 'answer').length, 1); assert.equal(q('points').textContent, '0');
    assert.equal(q('verdict').hidden, false); assert.match(q('verdict').textContent, /Answer: One/);
    assert.match(q('verdict').textContent, /Explanation 1/); assert.equal(cursor.at, 1);
    for (let i = 0; i < 3; i++) { click(q('continue')); choose(true); }
    assert.equal(cursor.at, 4); assert.equal(q('points').textContent, '300');
    assert.equal(q('banked').textContent, '3'); assert.equal(timers.size, 0);
    const answers = events.filter((e) => e.name === 'answer');
    assert.deepEqual(answers.map((e) => e.questionIndex), [0,1,2,3]);
    assert.equal(answers[0].questionId, 'q1'); assert.equal(answers[0].chosen, 'Two'); assert.equal(answers[0].correct, false); assert.ok(answers[0].ms >= 0);
    click(q('continue')); assert.equal(timers.size, 1); assert.ok(model.active);
  });
  test('five-clear round finishes after feedback and emits exactly one win', () => {
    lineFixture(1); choose(true); assert.equal(q('modal').hidden, true);
    click(q('continue')); assert.equal(q('modal').dataset.open, 'true'); assert.equal(timers.size, 0);
    click(q('end')); key(' '); assert.equal(events.filter((e) => e.name === 'win').length, 1);
    const win = events.find((e) => e.name === 'win'); assert.equal(win.points, 400); assert.equal(win.questionsUsed, 5);
    assert.equal(win.correct, 4); assert.equal(win.wrong, 1); assert.equal(win.linesCleared, 5);
    assert.equal(window.document.activeElement, q('restart'));
    key('Tab', q('restart')); assert.equal(window.document.activeElement, q('next'));
  });
  test('restart resets board/score, preserves cursor, removes old timers/listeners', () => {
    click(q('restart')); assert.equal(q('modal').hidden, true); assert.equal(timers.size, 1);
    assert.equal(cursor.at, 5); assert.equal(model.cleared, 0); assert.equal(q('points').textContent, '0');
    assert.equal(q('play-area').hasAttribute('inert'), false);
    const x = model.active.x; key('ArrowLeft'); assert.equal(model.active.x, x - 1);
    lineFixture(); assert.equal(q('counter').textContent, 'Question 6 of 50');
    choose(true); click(q('continue'));
  });
  test('Finish emits one draw and stops gravity', () => {
    click(q('end')); click(q('end')); assert.equal(timers.size, 0);
    assert.equal(events.filter((e) => e.name === 'draw').length, 1);
  });
  test('a multi-clear crossing the goal still asks every earned question', () => {
    click(q('restart')); model.cleared = 4;
    const before = cursor.at;
    lineFixture(4);
    for (let i = 0; i < 4; i++) {
      assert.equal(q('modal').hidden, true);
      choose(i % 2 === 0); click(q('continue'));
    }
    assert.equal(cursor.at, before + 4);
    assert.equal(model.cleared, 8); assert.equal(q('points').textContent, '200');
    assert.equal(q('modal').dataset.open, 'true'); assert.equal(timers.size, 0);
  });
  test('top-out emits lose and replay advances to next unseen question', () => {
    click(q('restart')); lineFixture(); choose(true); click(q('continue'));
    // Use a legal lock to force a blocked subsequent spawn (not an artificial full-row clear).
    model.board = freshBoard(); model.board[0].fill('J'); model.board[0][0] = null;
    model.active = { type:'O', shape:[[1,1],[1,1]], x:0, y:18 };
    control('drop'); assert.equal(events.filter((e) => e.name === 'lose').length, 1);
    assert.equal(timers.size, 0); const at = cursor.at;
    click(q('restart')); lineFixture(); assert.equal(cursor.at, at + 1);
  });
  test('pool wraps only after all questions and feedback uses text, not HTML', () => {
    window.initGame(payload); cursor.at = 50; lineFixture(); assert.equal(q('counter').textContent, 'Question 1 of 50');
    assert.match(q('status').textContent, /Pool wrapped/);
    const malicious = structuredClone(payload); malicious.questions[1].prompt = '<img src=x onerror=alert(1)>';
    window.initGame(malicious); lineFixture(); assert.equal(q('prompt').querySelector('img'), null);
    assert.equal(q('prompt').textContent, malicious.questions[1].prompt);
  });
  test('missing and malformed payloads disable safely with no stale timers', () => {
    window.initGame({ questions: [] }); assert.equal(timers.size, 0); assert.equal(q('drop').disabled, true);
    window.initGame({ questions: [{ prompt:'Broken', choices:['One'], answerIndex:5 }] });
    assert.equal(timers.size, 0); assert.match(q('status').textContent, /valid question set/);
    window.initGame(payload); assert.equal(timers.size, 1);
  });
  test('repeated initialization never accelerates gravity or duplicates controls', () => {
    for (let i = 0; i < 8; i++) window.initGame(payload);
    assert.equal(timers.size, 1);
    const before = model.active.y; tick(true); assert.equal(model.active.y, before + 1);
    const x = model.active.x; control('left'); assert.equal(model.active.x, x - 1);
  });
  test('pagehide cleans up timers', () => { window.dispatchEvent(new window.Event('pagehide')); assert.equal(timers.size, 0); });
  test('no browser errors', () => assert.deepEqual(errors, []));
  dom.window.close();
  return { checks, problems };
}

module.exports = { run };
if (require.main === module) {
  const { checks, problems } = run();
  problems.forEach((problem) => console.error('FAIL ' + problem));
  console.log(`${checks} Tetris checks passed; ${problems.length} failed`);
  process.exitCode = problems.length ? 1 : 0;
}