/**
 * The real app with a scripted model, for clicking through failure and recovery: free, no provider, no learner data. Not used by the product.
 *   RECOVERY_CONTROL=<file> DB_FILE=<copy> PORT=<port> node scripts/uploads-recovery-server.js
 * The control file holds { mode: ok|down|credit|hang, delayMs, dieAfter } and is read on every call:
 *   down    every call throws, as when no provider answers
 *   credit  every call throws a spend refusal, as when the credit is gone
 *   hang    the call waits 120 s and then fails
 *   dieAfter: n  the process exits after n calls, as a server that crashes in the middle of a build
 */
const fs = require('fs');
process.env.UPLOAD_FACTCHECK = 'on';
const ai = require('../services/ai');
const CONTROL = process.env.RECOVERY_CONTROL;
const control = () => { try { return JSON.parse(fs.readFileSync(CONTROL, 'utf8')); } catch { return { mode: 'ok' }; } };
let calls = 0; let armed = null;
const passagesIn = (user) => [...String(user).matchAll(/\[(p\d+)\]\n?([^[]*)/g)].map((m) => ({ id: m[1], text: m[2].trim() }));
const sentences = (t) => (t.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || []).map((s) => s.trim()).filter((s) => s.split(' ').length > 3);
function fake(a) {
  const ps = passagesIn(a.user);
  const first = ps[0] || { id: 'p1', text: 'The material says this much at least, and it says it plainly here.' };
  const ss = sentences(ps.map((p) => p.text).join(' '));
  if (a.task === 'material_outline') return { skills: ps.map((p, i) => ({ id: `s${p.id}`, title: `Part ${p.id}: ${(sentences(p.text)[0] || 'Topic').split(' ').slice(0, 4).join(' ')}`, summary: '', unit: 'One', prerequisites: i ? [`s${ps[i - 1].id}`] : [], passage_ids: [p.id], taught: true })) };
  if (a.task === 'material_lesson') {
    const qs = ss.slice(0, 6).map((s, i) => ({ type: 'multiple_choice', prompt: `Which line is from the material (${i + 1})?`, choices: [s.slice(0, 150), `Not this one ${i}`, `Nor this one ${i}`], answer_index: 0, misconceptions: ['', 'a', 'b'], tier: (i % 3) + 1, explanation: s, passage_id: first.id, quote: first.text.slice(0, 80) }));
    return { lesson: { paragraphs: [ss.slice(0, 2).join(' ') || first.text.slice(0, 300), ss.slice(2, 4).join(' ') || first.text.slice(0, 100)], key_points: ss.slice(4, 5) }, questions: qs };
  }
  if (a.task === 'material_verify') return { verdicts: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, supported: true })) };
  if (/^material_factcheck/.test(a.task)) return { verdicts: Array.from({ length: 60 }, (_, i) => ({ n: i + 1, verdict: 'supported' })) };
  if (a.task === 'material_notes') return { sections: [{ heading: 'Main points', bullets: ss.slice(0, 5).map((s) => ({ text: s, passage_id: first.id, quote: first.text.slice(0, 60) })) }] };
  if (a.task === 'material_pack') return { summary: [ss.slice(0, 2).join(' ')], flashcards: ss.slice(0, 5).map((s, i) => ({ front: `Card ${i + 1}`, back: s, passage_id: first.id, quote: first.text.slice(0, 60) })), questions: ss.slice(0, 6).map((s, i) => ({ for: i % 2 ? 'quiz' : 'test', type: 'multiple_choice', prompt: `Which is from the material (${i + 1})?`, choices: [s.slice(0, 150), `No ${i}`, `Not ${i}`], answer_index: 0, explanation: s, passage_id: first.id, quote: first.text.slice(0, 60) })) };
  if (a.task === 'material_podcast') return { title: 'Episode', turns: ss.slice(0, 8).map((s, i) => ({ host: i % 2 ? 'B' : 'A', text: s })), checkins: [] };
  return {};
}
ai.isEnabled = () => true;
ai.structuredDetail = async (a) => {
  calls += 1;
  const c = control();
  if (c.dieNext) { armed = armed == null ? calls : armed; if (calls - armed >= c.dieNext) { console.log(`[recovery] dying after ${calls} calls`); process.exit(9); } }
  await new Promise((r) => setTimeout(r, c.delayMs == null ? 300 : c.delayMs));
  if (c.mode === 'down') throw new Error('every provider failed');
  if (c.mode === 'credit') { const e = new Error('spend ledger refused the call'); e.code = 'ledger'; throw e; }
  if (c.mode === 'hang') { await new Promise((r) => setTimeout(r, 120000)); throw new Error('timeout'); }
  return { data: fake(a), model: 'scripted' };
};
require('../server');
