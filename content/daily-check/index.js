/**
 * The daily check's item banks (docs/SCORECARD-LIVE.md): IPIP scale items (public domain, scale-items.js) and our own-wording taps (tap-items.json, validated:false).
 * The taps file is written by scripts/build-daily-taps.js; when it is missing the bank is simply empty and the check uses what it has.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const scale = require('./scale-items');

let taps = [];
try { taps = JSON.parse(fs.readFileSync(path.join(__dirname, 'tap-items.json'), 'utf8')).items || []; } catch { /* no tap bank yet */ }

module.exports = { SCALE_ITEMS: scale.ITEMS, TAP_ITEMS: taps };
