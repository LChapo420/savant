// node scripts/spanish/grade-test.js — checks the shared Spanish grader.
const assert = require('assert');
const g = require('../../public/spanish/js/shared/grade');
const t = (name, fn) => { try { fn(); console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n    ', e.message); process.exitCode = 1; } };

t('exact, case and punctuation free', () => assert.deepStrictEqual(g.check('¿cómo estás?', ['¿Cómo estás?']), { correct: true, note: '', closest: '¿Cómo estás?' }));
t('missing accent accepted with nudge', () => assert.strictEqual(g.check('como estas', ['¿Cómo estás?']).note, 'accent'));
t('typo in long word accepted with nudge', () => assert.strictEqual(g.check('informacion', ['la información']).correct, false));
t('typo in long word, right length', () => assert.strictEqual(g.check('la infomación', ['la información']).note, 'typo'));
t('short word typo rejected', () => assert.strictEqual(g.check('gato', ['pato']).correct, false));
t('alternate accepted answer', () => assert.strictEqual(g.check('I want a coffee please', ['I want a coffee, please.', 'I would like a coffee, please.']).correct, true));
t('wrong answer', () => assert.strictEqual(g.check('I want tea', ['I want a coffee, please.']).correct, false));
t('strict ñ pair', () => assert.strictEqual(g.check('ano', ['año'], { strictPairs: [['año', 'ano']] }).correct, false));
t('ñ dropped otherwise ok', () => assert.strictEqual(g.check('espanol', ['español']).note, 'accent'));
t('diff tags spelling vs sound', () => {
  const d = g.diff('vuenos dias, quero un cafe', 'Buenos días, quiero un café');
  const tags = d.tokens.map((x) => `${x.word}:${x.tag}`).join(' ');
  assert.ok(/buenos:spelling/.test(tags), tags);
  assert.ok(/días:accent/.test(tags), tags);
  assert.ok(/quiero:(spelling|sound)/.test(tags), tags);
  assert.ok(/café:accent/.test(tags), tags);
});
t('diff missing word', () => {
  const d = g.diff('hola como estas', 'Hola, ¿cómo estás hoy?');
  assert.ok(d.tokens.some((x) => x.word === 'hoy' && x.tag === 'missing'));
});
t('diff misheard word', () => {
  const d = g.diff('hola pero', 'hola perro');
  assert.ok(d.tokens.some((x) => x.word === 'perro' && x.tag === 'sound'), JSON.stringify(d.tokens));
});
t('speech lenient pass', () => assert.strictEqual(g.speech('hola como estas', '¡Hola! ¿Cómo estás?').pass, true));
t('speech fail', () => assert.strictEqual(g.speech('adios', '¡Hola! ¿Cómo estás?').pass, false));
t('speech 70% threshold', () => assert.strictEqual(g.speech('quiero un café', 'Quiero un café, por favor').pass, false));
