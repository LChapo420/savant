/**
 * Build content/game-fixes/english-proficient.json (read by services/game-fixes.js) from the re-audit's staged files.
 *
 *   node scripts/build-english-game-fixes.js --rewritten DIR/rewritten.json [--release DIR/release.json]
 *
 * rekeys:   the 90 in curriculum-build/staged/content-fixes/english-games-reaudit/rekey-confirmed.json (both blind judges and the code check agree)
 * rewrites: the questions in --rewritten (each passed the code checks and a blind re-solve by two judges of different families)
 * release:  the levels in --release ({level: hash}) that two blind judges then kept in full after the edits
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const STAGED = path.join(__dirname, '..', 'curriculum-build', 'staged', 'content-fixes', 'english-games-reaudit');
const rek = JSON.parse(fs.readFileSync(path.join(STAGED, 'rekey-confirmed.json'), 'utf8')).rekey;
const rewritten = arg('rewritten') ? JSON.parse(fs.readFileSync(arg('rewritten'), 'utf8')) : {};
const release = arg('release') ? JSON.parse(fs.readFileSync(arg('release'), 'utf8')) : {};
const out = {
  note: 'Fixes to the stored shared English Proficient game sets (services/game-fixes.js applies them once, idempotently, at start-up). From the 2 Nov 2026 re-audit; see curriculum-build/staged/content-fixes/english-games-reaudit/.',
  source: 'english-games-reaudit-2026-11-02',
  track_id: 'english',
  grade_id: 'proficient',
  rekeys: rek.map((k) => ({ level: k.level, qid: k.key.split(':')[1], from: k.keyIndex, to: k.set.answerIndex })),
  rewrites: Object.entries(rewritten).map(([key, v]) => {
    const { judgeA, judgeB, judgeBby, writer, tries, ...question } = v.question;
    return { level: v.level, qid: key.split(':')[1], old_prompt: v.old_prompt, question };
  }),
  release: Object.entries(release).map(([level, hash]) => ({ level: Number(level), hash })),
};
fs.mkdirSync(path.join(__dirname, '..', 'content', 'game-fixes'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'content', 'game-fixes', 'english-proficient.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`rekeys ${out.rekeys.length}, rewrites ${out.rewrites.length}, release ${out.release.length}`);
