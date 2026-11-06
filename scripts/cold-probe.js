#!/usr/bin/env node
/**
 * Cold first block probe (7 Nov 2026, brief cold-write). Real paid calls through the ledgers; no learner data: a fixed simulated profile. Not part of npm test.
 *
 *   DB_FILE=copy.json RUN_CAP_USD=2 node scripts/cold-probe.js layout|fill [levels=10,254,465] [reps=3] [out=file.json]
 *
 * layout  seconds and validity of block_layout on several slots.
 * derail  the same layouts N times: the fill as shipped (warm retry) against the stream with its watchdog, keeping the blocks that came and asking for the rest. Usable = every block valid and at least one check.
 * fill    Coral Fast (and others) on a fixed layout: whole fill as today, against the first block alone, against the whole fill streamed (seconds to the first complete block).
 */
const fs = require('fs');
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
require('../services/run-cap').defaultCap(2);
const LIVE = 'C:/coding/claudecommittdIq/folderThing/iq-max-repo-2-claude-adoring-mayer-woc9sq/data';
for (const n of ['CORAL', 'GONKA', 'GROKIFIED', 'LYCEUM', 'MUNITO', 'ZEROGPU']) { process.env[`${n}_PIPELINE`] = '1'; if (!process.env[`${n}_LEDGER_FILE`]) process.env[`${n}_LEDGER_FILE`] = `${LIVE}/${n.toLowerCase()}-ledger.json`; }
if (!process.env.DB_FILE) throw new Error('DB_FILE=<copy> is required');
const [, , WHAT = 'fill', LV = '10,254,465', REPS = '3', OUT = null] = process.argv;
const bl = require('../services/block-levels');
const schemaCheck = require('../services/block-schema');

const lib = bl.library();
const { coral } = require('../services/providers/coral');

const prov = (n) => require(`../services/providers/${n}`)[n]; // eslint-disable-line global-require, import/no-dynamic-require
const TRACK = 'math'; const GRADE = 'algebra_1_part_a';
const LEARNER = 'LEARNER PROFILE (simulated): adult, likes basketball and drawing; said: short explanations please. Strong at algebra so far.';
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const secs = (t) => Math.round((Date.now() - t) / 100) / 10;
const slots = {
  coralFast: (a) => coral.structuredOnce({ ...a, model: 'deepseek-v4.1-flash-fast' }),
  coralStd: (a) => coral.structuredOnce({ ...a, model: 'deepseek-v4.1-flash' }),
  minimax: (a) => prov('lyceum').structured({ ...a, model: 'minimax/minimax-m3' }),
  gonkaGlm: (a) => prov('gonka').structured({ ...a, model: 'zai-org/GLM-5.3-Flash' }),
  zerogpu: (a) => prov('zerogpu').structured({ ...a, model: 'z-ai/glm-5.3-flash' }),
  grok43: (a) => prov('grokified').structured({ ...a, model: 'grok-4.3' }),
};
function layoutArgs(level) {
  const context = bl.levelContext(TRACK, GRADE, level);
  const catalog = bl.catalogFor('lesson', TRACK);
  return { context, catalog, args: { task: 'block_layout', system: `${bl.LAYOUT_SYSTEM}${bl.subjectNote(TRACK, 'layout')}\n\nLIBRARY (lesson blocks):\n${catalog.map(bl.catalogLine).join('\n')}`, user: `${context.text}\n\n${LEARNER}\n\nDesign the lesson layout now.`, schema: bl.layoutSchema('lesson', catalog.map((b) => b.tag), context.skills), schemaName: 'submit_layout', maxTokens: 16000, timeoutMs: 90000 } };
}
async function tryCall(fn) { const t = Date.now(); try { const r = await fn(); return { ok: true, sec: secs(t), out: r.usage && r.usage.output_tokens, r }; } catch (e) { return { ok: false, sec: secs(t), err: String(e.message).slice(0, 140) }; } }
const parallel = async (jobs, n) => { let i = 0; const out = []; await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); } })); return out; };

async function getLayout(level) {
  const { context, catalog, args } = layoutArgs(level);
  for (let k = 0; k < 4; k++) {
    const g = await tryCall(() => coral.structuredOnce({ ...args, model: 'deepseek-v4.1-flash-fast', temperature: k ? 0.5 : 0 }));
    if (g.ok) { const l = bl.cleanLayout({ ...g.r.data, blocks: bl.readList(g.r.data.blocks), checks: bl.readList(g.r.data.checks) }, 'lesson', catalog, context.skills, ['multiple_choice', 'type_in']); if (l) return { layout: l, context, sec: g.sec }; }
  }
  throw new Error(`no layout for ${level}`);
}
function onePrompt(context, layout, keep) {
  // Same text as the whole fill, then the instruction narrowed to one block and the checks that follow it. The other blocks stay named so it reads as part of the sequence.
  const base = bl.fillPrompt({ context, learner: LEARNER, layout });
  const checks = layout.checks.map((c, i) => ({ i, after: c.after })).filter((c) => keep.includes(c.after) || (keep.includes(0) && c.after < 0)).map((c) => c.i);
  return { user: base.replace('Write every block and every check now.', `Write ONLY block${keep.length > 1 ? 's' : ''} ${keep.join(', ')}${checks.length ? ` and check${checks.length > 1 ? 's' : ''} ${checks.join(', ')}` : ''} now, in full. The others are written separately; do not include them.`), checks };
}
function goodBlock(blocks, layout, i) {
  const list = bl.readList(blocks).map((raw, p) => bl.readEntry(raw, p));
  const e = list.find((x) => x.index === i) || list[0];
  if (!e || !e.data) return false;
  return schemaCheck.validate(lib[layout.blocks[i].block].schema, e.data).length === 0;
}
/** New complete objects of the top-level "blocks" array in the text so far. A tiny state machine: strings, escapes, depth. */
function entries(text, st) {
  if (st.i === 0) { const m = /"blocks"\s*:\s*\[/.exec(text); if (!m) return []; st.i = m.index + m[0].length; st.depth = 0; st.inStr = false; st.esc = false; st.start = -1; st.done = false; }
  if (st.done) return [];
  const out = [];
  for (; st.i < text.length; st.i++) {
    const c = text[st.i];
    if (st.inStr) { if (st.esc) st.esc = false; else if (c === '\\') st.esc = true; else if (c === '"') st.inStr = false; continue; }
    if (c === '"') { st.inStr = true; continue; }
    if (c === '{') { if (st.depth === 0) st.start = st.i; st.depth++; continue; }
    if (c === '}') { st.depth--; if (st.depth === 0 && st.start >= 0) { try { out.push(JSON.parse(text.slice(st.start, st.i + 1))); } catch { out.push(null); } st.start = -1; } continue; }
    if (c === ']' && st.depth === 0) { st.done = true; break; }
  }
  return out;
}
async function streamFill(args, model, temperature) {
  // Whole fill, streamed: seconds to each complete top-level entry of "blocks". Direct to Coral inside its ledger.
  const ledger = require('../services/coral-ledger'); // eslint-disable-line global-require
  const base = String(process.env.CORAL_BASE_URL).replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  const url = `${/\/v1$/.test(base) ? base : `${base}/v1`}/chat/completions`;
  const messages = [{ role: 'system', content: `${args.system}\n\nReply with one JSON object only (no prose, no code fence) matching this JSON schema (${args.schemaName}):\n${JSON.stringify(args.schema)}` }, { role: 'user', content: args.user }];
  const body = { model, messages, max_tokens: args.maxTokens, temperature, response_format: { type: 'json_object' }, stream: true, stream_options: { include_usage: true } };
  const id = ledger.reserve({ usd: ledger.estimate({ model, inputChars: args.system.length + args.user.length, maxTokens: args.maxTokens }), task: 'block_fill', model });
  const t0 = Date.now(); let text = ''; let usage = null; let firstByte = null; const marks = []; const scan = { i: 0 };
  try {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env.CORAL_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(args.timeoutMs || 90000) });
    if (!res.ok) { ledger.settle(id, { outcome: 'not_billed' }); return { ok: false, err: `status ${res.status}`, sec: secs(t0) }; }
    const dec = new TextDecoder(); let buf = '';
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); nl = buf.indexOf('\n');
        if (line.startsWith('data:')) {
          const d = line.slice(5).trim();
          let j = null; try { j = d === '[DONE]' ? null : JSON.parse(d); } catch { j = null; }
          if (j) {
            if (j.usage) usage = { input_tokens: j.usage.prompt_tokens, output_tokens: j.usage.completion_tokens };
            const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if (delta) { if (firstByte == null) firstByte = secs(t0); text += delta; }
            for (let found = entries(text, scan), n = 0; n < found.length; n++) marks.push(secs(t0));
          }
        }
      }
    }
    ledger.settle(id, usage ? { usd: ledger.costOf(model, usage), outcome: 'ok', usage } : { outcome: 'unknown' });
    return { ok: true, sec: secs(t0), firstByte, marks, text, usage };
  } catch (e) { ledger.settle(id, { outcome: 'unknown' }); return { ok: false, err: String(e.message).slice(0, 120), sec: secs(t0), marks, text }; }
}

(async () => {
  const levels = LV.split(',').map(Number); const reps = Number(REPS); const rows = [];
  if (WHAT === 'layout') {
    const who = ['coralFast', 'coralStd', 'minimax', 'gonkaGlm', 'zerogpu', 'grok43'];
    const jobs = [];
    for (const lv of levels) for (const s of who) for (let k = 0; k < reps; k++) jobs.push(async () => { const { args } = layoutArgs(lv); const g = await tryCall(() => slots[s](args)); const row = { what: 'layout', lv, s, k, ok: g.ok, sec: g.sec, out: g.out, err: g.err }; rows.push(row); console.log(JSON.stringify(row)); });
    await parallel(jobs, 4);
    for (const s of who) { const r = rows.filter((x) => x.s === s); console.log('LAYOUT', s, 'ok', r.filter((x) => x.ok).length, '/', r.length, 'p50', med(r.filter((x) => x.ok).map((x) => x.sec)), 'max', Math.max(...r.map((x) => x.sec))); }
  }
  if (WHAT === 'fill') {
    const jobs = [];
    for (const lv of levels) {
      const { layout, context, sec } = await getLayout(lv); // eslint-disable-line no-await-in-loop
      console.log(`level ${lv}: layout ${sec}s, blocks ${layout.blocks.map((b) => b.block).join(',')}, ${layout.checks.length} checks`);
      const whole = { system: bl.FILL_SYSTEM + bl.subjectNote(TRACK, 'fill'), user: bl.fillPrompt({ context, learner: LEARNER, layout }), schema: bl.fillSchema(), schemaName: 'submit_block_content', maxTokens: 9000, task: 'block_fill', timeoutMs: 90000 };
      const { user: oneUser } = onePrompt(context, layout, [0]);
      const one = { ...whole, user: oneUser, schema: { ...bl.fillSchema(), required: ['blocks'] }, maxTokens: 3000 };
      const job = (v, fn) => async () => { const g = await tryCall(fn); const row = { lv, v, ok: g.ok, sec: g.sec, out: g.out, err: g.err, first: g.ok && goodBlock(g.r.data.blocks, layout, 0) }; rows.push(row); console.log(JSON.stringify(row)); };
      for (let k = 0; k < reps; k++) {
        jobs.push(job('whole', () => slots.coralFast(whole)));
        jobs.push(job('oneT0', () => slots.coralFast(one)));
        jobs.push(job('oneT04', () => slots.coralFast({ ...one, temperature: 0.4 })));
        jobs.push(job('oneMinimax', () => slots.minimax(one)));
        jobs.push(async () => { const g = await streamFill(whole, 'deepseek-v4.1-flash-fast', 0); let parsed = null; try { parsed = JSON.parse(g.text); } catch { /* derailed */ } const row = { lv, v: 'stream', ok: g.ok && !!parsed, sec: g.sec, firstByte: g.firstByte, marks: g.marks, err: g.err, tail: g.ok && !parsed ? String(g.text).slice(-120) : undefined, first: !!(parsed && goodBlock(parsed.blocks, layout, 0)) }; rows.push(row); console.log(JSON.stringify(row)); });
      }
    }
    await parallel(jobs, Number(process.env.PROBE_PAR || 3));
    for (const v of ['whole', 'oneT0', 'oneT04', 'oneMinimax', 'stream']) { const r = rows.filter((x) => x.v === v); console.log('FILL', v, 'parsed', r.filter((x) => x.ok).length, '/', r.length, 'first block valid', r.filter((x) => x.first).length, 'p50', med(r.filter((x) => x.ok).map((x) => x.sec)), 'max', Math.max(...r.map((x) => x.sec)), v === 'stream' ? `first complete block p50 ${med(r.map((x) => (x.marks || [])[0]))}` : ''); }
  }
  if (WHAT === 'derail') {
    const fb = require('../services/first-block'); // eslint-disable-line global-require
    const jobs = [];
    for (const lv of levels) {
      const { layout, context } = await getLayout(lv); // eslint-disable-line no-await-in-loop
      const base = { system: bl.FILL_SYSTEM + bl.subjectNote(TRACK, 'fill'), schema: bl.fillSchema(), schemaName: 'submit_block_content', maxTokens: 9000, task: 'block_fill', timeoutMs: 90000 };
      const prompt = bl.fillPrompt({ context, learner: LEARNER, layout });
      const valid = (i, data) => !!data && schemaCheck.validate(lib[layout.blocks[i].block].schema, data).length === 0;
      for (let k = 0; k < reps; k++) {
        jobs.push(async () => {
          const g = await tryCall(() => coral.structured({ ...base, user: prompt, model: 'deepseek-v4.1-flash-fast' }));
          const list = g.ok ? bl.readList(g.r.data.blocks).map((raw, p) => bl.readEntry(raw, p)) : [];
          const n = layout.blocks.filter((b, i) => { const e = list.find((x) => x.index === i); return e && valid(i, e.data); }).length;
          const row = { lv, v: 'shipped', usable: g.ok && n === layout.blocks.length && bl.readList(g.r.data.checks).length > 0, blocks: n, of: layout.blocks.length, sec: g.sec, err: g.err }; rows.push(row); console.log(JSON.stringify(row));
        });
        jobs.push(async () => {
          const t0 = Date.now(); const have = new Map(); let checks = null; let calls = 0; let derails = 0; let firstAt = null;
          for (let a = 0; a < 3 && (have.size < layout.blocks.length || !checks); a++) {
            calls += 1;
            const missing = layout.blocks.map((b, i) => i).filter((i) => !have.has(i));
            const note = have.size ? `\n\nALREADY WRITTEN AND FIXED, the learner reads these first; do not write them again, continue from them:\n${[...have].map(([i, d]) => `BLOCK ${i}: ${JSON.stringify(d)}`).join('\n')}\n\nWrite only blocks ${missing.join(', ')} (by those BLOCK numbers) and every check now.` : '';
            const reader = fb.blockReader(); let seen = 0; let off = null;
            const onText = (text) => {
              for (const raw of reader.feed(text)) { const e = bl.readEntry(raw, seen); const at = e.explicit ? e.index : missing[seen]; seen += 1; if (Number.isInteger(at) && !have.has(at) && valid(at, e.data)) { have.set(at, e.data); if (firstAt === null) firstAt = secs(t0); } }
              off = fb.derailed(text, reader.current(text), reader.after(text));
              if (off) derails += 1;
              return off;
            };
            // eslint-disable-next-line no-await-in-loop
            const g = await tryCall(() => coral.structured({ ...base, user: `${prompt}${note}`, model: 'deepseek-v4.1-flash-fast', onText, temperature: a === 0 ? 0 : a === 1 ? 0.4 : 0.8 }));
            if (g.ok && !g.r.stopped) { const l = bl.readList(g.r.data.checks); if (l.length) checks = l; }
          }
          const row = { lv, v: 'stream', usable: have.size === layout.blocks.length && !!checks, blocks: have.size, of: layout.blocks.length, sec: secs(t0), firstAt, calls, derails }; rows.push(row); console.log(JSON.stringify(row));
        });
      }
    }
    await parallel(jobs, Number(process.env.PROBE_PAR || 2));
    for (const lv of [...levels, 'all']) for (const v of ['shipped', 'stream']) { const r = rows.filter((x) => x.v === v && (lv === 'all' || x.lv === lv)); console.log('DERAIL', lv, v, 'usable', r.filter((x) => x.usable).length, '/', r.length, 'p50', med(r.map((x) => x.sec)), 'max', Math.max(...r.map((x) => x.sec)), v === 'stream' ? `first block p50 ${med(r.map((x) => x.firstAt))}, calls ${r.reduce((n, x) => n + x.calls, 0)}, derails ${r.reduce((n, x) => n + x.derails, 0)}` : ''); }
  }
  try { console.log('SPEND', JSON.stringify(require('../services/run-cap').summary())); } catch { /* none */ } // eslint-disable-line global-require
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  process.exit(0);
})();
