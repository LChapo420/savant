/**
 * Tests for the later piano and basketball stage checks (PI2-PI10, BB1-BB12):
 * services/skill-piano-bb-sittings.js, content/skill-piano-bb-sittings.js,
 * content/piano-sight-reading.js, content/basketball-scenes.js,
 * public/js/piano-notation.js, and their wiring into patch 02
 * (content/skill-stage-checks.js, services/skill-checks.js, routes,
 * the stage check page) and patch 03's per-stage gate.
 *
 *   node scripts/skills-r3-piano-bb-test.js
 *
 * Throwaway data file, keys blanked, no model call, no network. Every sitting
 * is played through the API with synthesized MIDI, microphone, on-screen or
 * pedal events, or answered, and recorded in the skill record.
 */
const F = require('./lib/skills-r3-fixture');
const fs = require('fs');
const path = require('path');

const { db, check, learner, serve, fresh, DAY, at, later, HOUR } = F;
const P = require('../public/engine/piano/piano-core');
const SR = require('../content/piano-sight-reading');
const SCENES = require('../content/basketball-scenes');
const COURT = require('../public/engine/basketball/court.js');

const openOf = (uid, metric) => { const r = db.findOne('skill_records', (x) => x.user_id === uid && x.metric_id === metric); return r && r.open; };
const rowOf = (uid, metric) => db.findOne('skill_records', (x) => x.user_id === uid && x.metric_id === metric);
let seedA = 20261024;
const rnd = () => { seedA = (seedA * 48271) % 2147483647; return seedA / 2147483647; };

/** Notes for a part: every target note on its beat (time in ms), from `source`; options shape the playing. */
function perform(part, o = {}) {
  const beat = 60000 / part.tempo;
  const src = o.source || 'midi';
  let target = part.target;
  if (src === 'mic' && part.hands === 'both') target = target.filter((t, i, a) => i === a.length - 1 || t.beat !== a[i + 1].beat);
  return target.map((t, i) => ({
    midi: o.wrongEvery && i % o.wrongEvery === 1 ? t.midi + 1 : t.midi,
    time: 1000 + t.beat * beat + (o.jitter ? (i % 2 ? o.jitter : -o.jitter) : 0) + (o.drift ? i * o.drift : 0),
    velocity: o.velocity ? o.velocity(t) : 70,
    source: src,
    confidence: src === 'mic' ? 0.9 : 1,
  }));
}
/** Chords for a cadence or pedal part: each chord's notes together, a second apart. */
function chordsPlayed(part, source = 'midi', gap = 1000) {
  const out = [];
  part.target_chords.forEach((ch, i) => ch.forEach((m, k) => out.push({ midi: m, time: 1000 + i * gap + k * 3, velocity: 70, source })));
  return out;
}

/** A tiny DOM, enough for the page scripts that draw (piano-notation.js, court.js). */
function fakeDom() {
  const mk = (tag) => ({ tag, attrs: {}, children: [], style: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html || ''; } });
  return { createElementNS: (ns, tag) => mk(tag), createElement: (tag) => mk(tag), mk };
}

/** Every answer right for an items sitting, read from the stored key (the page never has it). */
function rightAnswer(item) {
  const k = item.key;
  if (k.type === 'choice') return k.answer;
  if (k.type === 'number') return String(k.value);
  if (k.type === 'text') return k.accepts[0];
  return null;
}

(async () => {
  console.log('skills round 3: piano PI2-PI10 and basketball BB1-BB12 sittings');
  process.env.SKILL_RECORD = 'on';
  process.env.SKILL_STAGE_TESTS = 'on';
  process.env.SKILL_PIANO_BB_SITTINGS = 'off';
  const PB = fresh('services/skill-piano-bb-sittings');
  const routes = fresh('routes/skills');
  const app = await serve([routes]);
  const mastery = require('../services/mastery');
  const gate = require('../services/skill-gate');

  // ── off: patch 02's "not wired" stands ──
  const p2off = learner('piano', 'piano_first_reader', 'final');
  let r = await app.get(`/api/skills/checks/${p2off.enrollment.id}`, p2off.user.id);
  check('flag off: PI2 sight-reading is still not wired', r.status === 200 && r.json.checks.checks.filter((c) => c.provable && !c.wired).map((c) => c.metric).join(',') === 'sight_reading_level', r.json.checks && r.json.checks.checks.map((c) => `${c.metric}:${c.how}`));

  process.env.SKILL_PIANO_BB_SITTINGS = 'on';
  const STAGES = [['piano', 'PI2', 'piano_first_reader', 4], ['piano', 'PI3', 'piano_elementary_1', 3], ['piano', 'PI4', 'piano_elementary_2', 4], ['piano', 'PI5-7', 'piano_upper_intermediate', 4], ['piano', 'PI8-10', 'piano_pre_professional', 3],
    ['basketball', 'BB1', 'basketball_mini_starter', 4], ['basketball', 'BB2', 'basketball_mini_player', 3], ['basketball', 'BB3', 'basketball_junior_club_player', 3], ['basketball', 'BB4-5', 'basketball_youth_advanced', 3], ['basketball', 'BB6-7', 'basketball_elite_junior', 2], ['basketball', 'BB8-12', 'basketball_all_star_and_olympic', 1]];
  const wired = {};
  for (const [track, stage, grade] of STAGES) {
    const L = learner(track, grade);
    const o = (await app.get(`/api/skills/checks/${L.enrollment.id}`, L.user.id)).json.checks;
    wired[stage] = `${o.checks.filter((c) => c.provable && c.wired).length}/${o.checks.filter((c) => c.provable).length}`;
  }
  check('flag on: every machine-provable metric of PI2-PI10 and BB1-BB12 has a sitting (34 of 34)', STAGES.every(([, st, , n]) => wired[st] === `${n}/${n}`), wired);

  // ── the sight-reading generator, level by level ──
  const SPEC = require('../content/skill-piano-bb-sittings.data.json').piano.sight_reading_staircase.levels;
  let bad = [];
  const seen = new Set();
  let made = 0;
  for (const lv of ['SR1', 'SR2', 'SR3', 'SR4', 'SR5', 'SR6', 'SR7']) {
    const spec = SPEC.find((x) => x.level === lv);
    for (let i = 0; i < 150; i++) {
      const e = SR.excerpt(lv, rnd);
      made++;
      const m = SR.METRES[e.metre];
      const key = SR.keyOf(e.key);
      if (!spec.keys.includes(e.key)) bad.push(`${lv} key ${e.key} not in the level`);
      if (!spec.metres.includes(e.metre)) bad.push(`${lv} metre ${e.metre}`);
      if (Math.abs(key.fifths) > spec.max_accidentals) bad.push(`${lv} ${e.key} has more accidentals than the level`);
      if (e.score.bars.length !== spec.bars) bad.push(`${lv} ${e.score.bars.length} bars`);
      let onsets = 0;
      const prevTieOf = { treble: false, bass: false };
      e.score.bars.forEach((bar, b) => {
        for (const st of e.score.staves) {
          const sum = (bar[st] || []).reduce((a, x) => a + x.dur, 0);
          if (Math.abs(sum - m.len) > 1e-6) bad.push(`${lv} bar ${b + 1} ${st} lasts ${sum}`);
        }
        for (const st of ['treble', 'bass']) {
          let t = b * m.len;
          let prevTie = prevTieOf[st];
          for (const ev of bar[st] || []) {
            if (!ev.rest) {
              for (const n of ev.notes) {
                const midi = P.noteToMidi(n);
                const letter = n[0];
                const alter = n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0;
                if (alter !== SR.alterIn(key.fifths, letter)) bad.push(`${lv} ${n} is outside ${e.key}'s key signature`);
                const hit = e.target.find((x) => x.midi === midi && Math.abs(x.beat - t) < 1e-3);
                if (!prevTie && !hit) bad.push(`${lv} ${n} at beat ${t} is not in the target`);
                if (!prevTie) onsets++;
              }
            }
            prevTie = !!ev.tie;
            t += ev.dur;
          }
          prevTieOf[st] = prevTie;
        }
      });
      if (onsets !== e.target.length) bad.push(`${lv} ${onsets} note heads but ${e.target.length} scored onsets`);
      if (e.target.some((x, k) => k && (x.beat < e.target[k - 1].beat || (x.beat === e.target[k - 1].beat && x.midi < e.target[k - 1].midi)))) bad.push(`${lv} target out of order`);
      if (lv === 'SR1' && e.target.some((x) => x.midi < 60 || x.midi > 67)) bad.push('SR1 leaves the C five-finger position');
      if (lv === 'SR2' && e.target.some((x) => x.midi < 36 || x.midi > 84)) bad.push('SR2 leaves the on-screen keys (C2-C6)');
      if (['SR4', 'SR5', 'SR6', 'SR7'].includes(lv) && !e.score.bars.every((bar) => bar.bass.length && bar.treble.length)) bad.push(`${lv} is not hands together`);
      if (lv === 'SR3' && !e.score.bars.every((bar) => (bar.treble.every((x) => x.rest) || bar.bass.every((x) => x.rest)))) bad.push('SR3 hands do not take turns');
      seen.add(JSON.stringify(e.target));
    }
  }
  check(`sight-reading: ${made} excerpts at SR1-SR7 keep their level's keys, metres, key signature, bars and hands; every bar adds up; every note head is scored once (ties not again)`, !bad.length, bad.slice(0, 8));
  check('...and almost all are different music (99% or more, before the per-learner rule)', seen.size >= made * 0.99, { distinct: seen.size, made });
  const sr6 = Array.from({ length: 60 }, () => SR.excerpt('SR6', rnd));
  const sr7 = Array.from({ length: 60 }, () => SR.excerpt('SR7', rnd));
  check('...SR6 has ties, two-note chords and 6/8; SR7 has triplets, syncopation and hairpins', sr6.some((e) => e.score.bars.some((b) => b.treble.some((x) => x.tie))) && sr6.some((e) => e.score.bars.some((b) => b.treble.some((x) => x.notes && x.notes.length === 2))) && sr6.some((e) => e.metre === '6/8')
    && sr7.some((e) => e.score.bars.some((b) => b.treble.some((x) => x.tuplet))) && sr7.some((e) => e.score.bars.some((b) => b.treble.some((x, i, a) => i + 2 < a.length && x.dur === 0.5 && a[i + 1].dur === 1 && a[i + 2].dur === 0.5))) && sr7.some((e) => e.score.bars.some((b) => b.hairpin)));

  // The notation draws every level without an error, in a stand-in DOM.
  const dom = fakeDom();
  global.document = dom;
  global.window = global;
  delete require.cache[require.resolve('../public/js/piano-notation.js')];
  require('../public/js/piano-notation.js');
  let drawn = 0; const drawErr = [];
  for (const lv of ['SR1', 'SR2', 'SR3', 'SR4', 'SR5', 'SR6', 'SR7']) {
    for (let i = 0; i < 25; i++) {
      const e = SR.excerpt(lv, rnd);
      try { const box = dom.mk('div'); const svg = global.PianoNotation.render(box, e.score, { width: i % 2 ? 360 : 820 }); if (!svg.attrs.viewBox || !/Score:/.test(svg.attrs['aria-label'])) drawErr.push(lv); drawn++; } catch (err) { drawErr.push(`${lv}: ${err.message}`); }
    }
  }
  try { global.PianoNotation.render(dom.mk('div'), SR.pedalPassage(rnd).score, { width: 400 }); drawn++; } catch (err) { drawErr.push(`pedal: ${err.message}`); }
  check(`notation: ${drawn} scores drawn (every level, phone and desktop widths, the pedal passage) without an error`, !drawErr.length && drawn === 176, drawErr.slice(0, 4));

  // ── the technique fix: arpeggios to the top tonic, chromatic scales with notes ──
  const D0 = require('../content/skill-stage-checks.data.json');
  const D1 = require('../content/skill-piano-bb-sittings.data.json');
  bad = [];
  for (const b of [...D0.piano.technique, ...D1.piano.technique]) {
    for (const it of b.items) {
      const run = SR.scaleRun(it);
      const top = Math.max(...run);
      if (run[0] !== run[run.length - 1]) bad.push(`${it.item}: does not come back`);
      if (it.octaves && (top - run[0]) !== 12 * it.octaves) bad.push(`${it.item}: spans ${top - run[0]} semitones`);
      if (top > 96 || run[0] < 24) bad.push(`${it.item}: off the keyboard`);
      if (/melodic_minor/.test(it.kind)) { const i = run.indexOf(top); const down = run.slice(i); if (down.some((m) => ((m - run[0]) % 12 + 12) % 12 === 11)) bad.push(`${it.item}: raised 7th on the way down`); }
    }
  }
  check('technique runs: every PI2-PI10 battery item goes up its octaves to the top tonic and back (arpeggios included, melodic minor down as natural), on the keyboard', !bad.length, bad.slice(0, 6));
  const checks = require('../services/skill-checks');
  const arp = checks.takeParts({ build: 'scale', battery: 'PI3', item: 'G major arpeggio', hands: ['right'], tempo: 80, rule: {} }, rnd, 1)[0];
  check('...PI3 G major arpeggio now ends its climb on G (it stopped on D, so a right performance came out late on every note down)', arp && arp.target.length === 13 && arp.target[6].midi % 12 === 7, arp && arp.target.map((t) => t.midi));

  // ── scale and arpeggio spelling (fact re-verification 2026-10-25) ──
  // Every battery item's spelling, re-derived from theory: one letter per degree
  // (each letter once in a seven-note scale, every other letter in an arpeggio)
  // and the intervals of its kind from the tonic; the stored MIDI must match the
  // spelling; and the names shown on the page are the item's spelled notes.
  const LETTERS = 'CDEFGAB';
  const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ACC = { '': 0, '#': 1, '##': 2, x: 2, b: -1, bb: -2 };
  const pcOf = (n) => { const m = /^([A-G])(##|#|x|bb|b)?$/.exec(n); return m ? ((NAT[m[1]] + ACC[m[2] || '']) % 12 + 12) % 12 : null; };
  const SHAPES = {
    major: [[0, 1, 2, 3, 4, 5, 6], [0, 2, 4, 5, 7, 9, 11]], natural_minor: [[0, 1, 2, 3, 4, 5, 6], [0, 2, 3, 5, 7, 8, 10]],
    harmonic_minor: [[0, 1, 2, 3, 4, 5, 6], [0, 2, 3, 5, 7, 8, 11]], melodic_minor: [[0, 1, 2, 3, 4, 5, 6], [0, 2, 3, 5, 7, 9, 11]],
    pentascale_major: [[0, 1, 2, 3, 4], [0, 2, 4, 5, 7]], pentascale_minor: [[0, 1, 2, 3, 4], [0, 2, 3, 5, 7]],
    arpeggio_major: [[0, 2, 4], [0, 4, 7]], arpeggio_minor: [[0, 2, 4], [0, 3, 7]],
    arpeggio_dominant_seventh: [[0, 2, 4, 6], [0, 4, 7, 10]], arpeggio_diminished_seventh: [[0, 2, 4, 6], [0, 3, 6, 9]],
  };
  const spellOk = (notes, [steps, semis]) => notes.length === steps.length && notes.every((n, i) => {
    const li = (LETTERS.indexOf(notes[0][0]) + steps[i]) % 7;
    return n[0] === LETTERS[li] && pcOf(n) === (pcOf(notes[0]) + semis[i]) % 12;
  });
  bad = [];
  let spelledItems = 0;
  for (const b of [...D0.piano.technique, ...D1.piano.technique]) {
    for (const it of b.items) {
      const shape = SHAPES[it.kind];
      if (shape) {
        spelledItems++;
        if (!spellOk(it.notes, shape)) bad.push(`${b.stage} ${it.item}: ${it.notes.join(' ')}`);
        // melodic minor comes down as the natural minor: the descending notes, read upwards, must be one
        if (it.kind === 'melodic_minor' && !spellOk([it.notes[0], ...it.descending.slice(0, -1).reverse()], SHAPES.natural_minor)) bad.push(`${b.stage} ${it.item} descending: ${it.descending.join(' ')}`);
        if (Array.isArray(it.midi_ascending)) {
          const pcs = it.notes.map(pcOf);
          if (it.midi_ascending.some((m, i) => m % 12 !== pcs[i % pcs.length]) || it.midi_ascending.some((m, i) => i && m <= it.midi_ascending[i - 1])) bad.push(`${b.stage} ${it.item}: stored MIDI does not match its notes`);
        }
      }
      const run = SR.scaleRun(it);
      const names = SR.scaleNames(it, run);
      if (names.some((n, i) => !n || P.noteToMidi(n) !== run[i])) bad.push(`${b.stage} ${it.item}: shown names ${names.slice(0, 8).join(' ')} do not match the keys`);
      if (shape) {
        const top = run.indexOf(Math.max(...run));
        const want = new Set(it.notes);
        const wantDown = new Set(it.descending || it.notes);
        if (names.some((n, i) => !(i <= top ? want : wantDown).has(n.replace(/-?\d+$/, '')))) bad.push(`${b.stage} ${it.item}: a shown name is not one of the scale's notes`);
      }
      if (/chromatic/.test(it.kind)) {
        const top = run.indexOf(Math.max(...run));
        if (names.some((n, i) => i > 0 && i < run.length - 1 && i !== top && pcOf(n.replace(/-?\d+$/, '')) !== pcOf(it.tonic || 'C') && (i < top ? /b/.test(n.slice(1)) : /#/.test(n)))) bad.push(`${b.stage} ${it.item}: not sharps up and flats down`);
      }
    }
  }
  check(`spelling: all ${spelledItems} scales, five-finger patterns and arpeggios are spelled by theory (a letter per degree, the right intervals), their MIDI matches, and every shown name is the key played`, !bad.length && spelledItems >= 90, bad.slice(0, 6));
  const dhm = checks.takeParts({ build: 'scale', battery: 'PI4', item: 'D harmonic minor', hands: ['right'], tempo: 80, rule: {} }, rnd, 1)[0];
  check('...PI4 D harmonic minor shows B-flat and C-sharp (it showed A#4)', dhm && dhm.names.includes('Bb4') && dhm.names.includes('C#5') && !dhm.names.some((n) => /^A#/.test(n)), dhm && dhm.names);
  const fmm = SR.scaleNames({ item: 'F melodic minor', kind: 'melodic_minor', tonic: 'F', notes: ['F', 'G', 'Ab', 'Bb', 'C', 'D', 'E'], descending: ['Eb', 'Db', 'C', 'Bb', 'Ab', 'G', 'F'], octaves: 1, midi_ascending: [65, 67, 68, 70, 72, 74, 76, 77] });
  check('...F melodic minor goes up with D and E and comes down with E-flat and D-flat', fmm.join(' ') === 'F4 G4 Ab4 Bb4 C5 D5 E5 F5 Eb5 Db5 C5 Bb4 Ab4 G4 F4', fmm);
  const odd = SR.scaleNames({ item: 'G# harmonic minor', kind: 'harmonic_minor', tonic: 'G#', notes: ['G#', 'A#', 'B', 'C#', 'D#', 'E', 'F##'], octaves: 1, midi_ascending: [68, 70, 71, 73, 75, 76, 79, 80] });
  check('...G# harmonic minor reads F## (sounding G) in the octave of its letter, and Cb/B# octaves follow the letter', odd[6] === 'F##5' && P.noteToMidi(odd[6]) === 79 && SR.spelledName(59, 'Cb') === 'Cb4' && SR.spelledName(60, 'B#') === 'B#3', odd);

  // ── PI2 sight-reading end to end ──
  at(Date.UTC(2026, 9, 5, 9));
  const p2 = learner('piano', 'piano_first_reader', 'final');
  const b2 = `/api/skills/checks/${p2.enrollment.id}`;
  r = await app.post(`${b2}/PI2:sight_reading_level/start`, {}, p2.user.id);
  const sp = r.json.sitting;
  check('PI2 sight-reading: two new SR2 pieces open, each with its notation to draw', r.status === 201 && sp.parts.length === 2 && sp.parts.every((p) => p.score && p.score.level === 'SR2' && p.level === 'SR2' && p.target.length), sp && sp.parts.map((p) => p.label));
  let o = openOf(p2.user.id, 'PI2:sight_reading_level');
  r = await app.post(`${b2}/PI2:sight_reading_level/take`, { part: 0, played: perform(o.parts[0]) }, p2.user.id);
  check('...a MIDI take with every note on its beat passes (notes and beat scored separately)', r.json.pass && r.json.notes === 1 && r.json.on_beat === 1, r.json);
  r = await app.post(`${b2}/PI2:sight_reading_level/take`, { part: 1, played: perform(o.parts[1], { wrongEvery: 3 }) }, p2.user.id);
  check('...a take with a third of the notes wrong is below the bar', !r.json.pass && r.json.notes < 0.8, r.json);
  r = await app.post(`${b2}/PI2:sight_reading_level/finish`, {}, p2.user.id);
  check('...the sitting fails, counts cold, and records the level', r.json.result.pass === false && r.json.result.counted && r.json.result.detail && r.json.result.detail.level === 'SR2', r.json.result);
  at(Date.UTC(2026, 9, 6, 9));
  await app.post(`${b2}/PI2:sight_reading_level/start`, {}, p2.user.id);
  o = openOf(p2.user.id, 'PI2:sight_reading_level');
  check('...the next sitting has new pieces', JSON.stringify(o.parts.map((p) => p.target)) !== JSON.stringify(sp.parts.map((p) => p.target)));
  r = await app.post(`${b2}/PI2:sight_reading_level/take`, { part: 0, played: perform(o.parts[0], { jitter: 260 }) }, p2.user.id);
  check('...right notes far off the beat fail on rhythm', !r.json.pass && r.json.notes === 1 && r.json.on_beat < 0.8, r.json);
  await app.post(`${b2}/PI2:sight_reading_level/take`, { part: 1, played: perform(o.parts[1]) }, p2.user.id);
  await app.post(`${b2}/PI2:sight_reading_level/finish`, {}, p2.user.id);
  at(Date.UTC(2026, 9, 7, 9));
  await app.post(`${b2}/PI2:sight_reading_level/start`, {}, p2.user.id);
  o = openOf(p2.user.id, 'PI2:sight_reading_level');
  for (const k of [0, 1]) await app.post(`${b2}/PI2:sight_reading_level/take`, { part: k, played: perform(o.parts[k], { source: 'mic' }) }, p2.user.id);
  r = await app.post(`${b2}/PI2:sight_reading_level/finish`, {}, p2.user.id);
  check('...a microphone sitting without second takes passes but does not count (an estimate, unconfirmed)', r.json.result.pass && r.json.result.source === 'mic' && !r.json.result.counted, r.json.result);

  // Never seen before by this learner: 40 sittings at SR2, every excerpt new to them.
  const pn = learner('piano', 'piano_first_reader', 'final');
  const hashes = [];
  for (let k = 0; k < 40; k++) {
    at(Date.UTC(2026, 9, 8, 0) + k * 3600 * 1000);
    await app.post(`/api/skills/checks/${pn.enrollment.id}/PI2:sight_reading_level/start`, {}, pn.user.id);
    const op = openOf(pn.user.id, 'PI2:sight_reading_level');
    hashes.push(...op.parts.map((x) => x.excerpt));
    db.update('skill_records', rowOf(pn.user.id, 'PI2:sight_reading_level').id, { open: null });
  }
  check('...one learner, 40 sittings, 80 excerpts: never the same one twice (the record keeps what they have had)', new Set(hashes).size === 80 && rowOf(pn.user.id, 'PI2:sight_reading_level').seen_excerpts.length === 80, new Set(hashes).size);

  // ── PI2, PI3, PI4: every metric sat through the API on two cold days; the gate holds, then releases ──
  async function sitAll(L, stageMetrics, day) {
    const base = `/api/skills/checks/${L.enrollment.id}`;
    const out = {};
    for (const id of stageMetrics) {
      const st = await app.post(`${base}/${id}/start`, {}, L.user.id);
      if (st.status >= 400) { out[id] = `start ${st.status} ${st.json.error}`; continue; }
      const op = openOf(L.user.id, id);
      if (op.how === 'items') {
        for (let i = 0; i < op.items.length; i++) {
          const it = op.items[i];
          const a = rightAnswer(it) || (it.key.type === 'pc' ? { midi: 60 + it.key.pc } : it.key.type === 'midi' ? { midi: it.key.midi } : it.key.type === 'echo' ? { tries: [it.key.notes] } : null);
          await app.post(`${base}/${id}/answer`, { index: i, answer: a, source: it.kind === 'chord_ear' ? 'tap' : 'midi' }, L.user.id);
        }
      } else {
        for (let k = 0; k < op.parts.length; k++) {
          const part = op.parts[k];
          const played = part.target_chords ? chordsPlayed(part) : perform(part);
          await app.post(`${base}/${id}/take`, { part: k, played }, L.user.id);
        }
      }
      const fin = await app.post(`${base}/${id}/finish`, {}, L.user.id);
      out[id] = fin.json.result ? `${fin.json.result.pass ? 'pass' : 'FAIL'}${fin.json.result.counted ? '' : ' (not counted)'}` : `finish ${fin.status} ${fin.json.error}`;
    }
    return out;
  }
  // The live defaults: the gate on, per fully wired stage, with the code's default shadow list.
  process.env.SKILL_STAGE_GATE = 'on';
  delete process.env.SKILL_STAGE_GATE_SHADOW;
  for (const [stageId, grade] of [['PI2', 'piano_first_reader'], ['PI3', 'piano_elementary_1'], ['PI4', 'piano_elementary_2']]) {
    at(Date.UTC(2026, 9, 10, 9));
    const L = learner('piano', grade, 'final');
    const stage = require('../services/skill-record').stageFor('piano', grade);
    const ids = stage.metrics.filter((m) => m.source.provable).map((m) => m.id);
    let res = mastery.clearCheckpoint(db.byId('enrollments', L.enrollment.id), L.grade, 'graduation');
    check(`${stageId}: fully wired and not in the shadow list, so the gate holds the Final (mode on)`, res.graduated === false && res.skill_held === true && res.skill && res.skill.mode === 'on' && res.skill.fully_wired, res.skill || res);
    const day1 = await sitAll(L, ids, 1);
    at(Date.UTC(2026, 9, 11, 9));
    const day2 = await sitAll(L, ids, 2);
    const allPass = (d) => Object.values(d).every((v) => v === 'pass');
    check(`${stageId}: every one of its ${ids.length} metrics sat through the API with right answers or MIDI passes, cold, on two days`, allPass(day1) && allPass(day2), { day1, day2 });
    r = await app.get(`/api/skills/left/${L.enrollment.id}`, L.user.id);
    check(`${stageId}: ...the stage is then complete, every proof re-derived from its sittings`, r.json.left && r.json.left.complete && r.json.left.proven === ids.length && r.json.proofs.every((p) => p.holds && p.holds.ok), r.json.left && { missing: r.json.left.missing.map((m) => m.id), unkept: r.json.left.unkept.map((m) => m.id) });
    r = await app.post(`/api/skills/left/${L.enrollment.id}/graduate`, {}, L.user.id);
    check(`${stageId}: ...and graduating goes through`, r.status === 200 && r.json.graduated === true, r.json);
  }

  // ── PI5-7 ──
  at(Date.UTC(2026, 10, 1, 9));
  const p7 = learner('piano', 'piano_upper_intermediate', 'final');
  const b7 = `/api/skills/checks/${p7.enrollment.id}`;
  r = await app.post(`${b7}/PI5-7:sight_reading_level/start`, {}, p7.user.id);
  check('PI5-7 sight-reading: at the upper-intermediate grade the pieces are level 7, hands together', r.json.sitting.parts.every((p) => p.level === 'SR7' && p.hands === 'both'), r.json.sitting.parts.map((p) => p.level));
  const p5 = learner('piano', 'piano_lower_intermediate', 'final');
  r = await app.post(`/api/skills/checks/${p5.enrollment.id}/PI5-7:sight_reading_level/start`, {}, p5.user.id);
  check('...at the lower-intermediate grade they are level 5', r.json.sitting.parts.every((p) => p.level === 'SR5'), r.json.sitting.parts.map((p) => p.level));
  r = await app.post(`${b7}/PI5-7:technique/start`, {}, p7.user.id);
  o = openOf(p7.user.id, 'PI5-7:technique');
  const pi7Items = D1.piano.technique.find((b) => b.stage === 'PI7').items.map((i) => i.item);
  check('PI5-7 technique: two of the grade\'s PI7 requirements, hands together, at 120', o.parts.length === 2 && o.parts.every((p) => p.hands === 'both' && p.tempo === 120 && pi7Items.some((n) => p.label.startsWith(n))), o.parts.map((p) => p.label));
  r = await app.post(`${b7}/PI5-7:technique/take`, { part: 0, played: perform(o.parts[0]) }, p7.user.id);
  check('...even, right and on the beat passes (CV 0)', r.json.pass && r.json.cv === 0, r.json);
  const uneven = perform(o.parts[1]).map((n, i) => ({ ...n, time: n.time + ((Math.floor(i / 2) % 3) - 1) * 45 }));
  r = await app.post(`${b7}/PI5-7:technique/take`, { part: 1, played: uneven }, p7.user.id);
  check('...uneven spacing (CV over 0.09) fails although every note is right', !r.json.pass && r.json.notes === 1 && r.json.cv > 0.09, r.json);
  await app.post(`${b7}/PI5-7:technique/finish`, {}, p7.user.id);

  r = await app.post(`${b7}/PI5-7:repertoire/start`, {}, p7.user.id);
  const rep = r.json.sitting.parts;
  o = openOf(p7.user.id, 'PI5-7:repertoire');
  check('PI5-7 repertoire: the stage\'s 3 library pieces, then 3 restarts of one from memory at random bars', rep.length === 6 && rep.slice(0, 3).every((p) => !p.memory && p.target) && rep.slice(3).every((p) => p.memory && /from memory: start at bar \d+/.test(p.label)), rep.map((p) => p.label));
  check('...a memory part sends no notes, names or piece to the page', rep.slice(3).every((p) => p.target === null && p.names === null && p.song === null) && o.parts.slice(3).every((p) => p.target.length >= 4));
  for (let k = 0; k < o.parts.length; k++) await app.post(`${b7}/PI5-7:repertoire/take`, { part: k, played: perform(o.parts[k]) }, p7.user.id);
  r = await app.post(`${b7}/PI5-7:repertoire/finish`, {}, p7.user.id);
  check('...every part right and on the beat passes, cold', r.json.result.pass && r.json.result.counted, r.json.result);

  r = await app.post(`${b7}/PI5-7:dynamics_midi/start`, {}, p7.user.id);
  o = openOf(p7.user.id, 'PI5-7:dynamics_midi');
  const dynPart = o.parts[0];
  check('PI5-7 dynamics: a new 8-bar passage marked p and f in turn', r.json.sitting.parts[0].score.bars.length === 8 && dynPart.target.some((t) => t.dynamic === 'p') && dynPart.target.some((t) => t.dynamic === 'f'), r.json.sitting.parts[0].label);
  r = await app.post(`${b7}/PI5-7:dynamics_midi/take`, { part: 0, played: perform(dynPart, { velocity: (t) => (t.dynamic === 'f' ? 92 : 48) }) }, p7.user.id);
  check('...f 44 louder than p on MIDI passes', r.json.pass && r.json.dynamics === 44, r.json);
  await app.post(`${b7}/PI5-7:dynamics_midi/finish`, {}, p7.user.id);
  at(Date.UTC(2026, 10, 2, 9));
  await app.post(`${b7}/PI5-7:dynamics_midi/start`, {}, p7.user.id);
  o = openOf(p7.user.id, 'PI5-7:dynamics_midi');
  r = await app.post(`${b7}/PI5-7:dynamics_midi/take`, { part: 0, played: perform(o.parts[0], { velocity: (t) => (t.dynamic === 'f' ? 70 : 62) }) }, p7.user.id);
  check('...f only 8 louder fails', !r.json.pass && r.json.dynamics === 8, r.json);
  r = await app.post(`${b7}/PI5-7:dynamics_midi/take`, { part: 0, played: perform(o.parts[0], { source: 'screen' }) }, p7.user.id);
  check('...the on-screen keys cannot show loudness: below the bar, with the reason', !r.json.pass && /MIDI/.test(r.json.note || ''), r.json);
  await app.post(`${b7}/PI5-7:dynamics_midi/finish`, {}, p7.user.id);

  // ── PI8-10 ──
  at(Date.UTC(2026, 10, 5, 9));
  const p10 = learner('piano', 'piano_pre_professional', 'final');
  const b10 = `/api/skills/checks/${p10.enrollment.id}`;
  r = await app.post(`${b10}/PI8-10:technique/start`, {}, p10.user.id);
  o = openOf(p10.user.id, 'PI8-10:technique');
  check('PI8-10 technique: requirements from the PI8 and PI10 batteries at 160, kept on the keyboard', o.parts.length === 2 && o.parts.every((p) => p.tempo === 160 && Math.max(...p.target.map((t) => t.midi)) <= 96), o.parts.map((p) => p.label));
  for (const k of [0, 1]) await app.post(`${b10}/PI8-10:technique/take`, { part: k, played: perform(o.parts[k], { jitter: 8 }) }, p10.user.id);
  r = await app.post(`${b10}/PI8-10:technique/finish`, {}, p10.user.id);
  check('...tight, even MIDI playing (CV about 0.04) passes the 0.06 cut', r.json.result.pass && r.json.result.counted, r.json.result);

  r = await app.post(`${b10}/PI8-10:pedal_midi/start`, {}, p10.user.id);
  o = openOf(p10.user.id, 'PI8-10:pedal_midi');
  const pp = o.parts[0];
  check('PI8-10 pedalling: 8 chords to play with the pedal, drawn with pedal marks', r.json.sitting.parts[0].pedal && r.json.sitting.parts[0].score.pedal && pp.target_chords.length === 8);
  const played8 = chordsPlayed(pp, 'midi', 2000);
  const onsets = pp.target_chords.map((_, i) => 1000 + i * 2000);
  const legato = [{ time: 1200, down: true }];
  onsets.slice(1).forEach((t) => { legato.push({ time: t + 60, down: false }); legato.push({ time: t + 260, down: true }); });
  r = await app.post(`${b10}/PI8-10:pedal_midi/take`, { part: 0, played: played8, pedal: legato }, p10.user.id);
  check('...the pedal up 60 ms after each new chord and down again 200 ms later: every change clean, pass', r.json.pass && r.json.pedal === 1 && r.json.chords_right === 8, r.json);
  const late = [{ time: 1200, down: true }];
  onsets.slice(1).forEach((t, i) => { const lift = i % 3 === 0 ? 400 : 60; late.push({ time: t + lift, down: false }); late.push({ time: t + lift + 200, down: true }); });
  r = await app.post(`${b10}/PI8-10:pedal_midi/take`, { part: 0, played: played8, pedal: late }, p10.user.id);
  check('...lifting 0.4 s late at a third of the changes blurs them: below 90%, fails', !r.json.pass && r.json.pedal < 0.9 && r.json.blurred >= 2, r.json);
  r = await app.post(`${b10}/PI8-10:pedal_midi/take`, { part: 0, played: played8 }, p10.user.id);
  check('...no pedal at all fails', !r.json.pass, r.json);
  r = await app.post(`${b10}/PI8-10:pedal_midi/take`, { part: 0, played: played8, pedal: [{ time: 'x', down: 1 }] }, p10.user.id);
  check('...unreadable pedal moves are refused', r.status === 400, r.json);
  await app.post(`${b10}/PI8-10:pedal_midi/finish`, {}, p10.user.id);

  r = await app.post(`${b10}/PI8-10:independent_learning/start`, {}, p10.user.id);
  check('PI8-10 a piece learned alone: the first start hands out a new 16-bar piece to learn, and opens no sitting', r.status === 201 && r.json.learning && r.json.learning.score.bars.length === 16 && !openOf(p10.user.id, 'PI8-10:independent_learning'), r.json);
  const due = Date.parse(r.json.learning.due_at) - Date.UTC(2026, 10, 5, 9);
  check('...due in 14 days', due === 14 * DAY, r.json.learning.due_at);
  r = await app.get(b10, p10.user.id);
  const learnRow = r.json.checks.checks.find((c) => c.id === 'PI8-10:independent_learning');
  check('...the check page shows the piece to see again without opening a sitting', learnRow.learn && learnRow.learn.piece && learnRow.learn.piece.score.bars.length === 16);
  const pieceTarget = JSON.stringify(rowOf(p10.user.id, 'PI8-10:independent_learning').assignment.piece.target);
  at(Date.UTC(2026, 10, 12, 9));
  r = await app.post(`${b10}/PI8-10:independent_learning/start`, {}, p10.user.id);
  o = openOf(p10.user.id, 'PI8-10:independent_learning');
  check('...a week later the sitting opens on the same piece', r.json.sitting && JSON.stringify(o.parts[0].target) === pieceTarget, r.json);
  await app.post(`${b10}/PI8-10:independent_learning/take`, { part: 0, played: perform(o.parts[0]) }, p10.user.id);
  r = await app.post(`${b10}/PI8-10:independent_learning/finish`, {}, p10.user.id);
  check('...played right, cold: it passes and counts', r.json.result.pass && r.json.result.counted, r.json.result);
  at(Date.UTC(2026, 10, 20, 9));
  r = await app.post(`${b10}/PI8-10:independent_learning/start`, {}, p10.user.id);
  check('...after 14 days the next start hands out a new piece', r.json.learning && JSON.stringify(rowOf(p10.user.id, 'PI8-10:independent_learning').assignment.piece.target) !== pieceTarget);

  // ── decision scenes ──
  bad = [];
  const dist = {};
  let scenes = 0;
  for (const kind of Object.keys(SCENES.CHOICES)) {
    for (const answer of SCENES.CHOICES[kind]) {
      for (let i = 0; i < 60; i++) {
        const it = SCENES.scene(kind, answer, rnd);
        if (!it) { bad.push(`${kind}/${answer}: none drawn`); continue; }
        scenes++;
        const why = COURT.validate(it.frames);
        if (why) bad.push(`${kind}: ${why}`);
        if (SCENES.read(SCENES.fromItem(it)) !== answer) bad.push(`${kind}/${answer}: the positions read ${SCENES.read(SCENES.fromItem(it))}`);
        if (!it.choices.includes(answer)) bad.push(`${kind}: answer not offered`);
        dist[`${kind}:${answer}`] = (dist[`${kind}:${answer}`] || 0) + 1;
      }
    }
  }
  check(`decision scenes: ${scenes} drawn plays (9 kinds, 34 reads); every one is a valid court play whose right read is re-derived from the players' positions alone`, !bad.length && scenes === 34 * 60, bad.slice(0, 6));

  at(Date.UTC(2026, 11, 1, 9));
  const bb1 = learner('basketball', 'basketball_mini_starter', 'final');
  const bbb = `/api/skills/checks/${bb1.enrollment.id}`;
  r = await app.post(`${bbb}/BB1:decisions_2v1/start`, {}, bb1.user.id);
  const its = r.json.sitting.items;
  check('BB1 2v1: 10 scenes, two frames each, pass/shoot/dribble, no key sent to the page', its.length === 10 && its.every((x) => x.kind === 'scene' && x.frames.length === 2 && x.choices.length === 3 && !('key' in x)) && !JSON.stringify(r.json).includes('"why"'), its[0]);
  o = openOf(bb1.user.id, 'BB1:decisions_2v1');
  const answers = o.items.map((x) => x.key.answer);
  check('...every read appears (the answers are spread over the options)', ['Pass', 'Shoot', 'Dribble'].every((a) => answers.includes(a)), answers);
  for (let i = 0; i < 10; i++) await app.post(`${bbb}/BB1:decisions_2v1/answer`, { index: i, answer: i < 3 ? o.items[i].choices.find((c) => c !== o.items[i].key.answer) : o.items[i].key.answer, source: 'screen', ms: 1500 + i * 100 }, bb1.user.id);
  r = await app.post(`${bbb}/BB1:decisions_2v1/finish`, {}, bb1.user.id);
  check('...7 of 10 is below the bar of 8, counted cold; the review explains the misses', !r.json.result.pass && r.json.result.right === 7 && r.json.result.counted && r.json.result.review.filter((x) => !x.correct).every((x) => /: /.test(x.answer)), r.json.result);
  at(Date.UTC(2026, 11, 2, 9));
  await app.post(`${bbb}/BB1:decisions_2v1/start`, {}, bb1.user.id);
  o = openOf(bb1.user.id, 'BB1:decisions_2v1');
  for (let i = 0; i < 10; i++) await app.post(`${bbb}/BB1:decisions_2v1/answer`, { index: i, answer: o.items[i].key.answer, source: 'screen' }, bb1.user.id);
  r = await app.post(`${bbb}/BB1:decisions_2v1/finish`, {}, bb1.user.id);
  check('...10 of 10 passes and counts', r.json.result.pass && r.json.result.counted, r.json.result);
  const bbRow = db.findOne('skill_records', (x) => x.user_id === bb1.user.id && x.metric_id === 'BB1:decisions_2v1');
  check('scene sittings keep each item\'s mark for the split-half (P5): 7 then 10 right', JSON.stringify(bbRow.sittings.map((s) => s.detail && s.detail.marks && s.detail.marks.reduce((a, b) => a + b, 0))) === '[7,10]' && bbRow.sittings[0].detail.marks.length === 10, bbRow.sittings.map((s) => s.detail));

  const bb3 = learner('basketball', 'basketball_junior_club_player', 'final');
  r = await app.post(`/api/skills/checks/${bb3.enrollment.id}/BB3:decision_clips/start`, {}, bb3.user.id);
  o = openOf(bb3.user.id, 'BB3:decision_clips');
  const firsts = o.items.slice(0, 9).map((x) => JSON.stringify(x.frames));
  const seconds = o.items.slice(9).map((x) => JSON.stringify(x.frames));
  check('BB3: 18 four-against-four plays, 9 scenes each shown twice in two random blocks', o.items.length === 18 && new Set(firsts).size === 9 && firsts.every((f) => seconds.includes(f)), o.items.length);
  for (let i = 0; i < 18; i++) await app.post(`/api/skills/checks/${bb3.enrollment.id}/BB3:decision_clips/answer`, { index: i, answer: o.items[i].key.answer, source: 'screen', ms: 1000 + 100 * i }, bb3.user.id);
  r = await app.post(`/api/skills/checks/${bb3.enrollment.id}/BB3:decision_clips/finish`, {}, bb3.user.id);
  check('...all right passes, and the median answer time is recorded', r.json.result.pass && r.json.result.detail && r.json.result.detail.median_ms === 1800, r.json.result);
  for (const [grade, metric, n, kinds] of [['basketball_mini_player', 'BB2:decision_clips', 15, ['3v3_ball', '3v3_off']], ['basketball_youth_advanced', 'BB4-5:decision_clips', 24, ['ball_screen', 'kick', 'transition']], ['basketball_elite_junior', 'BB6-7:decision_clips', 30, ['transition', 'zone', 'late_clock']]]) {
    const L = learner('basketball', grade, 'final');
    r = await app.post(`/api/skills/checks/${L.enrollment.id}/${metric}/start`, {}, L.user.id);
    o = openOf(L.user.id, metric);
    const ks = [...new Set(o.items.map((x) => x.scene))].sort();
    check(`${metric}: ${n} scenes of ${kinds.join(', ')}`, o.items.length === n && ks.join() === kinds.slice().sort().join(), { n: o.items.length, ks });
  }

  // ── applied tasks ──
  const bb8 = learner('basketball', 'basketball_all_star_and_olympic', 'final');
  const b8 = `/api/skills/checks/${bb8.enrollment.id}`;
  r = await app.post(`${b8}/BB8-12:applied_tasks/start`, {}, bb8.user.id);
  o = openOf(bb8.user.id, 'BB8-12:applied_tasks');
  const nums = o.items.filter((x) => x.key.type === 'number');
  check('BB8-12 applied tasks: 10 tasks, 8 computed box-score items with a numeric key', o.items.length === 10 && nums.length === 8, o.items.map((x) => x.key.type));
  const gi = checks.gradeItem;
  const n0 = nums[0];
  check('...a number is right as typed, with a % sign or a comma; one decimal off is wrong', gi(n0, String(n0.key.value)).correct && gi(n0, `${n0.key.value}%`).correct && gi(n0, String(n0.key.value).replace('.', ',')).correct && !gi(n0, String(n0.key.value + 0.1)).correct && !gi(n0, '').correct);
  for (let i = 0; i < 10; i++) await app.post(`${b8}/BB8-12:applied_tasks/answer`, { index: i, answer: rightAnswer(o.items[i]), source: 'screen' }, bb8.user.id);
  r = await app.post(`${b8}/BB8-12:applied_tasks/finish`, {}, bb8.user.id);
  check('...all right passes and counts', r.json.result.pass && r.json.result.counted && r.json.result.right === 10, r.json.result);

  // ── counts by zone, free throws ──
  const bb45 = learner('basketball', 'basketball_youth_advanced', 'final');
  const b45 = `/api/skills/checks/${bb45.enrollment.id}`;
  r = await app.get(b45, bb45.user.id);
  const zoneRow = r.json.checks.checks.find((c) => c.id === 'BB4-5:spot_shooting_by_zone');
  check('BB4-5 spot shooting: 10 fields (made and tried at 5 spots) and a mid-range / 3-point choice, camera allowed', zoneRow.fields.length === 10 && zoneRow.choice && zoneRow.choice.options.length === 2 && zoneRow.camera_ok, zoneRow);
  const zones = (m, a, extra = {}) => ({ lc_makes: m, lc_attempts: a, lw_makes: m, lw_attempts: a, top_makes: m, top_attempts: a, rw_makes: m, rw_attempts: a, rc_makes: m, rc_attempts: a, ...extra });
  at(Date.UTC(2026, 11, 5, 9));
  r = await app.post(`${b45}/BB4-5:spot_shooting_by_zone/count`, { ...zones(14, 20), range: 'mid' }, bb45.user.id);
  check('...14 of 20 in every zone, mid-range (mark 45%): passes, with each zone\'s estimate and range', r.json.result.pass && r.json.result.counted && r.json.result.zones.length === 5 && r.json.result.zones.every((z) => z.lo < z.rate && z.rate < z.hi), r.json.result);
  at(Date.UTC(2026, 11, 6, 9));
  r = await app.post(`${b45}/BB4-5:spot_shooting_by_zone/count`, { ...zones(9, 20), range: 'three' }, bb45.user.id);
  check('...9 of 20 from three is enough for the 3-point mark (33%)', r.json.result.pass, r.json.result);
  r = await app.post(`${b45}/BB4-5:spot_shooting_by_zone/count`, { ...zones(9, 20), range: 'mid' }, bb45.user.id);
  check('...but not for the mid-range mark (45%)', !r.json.result.pass, r.json.result);
  at(Date.UTC(2026, 11, 7, 9));
  r = await app.post(`${b45}/BB4-5:spot_shooting_by_zone/count`, { ...zones(14, 20), lc_attempts: 12, lc_makes: 12, range: 'mid' }, bb45.user.id);
  check('...one zone under 17 shots cannot pass, and says why', !r.json.result.pass && /17/.test(r.json.result.note), r.json.result);
  r = await app.post(`${b45}/BB4-5:spot_shooting_by_zone/count`, { ...zones(21, 20), range: 'mid' }, bb45.user.id);
  check('...more makes than shots are refused', r.status === 400);
  at(Date.UTC(2026, 11, 8, 9));
  r = await app.post(`${b45}/BB4-5:spot_shooting_by_zone/count`, { ...zones(15, 20), range: 'mid', source: 'camera', confirmed: false }, bb45.user.id);
  check('...a camera count not confirmed passes the bar but does not count', r.json.result.pass && !r.json.result.counted && r.json.result.source === 'camera', r.json.result);
  r = await app.post(`${b45}/BB4-5:free_throws/count`, { makes: 30, attempts: 40 }, bb45.user.id);
  check('BB4-5 free throws: 30 of 40 is under the 50 a sitting needs', !r.json.result.pass && /50/.test(r.json.result.note), r.json.result);
  r = await app.post(`${b45}/BB4-5:free_throws/count`, { makes: 41, attempts: 55 }, bb45.user.id);
  check('...41 of 55 (75%) passes at 65% with 80% confidence', r.json.result.pass, r.json.result);
  const bb67 = learner('basketball', 'basketball_elite_junior', 'final');
  r = await app.post(`/api/skills/checks/${bb67.enrollment.id}/BB6-7:shooting_profile/count`, { lc_makes: 15, lc_attempts: 25, lw_makes: 15, lw_attempts: 25, top_makes: 15, top_attempts: 25, rw_makes: 15, rw_attempts: 25, rc_makes: 15, rc_attempts: 25, range: 'mid' }, bb67.user.id);
  check('BB6-7 shooting profile: 15 of 25 per zone (60%) passes the varsity mid-range mark of 50%', r.json.result.pass && r.json.result.zones.every((z) => z.attempts === 25), r.json.result);
  check('the Beta interval helper is right (Beta(16, 11): 10th and 90th percentiles about 0.47 and 0.71)', Math.abs(PB.betaQuantile(16, 11, 0.1) - 0.4697) < 0.01 && Math.abs(PB.betaQuantile(16, 11, 0.9) - 0.7114) < 0.01, [PB.betaQuantile(16, 11, 0.1), PB.betaQuantile(16, 11, 0.9)]);

  // ── the gate: which stages hold ──
  delete process.env.SKILL_STAGE_GATE_SHADOW;
  process.env.SKILL_STAGE_GATE = 'on';
  const modes = {};
  for (const [track, stage, grade] of STAGES) {
    const L = learner(track, grade, 'final');
    const left = gate.left(L.user.id, db.byId('enrollments', L.enrollment.id));
    modes[stage] = `${left.mode}${left.fully_wired ? '' : ' (not wired)'}`;
  }
  check('gate (default shadow list): PI2, PI3 and PI4 hold; PI5-7, PI8-10 and BB1-BB12 are fully wired but stay in shadow', ['PI2', 'PI3', 'PI4'].every((s) => modes[s] === 'on') && ['PI5-7', 'PI8-10', 'BB1', 'BB2', 'BB3', 'BB4-5', 'BB6-7', 'BB8-12'].every((s) => modes[s] === 'shadow'), modes);
  // P5: the scene-reliability hold is computed from sittings, not hand-kept.
  const REL = require('../services/skill-scene-reliability');
  check('P5: with SCENE_RELIABILITY_GATE on, BB1-BB3 leave the hand list (BB4-5 and BB6-7 stay for their [R] zone marks)', gate.defaultShadow() === gate.COMPUTED_SHADOW && !/BB1|BB2|BB3/.test(gate.COMPUTED_SHADOW) && /BB4-5/.test(gate.COMPUTED_SHADOW));
  check('P5: the decision-scene sets are found by stage: BB1, BB2, BB3, BB4-5, BB6-7', Object.keys(REL.sceneMetrics()).sort().join() === 'BB1,BB2,BB3,BB4-5,BB6-7', REL.sceneMetrics());
  // Spearman-Brown on a known case: halves correlating 0.6 give 0.75 for the full length.
  check('P5: Spearman-Brown steps a half correlation of 0.6 up to 0.75, and 2/3 up to 0.8', Math.abs(REL.spearmanBrown(0.6) - 0.75) < 1e-9 && Math.abs(REL.spearmanBrown(2 / 3) - 0.8) < 1e-9);
  const consistent = Array.from({ length: 120 }, (_, i) => { const p = (i % 11) / 10; return Array.from({ length: 10 }, (_, k) => (k / 10 < p ? 1 : 0)); });
  const coin = (() => { let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; return Array.from({ length: 120 }, () => Array.from({ length: 10 }, () => (rnd() < 0.6 ? 1 : 0))); })();
  const sh1 = REL.splitHalf(consistent);
  const sh2 = REL.splitHalf(coin);
  check(`P5: a set that ranks learners consistently is reliable (${sh1.reliability}); one answered by coin flips is not (${sh2.reliability})`, sh1.reliability >= 0.8 && (sh2.reliability === null || sh2.reliability < 0.5), { sh1, sh2 });
  process.env.SKILL_STAGE_GATE_SHADOW = '';
  REL.clearCache();
  const cleared = learner('basketball', 'basketball_mini_starter', 'final');
  const clearedLeft = gate.left(cleared.user.id, db.byId('enrollments', cleared.enrollment.id));
  check('...SKILL_STAGE_GATE_SHADOW= (empty) clears the list, but BB1 stays in shadow: its scene set has no measured reliability yet (1 learner, not 100)', clearedLeft.mode === 'shadow' && clearedLeft.scene_reliability && !clearedLeft.scene_reliability[0].reliable, clearedLeft.scene_reliability);
  // 100+ learners whose sittings show a reliable set: BB1 then holds by itself.
  consistent.forEach((marks, i) => db.insert('skill_records', { user_id: 900000 + i, subject: 'basketball', metric_id: 'BB1:decisions_2v1', sittings: [{ at: Date.now(), detail: { marks } }] }));
  REL.clearCache();
  const relLeft = gate.left(cleared.user.id, db.byId('enrollments', cleared.enrollment.id));
  check('...with 120 learners at split-half >= 0.8, BB1 leaves shadow and holds (mode on)', relLeft.mode === 'on' && relLeft.scene_reliability[0].reliable && relLeft.scene_reliability[0].learners >= 100, relLeft.scene_reliability);
  process.env.SCENE_RELIABILITY_GATE = 'off';
  check('...SCENE_RELIABILITY_GATE=off goes back to the hand list (BB1-BB3 in it)', gate.defaultShadow() === gate.HAND_SHADOW && gate.left(cleared.user.id, db.byId('enrollments', cleared.enrollment.id)).mode === 'on');
  delete process.env.SCENE_RELIABILITY_GATE;
  db.remove('skill_records', (x) => x.user_id >= 900000 && x.user_id < 900200);
  REL.clearCache();
  process.env.SKILL_STAGE_GATE_SHADOW = 'PI2';
  const forced = learner('piano', 'piano_first_reader', 'final');
  check('...SKILL_STAGE_GATE_SHADOW=PI2 puts PI2 back in shadow', gate.left(forced.user.id, db.byId('enrollments', forced.enrollment.id)).mode === 'shadow');
  process.env.SKILL_PIANO_BB_SITTINGS = 'off';
  delete process.env.SKILL_STAGE_GATE_SHADOW;
  const offL = learner('piano', 'piano_first_reader', 'final');
  check('...with SKILL_PIANO_BB_SITTINGS=off, PI2 is not fully wired and goes back to shadow by itself', gate.left(offL.user.id, db.byId('enrollments', offL.enrollment.id)).mode === 'shadow');
  process.env.SKILL_PIANO_BB_SITTINGS = 'on';

  // ── practice sets use the same parts ──
  process.env.SKILL_DOSE = 'on';
  const pr = learner('piano', 'piano_first_reader', 'final');
  r = await app.post(`/api/skills/practice/${pr.enrollment.id}/PI2:sight_reading_level/start`, {}, pr.user.id);
  check('practice: a warm sight-reading set is one new piece with its notation', r.json.set && r.json.set.parts.length === 1 && r.json.set.parts[0].score, r.json);
  const pp10 = learner('piano', 'piano_pre_professional', 'final');
  r = await app.post(`/api/skills/practice/${pp10.enrollment.id}/PI8-10:pedal_midi/start`, {}, pp10.user.id);
  const setRow = db.findOne('skill_records', (x) => x.user_id === pp10.user.id && x.metric_id === 'PI8-10:pedal_midi');
  const setPart = setRow && setRow.practice_open ? setRow.practice_open.parts[0] : null;
  if (setPart) {
    const leg = [{ time: 1200, down: true }];
    setPart.target_chords.slice(1).forEach((_, i) => { const t = 1000 + (i + 1) * 2000; leg.push({ time: t + 60, down: false }); leg.push({ time: t + 260, down: true }); });
    r = await app.post(`/api/skills/practice/${pp10.enrollment.id}/PI8-10:pedal_midi/take`, { part: 0, played: chordsPlayed(setPart, 'midi', 2000), pedal: leg }, pp10.user.id);
  }
  check('practice: a warm pedalling set gets the pedal moves too, and is marked by the same bar', setPart && r.json.pass === true && r.json.pedal === 1, r.json);

  // ── P2/P3: the tempo ladder, the hotspot loop and bandwidth feedback on warm piano takes ──
  const lad = learner('piano', 'piano_first_reader', 'final');
  const lbase = `/api/skills/practice/${lad.enrollment.id}/PI2:pieces`;
  const openPart = () => db.findOne('skill_records', (x) => x.user_id === lad.user.id && x.metric_id === 'PI2:pieces').practice_open.parts[0];
  const ladRow = () => db.findOne('skill_records', (x) => x.user_id === lad.user.id && x.metric_id === 'PI2:pieces');
  r = await app.post(`${lbase}/start`, {}, lad.user.id);
  let lp = openPart();
  check('P3: a warm piece starts at 65% of its tempo, and says so', lp.ladder_pct === 0.65 && lp.tempo === Math.max(30, Math.round(lp.target_tempo * 0.65)) && /65% speed/.test(r.json.set.parts[0].label) && r.json.set.parts[0].tempo === lp.tempo, { lp, page: r.json.set.parts[0] });
  r = await app.post(`${lbase}/take`, { part: 0, played: perform(lp) }, lad.user.id);
  check('P2: the first takes get the full result', r.json.pass && r.json.feedback === 'full' && r.json.tempo && r.json.tempo.pct === 0.65, r.json);
  // The take and the set summary say the same thing (bug fix 2026-10-25: a take at 68 of 104 bpm said
  // "At the bar", then the set said "That set was below the bar").
  const takeLine = r.json.verdict;
  check('a clean take below the target tempo says "Clean at N bpm (target M)", not "At the bar"', takeLine === `Clean at ${lp.tempo} bpm (target ${lp.target_tempo}).` && !/at the bar/i.test(takeLine), takeLine);
  r = await app.post(`${lbase}/finish`, {}, lad.user.id);
  check('P3: a clean take below the target tempo is a step on the ladder, not "at target"', r.json.at_target === false && ladRow().tempo_ladder.pct === 0.65 && ladRow().tempo_ladder.clean === 1, ladRow().tempo_ladder);
  check('...and the set summary agrees with the take: clean at a practice tempo, never "below the bar"', r.json.summary && r.json.summary.clean === true && r.json.summary.line.startsWith(`Clean at ${lp.tempo} bpm, a practice tempo (target ${lp.target_tempo})`) && !/below the bar/i.test(r.json.summary.line), r.json.summary);
  check('...and says what the next set does (one more clean set steps it up)', /stays at \d+ bpm; one more clean set steps it up/.test(r.json.summary.next || '') && r.json.practice.step === 'same', r.json.summary);
  later(HOUR);
  await app.post(`${lbase}/start`, {}, lad.user.id);
  await app.post(`${lbase}/take`, { part: 0, played: perform(openPart()) }, lad.user.id);
  r = await app.post(`${lbase}/finish`, {}, lad.user.id);
  check('P3: two clean takes in a row step it up to 75%', ladRow().tempo_ladder.pct === 0.75, ladRow().tempo_ladder);
  check('...and the summary says the next set steps up, to 75% of the target', r.json.summary.clean && r.json.practice.step === 'up' && r.json.summary.next === `The next set steps up to ${Math.max(30, Math.round(lp.target_tempo * 0.75))} bpm.`, r.json.summary);
  {
    const dose = require('../services/skill-dose');
    check('summary copy: at the target', dose.setSummary(true, null).line === 'That set was at the bar.');
    check('summary copy: a miss at a practice tempo is below the bar, with its tempo', /^That set was below the bar, at 68 bpm \(target 104\)\.$/.test(dose.setSummary(false, { kind: 'tempo', clean: false, tempo: 68, target_tempo: 104, next_tempo: 68, step: 'same' }).line));
    check('summary copy: clean at 68 of 104 is said as that', dose.setSummary(false, { kind: 'tempo', clean: true, tempo: 68, target_tempo: 104, next_tempo: 78, step: 'up' }).line.startsWith('Clean at 68 bpm, a practice tempo (target 104).'));
    check('summary copy: the last step reaches the full tempo', dose.setSummary(false, { kind: 'tempo', clean: true, tempo: 94, target_tempo: 104, next_tempo: 104, step: 'up' }).next === 'The next set is at the full 104 bpm.');
    check('summary copy: a clean slow loop is clean, and the next set rejoins the piece', /^The slow loop \(bars 5-6\) was clean at 65 bpm/.test(dose.setSummary(false, { kind: 'loop', clean: true, bars: [5, 6], tempo: 65, target_tempo: 100 }).line));
  }
  later(HOUR);
  await app.post(`${lbase}/start`, {}, lad.user.id);
  lp = openPart();
  const bpb = lp.beats_per_bar || 4;
  const twoBars = lp.target.length >= 2 && Math.max(...lp.target.map((t) => t.beat)) >= 2 * bpb;
  const slip = perform(lp).map((n, i) => ([1, 2].includes(Math.floor(lp.target[i].beat / bpb)) ? { ...n, midi: n.midi + 1 } : n));
  r = await app.post(`${lbase}/take`, { part: 0, played: slip }, lad.user.id);
  check('P2: after two clean takes, a take gets bandwidth feedback: only what is outside the bar is flagged', !r.json.pass && r.json.feedback === 'bandwidth' && r.json.off.includes('notes') && !r.json.off.includes('on_beat') && r.json.notes != null, r.json);
  check('P3: the take with a bad bar names the bars the next set loops (bar 2 and its worse neighbour)', !twoBars || (r.json.next_loop && r.json.next_loop.bars[0] <= 2 && r.json.next_loop.bars[1] >= 2), r.json.next_loop);
  await app.post(`${lbase}/finish`, {}, lad.user.id);
  check('P2: a miss resets the clean streak, so the next take gets the full result again', ladRow().practice_streak === 0);
  later(HOUR);
  r = await app.post(`${lbase}/start`, {}, lad.user.id);
  const loopPart = openPart();
  if (twoBars) {
    check('P3: the next set is the hotspot loop: those bars only, by name, at 65% of the target tempo', /looped slowly/.test(loopPart.label) && !loopPart.song && loopPart.names.length === loopPart.target.length && loopPart.tempo === Math.max(30, Math.round(loopPart.target_tempo * 0.65)) && loopPart.target[0].beat === 0, loopPart);
    r = await app.post(`${lbase}/take`, { part: 0, played: perform(loopPart) }, lad.user.id);
    check('...played clean, it says it rejoins the whole piece next', r.json.pass && r.json.hotspot, r.json);
    check('...and the take says "Clean on the slow loop", not "At the bar"', /^Clean on the slow loop \(bars? [\d-]+\), at \d+ bpm\.$/.test(r.json.verdict || ''), r.json.verdict);
    r = await app.post(`${lbase}/finish`, {}, lad.user.id);
    check('...a loop set never counts as at the target, and the loop is cleared (rejoin)', r.json.at_target === false && !ladRow().hotspot_part, ladRow().hotspot_part);
    check('...and its summary agrees: the loop was clean, the next set rejoins the piece', r.json.summary && r.json.summary.clean && /was clean/.test(r.json.summary.line) && r.json.summary.next === 'The next set rejoins the whole piece.', r.json.summary);
  }
  process.env.PIANO_TEMPO_LADDER = 'off';
  later(HOUR);
  await app.post(`${lbase}/start`, {}, lad.user.id);
  check('PIANO_TEMPO_LADDER=off: the warm piece is at its own tempo again', !openPart().ladder_pct && !/% speed/.test(openPart().label), openPart());
  await app.post(`${lbase}/take`, { part: 0, played: perform(openPart()) }, lad.user.id);
  await app.post(`${lbase}/finish`, {}, lad.user.id);
  delete process.env.PIANO_TEMPO_LADDER;
  process.env.PIANO_FEEDBACK_FADE = 'off';
  for (let i = 0; i < 3; i++) { later(HOUR); await app.post(`${lbase}/start`, {}, lad.user.id); r = await app.post(`${lbase}/take`, { part: 0, played: perform(openPart()) }, lad.user.id); await app.post(`${lbase}/finish`, {}, lad.user.id); }
  check('PIANO_FEEDBACK_FADE=off: full results every take', !r.json.feedback, r.json);
  delete process.env.PIANO_FEEDBACK_FADE;
  const cold = learner('piano', 'piano_first_reader', 'final');
  r = await app.post(`/api/skills/checks/${cold.enrollment.id}/PI2:pieces/start`, {}, cold.user.id);
  check('the cold stage take is untouched: full tempo, no ladder', r.json.sitting.parts.every((x) => !/% speed/.test(x.label)) && db.findOne('skill_records', (x) => x.user_id === cold.user.id && x.metric_id === 'PI2:pieces').open.parts.every((x) => !x.ladder_pct), r.json.sitting.parts.map((x) => x.label));

  // ── the pages: no upload, recorder, camera or microphone of their own ──
  const FORBIDDEN = [/\bXMLHttpRequest\b/, /\bsendBeacon\b/, /\bWebSocket\b/, /\bFormData\b/, /\bMediaRecorder\b/, /\bgetUserMedia\b/, /\bRTCPeerConnection\b/, /\/upload\b|\.upload\b/i, /\bhttps?:\/\/(?!www\.w3\.org)/i, /toDataURL|toBlob|captureStream/];
  for (const f of ['public/js/piano-notation.js', 'public/js/skill-kit.js', 'public/js/stage-check.js', 'public/js/skill-practice.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
    const badf = FORBIDDEN.filter((re) => re.test(src)).map(String);
    check(`${f}: no upload path, no recorder, no camera or microphone of its own, no fetch`, !badf.length && !/\bfetch\s*\(/.test(src), badf);
  }
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'stage-check.html'), 'utf8');
  check('the stage check page loads the notation and the court', /\/js\/piano-notation\.js/.test(html) && /\/engine\/basketball\/court\.js/.test(html));

  app.close();
  F.done();
})().catch((err) => { console.error(err); process.exit(1); });
