/**
 * Check a game engine the way the game page plays it.
 *
 * An engine is a template: markup, scoped styles, and one script that reads its
 * questions from the injected payload. This loads it into a DOM, hands it a
 * synthetic payload and the same `window.PolymathGame` the game page provides,
 * and then plays it the way a learner would — answering wrong, answering right,
 * taking the actions the game asks for, losing or winning, and pressing Play
 * again — asserting the contract the whole game library is held to:
 *
 *   - a question is on screen with exactly `choicesPerQuestion` choices,
 *   - every answer fires `game:answer` with the payload's own question id and
 *     the question's place in the pool,
 *   - the question cursor only ever moves forward: a restart after a game over
 *     continues at the next unseen question, never the same one again,
 *   - the game ends into a card offering Play again AND Next level, with the
 *     next-level door taken from the page,
 *   - win, lose or draw is reported through the shared events,
 *   - nothing throws along the way.
 *
 *   node scripts/check-game-engine.js                 # every engine on disk
 *   node scripts/check-game-engine.js tetris snake    # just these
 *
 * Uses the project's jsdom development dependency.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const ENGINES_DIR = path.join(ROOT, 'public', 'games', 'engines');
const SCHEMAS_DIR = path.join(ROOT, 'public', 'games', 'schemas');
const MARKER = '/* __DATA_INJECTION__ */';

/** The same cursor the game page hands every engine, with the same persistence. */
function makeCursor() {
  return {
    at: 0,
    next(total) {
      const size = Math.max(1, Number(total) || 1);
      const index = this.at % size;
      const wrapped = this.at > 0 && index === 0;
      this.at += 1;
      return { index, wrapped };
    },
  };
}

/** A payload the model could have written: `count` unique questions, 4 choices. */
function syntheticPayload(schema, count) {
  const choices = schema.choicesPerQuestion || 4;
  const questions = [];
  for (let i = 0; i < count; i++) {
    const opts = [];
    for (let c = 0; c < choices; c++) opts.push(`Option ${String.fromCharCode(65 + c)} of question ${i + 1}`);
    questions.push({
      id: `q${i + 1}`,
      prompt: `Question prompt number ${i + 1}?`,
      choices: opts,
      answerIndex: i % choices,
      explanation: `Because question ${i + 1} says so.`,
      difficulty: 5,
      skill: 'test_skill',
      topic: 'Test topic',
    });
  }
  return {
    schemaVersion: 1,
    engineId: schema.engineId,
    meta: {
      subject: 'Test subject', grade: 'Test grade', level: 1,
      topic: 'Test topic', title: 'Test title', ageRange: 'Ages 10-11',
    },
    settings: {
      questionCount: count,
      choicesPerTurn: choices,
      difficulty: { start: 5, end: 7, curve: 'flat' },
      timeLimitSec: null,
    },
    questions,
    feedback: {
      correct: 'Correct line.', incorrect: 'Incorrect line.',
      win: 'Win line.', lose: 'Lose line.', draw: 'Draw line.',
      outOfQuestions: 'Out of questions line.',
    },
  };
}

function checkEngine(engineId) {
  if (fs.readFileSync(path.join(ENGINES_DIR, `${engineId}.html`), 'utf8').includes('/games/remade.js')) {
    return require('./remade-games-test').checkEngine(engineId);
  }
  // Real Tetris asks questions only after a player earns a line clear; the
  // generic question-first clicker cannot exercise its physics or controls.
  if (engineId === 'tetris') return require('./tetris-test').run().problems;
  const problems = [];
  const enginePath = path.join(ENGINES_DIR, `${engineId}.html`);
  const schemaPath = path.join(SCHEMAS_DIR, `${engineId}.question-schema.json`);

  let schema = null;
  try { schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')); } catch (err) {
    return [`${engineId}: no question schema (${err.message})`];
  }
  if (schema.engineId !== engineId) problems.push(`${engineId}: schema engineId is ${schema.engineId}`);
  if (schema.questionCount !== 50) problems.push(`${engineId}: schema questionCount is ${schema.questionCount}, expected 50`);
  if (!schema.choicesPerQuestion) problems.push(`${engineId}: schema has no choicesPerQuestion`);

  let html = '';
  try { html = fs.readFileSync(enginePath, 'utf8'); } catch (err) {
    return [`${engineId}: no engine file (${err.message})`];
  }
  if (!html.includes(MARKER)) problems.push(`${engineId}: the ${MARKER} marker is missing`);
  if (!html.includes("window.GAME_DATA")) problems.push(`${engineId}: window.GAME_DATA is missing`);

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const markup = html
    .replace(/<script>[\s\S]*?<\/script>/g, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '');

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => errors.push(String(err && err.message || err)));
  const dom = new JSDOM(markup, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.addEventListener('error', (e) => errors.push(String(e.message || e.error)));

  const events = [];
  ['start', 'answer', 'win', 'lose', 'draw'].forEach((name) => {
    window.addEventListener(`game:${name}`, (e) => events.push({ name, detail: (e && e.detail) || {} }));
  });

  const cursor = makeCursor();
  window.PolymathGame = {
    engineId,
    level: 1,
    enrollment: 1,
    nextLevelUrl: '/session?enrollment=1&level=2',
    cursor,
  };

  try {
    scripts.forEach((code) => window.eval(code));
  } catch (err) {
    problems.push(`${engineId}: engine script threw on load: ${err.message}`);
    dom.window.close();
    return problems;
  }

  const root = window.document.getElementById('game-root');
  if (!root) {
    problems.push(`${engineId}: no #game-root in the markup`);
    dom.window.close();
    return problems;
  }
  const q = (name) => root.querySelector(`[data-game-${name}]`);
  const counterText = () => (q('counter') ? String(q('counter').textContent || '') : '');
  const counterNumber = () => {
    const m = counterText().match(/(\d+)\s*of\s*(\d+)/);
    return m ? Number(m[1]) : null;
  };
  const modalOpen = () => {
    const modal = q('modal');
    if (!modal) return false;
    const open = modal.dataset.open;
    if (open !== undefined) return open === 'true';
    return !modal.hidden && window.getComputedStyle(modal).display !== 'none';
  };
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

  const count = 50;
  const payload = syntheticPayload(schema, count);

  if (typeof window.initGame !== 'function') {
    problems.push(`${engineId}: window.initGame is not defined`);
    dom.window.close();
    return problems;
  }
  try {
    window.initGame(payload);
  } catch (err) {
    problems.push(`${engineId}: initGame threw: ${err.message}`);
    dom.window.close();
    return problems;
  }

  // The first question, whole and answerable.
  const prompt = q('prompt');
  if (!prompt || !String(prompt.textContent || '').trim()) problems.push(`${engineId}: no question prompt on screen`);
  const choiceButtons = () => [...root.querySelectorAll('[data-game-choice]')];
  if (choiceButtons().length !== (schema.choicesPerQuestion || 4)) {
    problems.push(`${engineId}: ${choiceButtons().length} choices on screen, expected ${schema.choicesPerQuestion || 4}`);
  }
  if (counterNumber() !== 1) problems.push(`${engineId}: counter says "${counterText()}", expected Question 1 of ${count}`);
  if (!events.some((e) => e.name === 'start')) problems.push(`${engineId}: no game:start event`);

  const answerOnce = (wantCorrect) => {
    const at = counterNumber();
    if (at === null) return { outcome: 'no-question', added: [] };
    const item = payload.questions[(at - 1) % payload.questions.length];
    const wanted = wantCorrect ? item.answerIndex : (item.answerIndex + 1) % item.choices.length;
    const btn = choiceButtons().find((b) => Number(b.getAttribute('data-game-choice')) === wanted);
    if (!btn) return { outcome: 'no-button', added: [] };
    const before = events.length;
    click(btn);
    const added = events.slice(before);
    return { outcome: added.length ? 'answered' : 'no-event', added };
  };

  const tapGameAction = () => {
    // Try each candidate action until one moves the game: an "action" control
    // the engine marked, or any plain button that is not part of the question
    // or the end card. A candidate can be inert — an occupied board cell, a
    // control the game is not waiting on — so the first click proving nothing
    // moved must not be read as the game being stuck.
    const marked = [...root.querySelectorAll('[data-game-action]')];
    const plain = [...root.querySelectorAll('button, [role="button"]')].filter((b) => !b.hasAttribute('data-game-choice')
      && !b.hasAttribute('data-game-restart') && !b.hasAttribute('data-game-end') && !b.disabled && !b.hidden);
    const candidates = [...marked, ...plain].slice(0, 12);
    for (const candidate of candidates) {
      const at = counterNumber();
      click(candidate);
      if (modalOpen() || counterNumber() !== at) return true;
    }
    return false;
  };

  // Play: wrong answers and right answers, taking the actions the game asks for,
  // until the game ends or it clearly cannot.
  let ended = false;
  for (let step = 0; step < 25 && !ended; step++) {
    if (modalOpen()) { ended = true; break; }
    const at = counterNumber();
    const { outcome, added } = answerOnce(step % 2 === 0);
    if (outcome !== 'answered') {
      problems.push(`${engineId}: step ${step}: clicking a choice produced ${outcome}`);
      break;
    }
    // The step's own answer event, whether or not the answer ended the game.
    const answerEvent = added.find((e) => e.name === 'answer');
    if (!answerEvent) {
      problems.push(`${engineId}: step ${step}: no game:answer event (${added.map((e) => e.name).join(', ') || 'nothing'})`);
      break;
    }
    if (!answerEvent.detail.questionId) problems.push(`${engineId}: game:answer carries no questionId`);
    if (typeof answerEvent.detail.correct !== 'boolean') problems.push(`${engineId}: game:answer carries no correct flag`);
    if (!('questionIndex' in answerEvent.detail)) problems.push(`${engineId}: game:answer carries no questionIndex`);
    else if (answerEvent.detail.questionIndex !== (at - 1) % count) {
      problems.push(`${engineId}: game:answer questionIndex is ${answerEvent.detail.questionIndex}, expected ${(at - 1) % count}`);
    }
    if (added.some((e) => ['win', 'lose', 'draw'].includes(e.name))) { ended = true; break; }
    if (modalOpen()) { ended = true; break; }
    // A right answer can hand control to the game (place a mark, take a shot).
    if (counterNumber() === at) {
      tapGameAction();
      if (counterNumber() === at && !modalOpen()) {
        problems.push(`${engineId}: step ${step}: nothing moved after the answer or a game action`);
        break;
      }
    }
    if (cursor.at > count) break;
  }

  if (!ended && q('end')) {
    click(q('end'));
    ended = modalOpen();
  }

  if (ended) {
    const kinds = events.filter((e) => ['win', 'lose', 'draw'].includes(e.name)).map((e) => e.name);
    if (!kinds.length) problems.push(`${engineId}: game over with no game:win/lose/draw event`);
    const restart = q('restart');
    const next = q('next');
    if (!restart) problems.push(`${engineId}: game over card has no [data-game-restart] Play again`);
    if (!next) problems.push(`${engineId}: game over card has no [data-game-next] Next level`);
    if (next && next.getAttribute('href') !== window.PolymathGame.nextLevelUrl) {
      problems.push(`${engineId}: [data-game-next] href is ${next.getAttribute('href')}, expected the page's next-level door`);
    }
    if (next && next.hidden) problems.push(`${engineId}: [data-game-next] is hidden although the page provided a door`);

    // The heart of it: Play again continues the questions instead of restarting.
    const beforeRestart = cursor.at;
    const atEnd = counterNumber();
    if (restart) {
      click(restart);
      if (modalOpen()) problems.push(`${engineId}: Play again left the game-over card open`);
      const now = counterNumber();
      const expected = (atEnd % count) + 1;
      if (now !== expected) {
        problems.push(`${engineId}: Play again shows Question ${now}, expected Question ${expected} — the cursor must only move forward`);
      }
      if (cursor.at <= beforeRestart) problems.push(`${engineId}: Play again did not take a new question from the cursor`);
    }
  } else {
    problems.push(`${engineId}: the game never ended across 25 answers — needs a finite end condition or a [data-game-end] button`);
  }

  if (errors.length) problems.push(`${engineId}: page errors: ${errors.slice(0, 3).join(' | ')}`);
  dom.window.close();
  return problems;
}

function main() {
  const wanted = process.argv.slice(2);
  const ids = wanted.length
    ? wanted
    : [...new Set([...fs.readdirSync(ENGINES_DIR)].filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')))];
  let failed = 0;
  ids.forEach((id) => {
    const problems = checkEngine(id);
    if (problems.length) {
      failed++;
      console.log(`FAIL  ${id}`);
      problems.forEach((p) => console.log(`      - ${p}`));
    } else {
      console.log(`PASS  ${id}`);
    }
  });
  console.log(`\n${ids.length - failed}/${ids.length} engines pass`);
  if (failed) process.exit(1);
}

main();
