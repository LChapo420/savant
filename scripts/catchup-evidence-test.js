#!/usr/bin/env node
/**
 * C4: every mechanism id cited in docs/CATCHUP-PROOF.md exists in the evidence articles, the
 * map covers each design choice, and the one choice with no mechanism is listed as UNVERIFIED.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const art = path.join(root, 'curriculum-build', 'evidence-article');
const doc = fs.readFileSync(path.join(root, 'docs', 'CATCHUP-PROOF.md'), 'utf8').split('<!-- sim:start -->')[0];
const verify = fs.readFileSync(path.join(root, 'docs', 'yc', 'SOURCES-TO-VERIFY.md'), 'utf8');
const file = (n) => fs.readFileSync(path.join(art, fs.readdirSync(art).find((f) => f.startsWith(`${n}-`) && f.endsWith('.md'))), 'utf8');
const articles = { 1: file('01'), 2: file('02') };

let failed = 0;
function check(name, fn) { try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); } }

const ids = [...new Set([...doc.matchAll(/\b0([12])-M(\d+)\b/g)].map((m) => [Number(m[1]), Number(m[2])].join(':')))];
check('the map cites mechanisms', () => assert.ok(ids.length >= 8, `${ids.length} ids`));
for (const id of ids) {
  const [a, m] = id.split(':').map(Number);
  check(`0${a}-M${m} exists`, () => {
    if (a === 1) assert.ok(new RegExp(`^### M${m}\\. `, 'm').test(articles[1]));
    else assert.ok(new RegExp(`^\\| ${m} \\| `, 'm').test(articles[2].split('## Mechanisms in detail')[0]));
  });
}
for (const choice of ['Diagnostic first', 'Skip mastered', 'Prerequisite order', 'Retrieval practice', 'Spacing', 'Final re-check', 'Interleaving']) check(`map covers: ${choice}`, () => assert.ok(doc.includes(`| ${choice}`)));
check('prerequisite order is UNVERIFIED in both places', () => { assert.ok(/Prerequisite order[^\n]*UNVERIFIED/.test(doc)); assert.ok(/prerequisite order[^\n]*UNVERIFIED/i.test(verify)); });
check('the engine still names the mechanisms it relies on', () => {
  const src = fs.readFileSync(path.join(root, 'services', 'catchup-engine.js'), 'utf8');
  for (const w of ['unitBelief', 'startRecheck', 'scoreRecheck', 'newState']) assert.ok(src.includes(w), w);
  assert.ok(fs.readFileSync(path.join(root, 'services', 'catchup-units.js'), 'utf8').includes('REVIEW_DAYS'));
});

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
