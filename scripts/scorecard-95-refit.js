/**
 * Refit the live read-out on REAL tester records and write a report the owner can read (docs/SCORECARD-95.md part 3).
 *   node scripts/scorecard-95-refit.js --records=records.json [--old=data/scorecard-readout.json] [--out=data/scorecard-readout.json] [--report=readout-refit-report.md]
 * records.json: an array of { userId, shareable, reads, anchor, halves } (see services/scorecard/readout-refit.js). Writes nothing to the database; account 6689 never enters.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RF = require('../services/scorecard/readout-refit');
const { SCENARIOS } = require('../services/onboarding/model');

const argv = process.argv.slice(2);
const arg = (n, d = '') => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
if (!arg('records')) { console.error('usage: --records=file.json [--old=artifact] [--out=artifact] [--report=file.md]'); process.exit(2); }
const records = JSON.parse(fs.readFileSync(arg('records'), 'utf8'));
const oldFile = arg('old', path.join(__dirname, '..', 'data', 'scorecard-readout.json'));
const old = fs.existsSync(oldFile) ? JSON.parse(fs.readFileSync(oldFile, 'utf8')) : null;
const res = RF.refit(records, old);
const val = RF.validity(RF.eligible(records), SCENARIOS.central);
fs.writeFileSync(arg('out', oldFile), JSON.stringify(res.art));
fs.writeFileSync(arg('report', 'readout-refit-report.md'), RF.reportMarkdown(res, val));
console.log(`refit: ${res.used} learners used, ${res.dropped} left out; report ${arg('report', 'readout-refit-report.md')}`);
