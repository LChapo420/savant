'use strict';
/**
 * The participant-test engine (copied from spanish-check/engine.js: one instance and one log per participant, two sittings, pre and post): draws a sitting from public randomness, serves one item at a time, enforces the
 * time limits on the server, writes the hash-chained log and anchors it. No HTTP in here (routes/spanish-study-tests.js
 * is the thin layer on top), so the same code can be driven from a test. PROTOCOL.md sections 5 to 8.
 */
const fs = require('fs');
const path = require('path');
const { sha256 } = require('./lib/common');
const { loadPool } = require('./lib/draw');
const { replay, toScoreItem, RULES, limitMs, graceMs, localDate, roundTimeMs } = require('./lib/replay');
const external = require('./lib/external');
const scoring = require('./scoring');

const ROOT = __dirname;
const DEFAULT_POOL = path.join(__dirname, '..', 'spanish-check', 'pool.json');
const MAX_ANSWER_CHARS = 600;
const ANCHOR_RETRY_MS = 5 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; }
}

function parseSeal(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    const m = /^([0-9a-f]{64})  (\S.*)$/.exec(line.trim());
    if (m) entries.push({ hash: m[1], path: m[2] });
  }
  return entries;
}

class Engine {
  constructor(opts = {}) {
    this.root = opts.root || ROOT;
    this.resultsDir = opts.resultsDir;
    if (!this.resultsDir) throw new Error('resultsDir is required: one folder per participant');
    this.poolPath = opts.poolPath || DEFAULT_POOL;
    this.fetchFn = opts.fetchFn || fetch;
    this.now = opts.now || (() => Date.now());
    this.anchorEnabled = opts.anchorEnabled !== false;
    this.allowUnsealed = opts.allowUnsealed === true;
    this.beaconFn = opts.beaconFn || (() => external.fetchBeacon(this.fetchFn));
    this.tsaFn = opts.tsaFn || ((d) => external.timestampTsa(d, this.fetchFn));
    this.otsFn = opts.otsFn || ((d) => external.timestampOts(d, this.fetchFn));
    this.logPath = path.join(this.resultsDir, 'log.jsonl');
    this.lines = [];
    this.head = null;
    this._state = null;
    this._drawCache = new Map();
    this._starting = false;
    this._anchoring = false;
    this._lastAnchorAttempt = 0;
    this.ready = false;
  }

  // ---- startup ---------------------------------------------------------

  init() {
    fs.mkdirSync(this.resultsDir, { recursive: true });
    const sealPath = path.join(this.root, 'SEAL.txt');
    const sealBuf = fs.existsSync(sealPath) ? fs.readFileSync(sealPath) : null;
    this.genesis = sealBuf ? sha256(sealBuf) : sha256('UNSEALED');
    this.sealProblems = [];
    if (!sealBuf) this.sealProblems.push('SEAL.txt is missing');
    else {
      for (const e of parseSeal(sealBuf.toString('utf8'))) {
        if (e.path.startsWith('raw/')) continue; // the 140 MB raw files are checked by verify.js
        const p = path.join(this.root, e.path);
        if (!fs.existsSync(p)) { this.sealProblems.push(`missing ${e.path}`); continue; }
        if (sha256(fs.readFileSync(p)) !== e.hash) this.sealProblems.push(`${e.path} does not match SEAL.txt`);
      }
    }
    this.sealOk = this.sealProblems.length === 0;
    this.pool = loadPool(this.poolPath);
    if (fs.existsSync(this.logPath)) {
      const text = fs.readFileSync(this.logPath, 'utf8');
      this.lines = text.split('\n').filter(Boolean);
    }
    const st = this.state();
    if (!st.chain_ok) throw new Error(`log chain is broken: ${st.chain_errors.slice(0, 3).join('; ')}`);
    this.head = st.head;
    this._append({
      type: 'engine_start', node: process.version, seal_ok: this.sealOk, seal_problems: this.sealProblems.slice(0, 5),
      seal_sha256: sealBuf ? sha256(sealBuf) : null,
      engine_sha256: sha256(fs.readFileSync(path.join(this.root, 'engine.js'))),
      scoring_sha256: sha256(fs.readFileSync(path.join(this.root, 'scoring.js'))),
      pool_sha256: sha256(fs.readFileSync(this.poolPath)),
    });
    this.ready = true;
    this._maybeAnchor();
    return this;
  }

  // ---- log ---------------------------------------------------------------

  _append(fields) {
    const state = this.head || this.genesis;
    const t = this.now();
    const ev = { seq: this.lines.length, t, iso: new Date(t).toISOString(), ...fields, prev: state };
    const raw = JSON.stringify(ev);
    fs.appendFileSync(this.logPath, raw + '\n');
    this.lines.push(raw);
    this.head = sha256(raw);
    this._state = null;
    return ev;
  }

  state() {
    if (!this._state) this._state = replay(this.lines, this._poolOrLoad(), this.genesis, this._drawCache);
    return this._state;
  }
  _poolOrLoad() { return this.pool; }

  // ---- public API ----------------------------------------------------------

  async status() {
    const st = this.state();
    this._maybeAnchor();
    const open = st.open;
    const now = this.now();
    const base = {
      seal_ok: this.sealOk, seal_problems: this.sealProblems.slice(0, 3),
      finished: st.finished, voided: st.voided, total: RULES.sittings_total,
      next_name: RULES.names[st.finished] || null,
      pending_anchor: this._pendingAnchor(st),
      statement: scoring.STATEMENT,
      limits: scoring.LIMITS,
    };
    if (open) return { ...base, state: 'open', sitting_id: open.id, answered: open.answers.size, items: open.items.length, name: RULES.names[open.slot] };
    if (st.finished >= RULES.sittings_total) return { ...base, state: 'complete' };
    const gate = this._gate(st, now, false);
    return { ...base, state: gate ? 'wait' : 'ready', blocked: gate, can_force: !!gate && gate.code !== 'unsealed' };
  }

  _gate(st, now, force) {
    if (!this.sealOk && !this.allowUnsealed) return { code: 'unsealed', message: 'The files do not match SEAL.txt, so no sitting can start.' };
    if (force) return null;
    if (st.last_start_t !== null) {
      const since = now - st.last_start_t;
      const today = localDate(now, new Date(now).getTimezoneOffset());
      if (since < RULES.min_gap_ms) return { code: 'gap', message: 'The last sitting started less than 12 hours ago.', retry_after_ms: RULES.min_gap_ms - since };
      if (today === st.last_start_date) return { code: 'same_day', message: 'One sitting per calendar day.' };
    }
    if (st.voided > RULES.max_voided) return { code: 'voided', message: 'Too many abandoned sittings.' };
    return null;
  }

  async start({ force = false } = {}) {
    if (this._starting) throw new HttpError(409, 'A sitting is already starting.');
    this._starting = true;
    try {
      const st = this.state();
      if (st.open) return { resumed: true, sitting_id: st.open.id };
      if (st.finished >= RULES.sittings_total && !force) throw new HttpError(409, 'Both sittings are done.');
      const now0 = this.now();
      const gate = this._gate(st, now0, !!force);
      if (gate) throw new HttpError(gate.code === 'unsealed' ? 503 : 429, gate.message, { blocked: gate });
      let beacon;
      try { beacon = await this.beaconFn(); } catch (e) { throw new HttpError(503, `Could not reach the public randomness beacon (${e.message}). No sitting was started; try again in a minute.`); }
      const now = this.now();
      const rt = roundTimeMs(beacon.round);
      if (now < rt - RULES.beacon_max_future_ms || now - rt > RULES.beacon_max_age_ms) throw new HttpError(503, 'The beacon round is too old or from the future. No sitting was started.');
      const ev = this._append({
        type: 'sitting_start', sitting_id: st.sittings.length + 1, slot: st.finished, force: !!force,
        round: beacon.round, randomness: beacon.randomness, signature: beacon.signature, relays: beacon.relays,
        tz_offset_min: new Date(now).getTimezoneOffset(), chain_hash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
      });
      const st2 = this.state();
      if (!st2.open || st2.violations.length) throw new HttpError(500, `sitting could not be drawn: ${st2.violations.slice(-1)[0] || 'unknown'}`);
      return { resumed: false, sitting_id: ev.sitting_id };
    } finally { this._starting = false; }
  }

  /** The current item (served now, or still open with the time left). Finishes the sitting when the last item is answered. */
  next() {
    let st = this.state();
    const open = st.open;
    if (!open) {
      const last = st.sittings[st.sittings.length - 1];
      if (last && last.status === 'finished') return { done: true, sitting_id: last.id };
      throw new HttpError(409, 'No sitting is open.');
    }
    const now = this.now();
    for (let n = 0; n < open.items.length; n++) {
      const it = open.items[n];
      if (open.answers.has(it.item_id)) continue;
      const served = open.served.get(n);
      if (served === undefined) {
        this._append({ type: 'item_served', sitting_id: open.id, n, item_id: it.item_id });
        return this._payload(this.state().open, n, limitMs(it.section));
      }
      const used = now - served;
      if (used > limitMs(it.section) + graceMs) {
        // closed the page and came back after the time ran out: the item scores 0, the sitting goes on
        this._append({ type: 'item_answer', sitting_id: open.id, n, item_id: it.item_id, answer: null, choice: null, client_ms: null, replays: 0, pastes: 0, auto: true });
        st = this.state();
        return this.next();
      }
      return this._payload(open, n, Math.max(0, limitMs(it.section) - used));
    }
    return this._finish(open);
  }

  _payload(open, n, remaining) {
    const it = open.items[n];
    const base = { done: false, sitting_id: open.id, n, total: open.items.length, section: it.section, limit_s: limitMs(it.section) / 1000, remaining_ms: remaining, name: RULES.names[open.slot] };
    if (it.section === 'listening') {
      return { ...base, audio: { url: `audio/${n}`, user: it.audio.user, license: it.audio.license, source: 'Tatoeba (tatoeba.org)', attribution_url: `https://tatoeba.org/en/audio/index/${it.audio.audio_id}` }, max_plays: 4 };
    }
    return { ...base, stem: it.stem, options: it.options };
  }

  answer(body) {
    const st = this.state();
    const open = st.open;
    if (!open) throw new HttpError(409, 'No sitting is open.');
    const n = Number(body.n);
    const it = open.items[n];
    if (!Number.isInteger(n) || !it) throw new HttpError(400, 'Unknown item.');
    if (open.answers.has(it.item_id)) throw new HttpError(409, 'That item was already answered.');
    const served = open.served.get(n);
    if (served === undefined) throw new HttpError(409, 'That item has not been served.');
    const now = this.now();
    const late = now - served > limitMs(it.section) + graceMs;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0));
    const fields = {
      type: 'item_answer', sitting_id: open.id, n, item_id: it.item_id,
      answer: it.section === 'listening' ? String(body.answer == null ? '' : body.answer).slice(0, MAX_ANSWER_CHARS) : null,
      choice: it.section === 'reading' && body.choice !== null && body.choice !== undefined && [0, 1, 2, 3].includes(Number(body.choice)) ? Number(body.choice) : null,
      client_ms: body.client_ms == null ? null : clamp(body.client_ms, 0, 3600000),
      replays: clamp(body.replays, 0, 10), pastes: clamp(body.pastes, 0, 1000),
      client_timed_out: !!body.timed_out, auto: false,
    };
    this._append(fields);
    const after = this.state().open;
    const finished = after && after.answers.size === after.items.length;
    if (finished) this._finish(after);
    return { ok: true, late, done: !!finished };
  }

  _finish(open) {
    const st = this.state();
    const s = st.sittings.find((x) => x.id === open.id);
    const scored = scoring.scoreSitting(this.pool.meta, s.items.map(toScoreItem), s.answers);
    this._append({
      type: 'sitting_finish', sitting_id: open.id,
      summary: { listening: scored.listening.est, reading_raw: scored.reading.raw, reading_cc: scored.reading.cc, composite: scored.composite.est, flags: scored.checks.flags },
    });
    this._maybeAnchor(true);
    return { done: true, sitting_id: open.id };
  }

  visibility(body) {
    const st = this.state();
    const open = st.open;
    if (!open) return { ok: false };
    if (!['hidden', 'visible', 'blur', 'focus'].includes(body.state)) throw new HttpError(400, 'Unknown state.');
    if (open.visibility.length >= 400) return { ok: true, ignored: true };
    this._append({ type: 'visibility', sitting_id: open.id, state: body.state, client_t: Number.isFinite(Number(body.client_t)) ? Math.round(Number(body.client_t)) : null });
    return { ok: true };
  }

  abandon(reason) {
    const st = this.state();
    if (!st.open) throw new HttpError(409, 'No sitting is open.');
    this._append({ type: 'sitting_abandon', sitting_id: st.open.id, reason: String(reason || 'abandoned by the learner').slice(0, 200) });
    this._maybeAnchor(true);
    return { ok: true };
  }

  /** Audio source for the currently open listening item. */
  audioFor(n) {
    const st = this.state();
    const open = st.open;
    if (!open) throw new HttpError(409, 'No sitting is open.');
    const it = open.items[Number(n)];
    if (!it || it.section !== 'listening') throw new HttpError(404, 'No such audio.');
    if (open.answers.has(it.item_id) || !open.served.has(Number(n))) throw new HttpError(409, 'That item is not the open one.');
    return { audio_id: it.audio.audio_id, sentence_id: it.item_id };
  }
  /** Audio source of item n in the open sitting (lets the server warm its cache; says nothing about the transcript). */
  audioInfo(n) {
    const open = this.state().open;
    if (!open) return null;
    const it = open.items[Number(n)];
    return it && it.section === 'listening' ? { audio_id: it.audio.audio_id, sentence_id: it.item_id } : null;
  }

  // ---- report --------------------------------------------------------------

  report() {
    const st = this.state();
    const sittings = st.sittings.filter((s) => s.status === 'finished');
    const tzOff = (s) => new Date(s.start_t).getTimezoneOffset();
    const rows = sittings.map((s) => {
      const sc = s.scored;
      const times = sc.items.filter((p) => p.server_ms !== null).map((p) => p.server_ms / 1000);
      return {
        id: s.id, slot: s.slot, name: s.name, date: localDate(s.start_t, tzOff(s)), started: new Date(s.start_t).toISOString(), finished: new Date(s.end_t).toISOString(),
        duration_s: Math.round((s.end_t - s.start_t) / 1000), drand_round: s.round, forced: s.force,
        listening: { score: sc.listening.est, ci: sc.listening.ci, exact: sc.listening.exact_sentences, n: sc.listening.n },
        reading: { raw: sc.reading.raw, raw_ci: sc.reading.raw_ci, cc: sc.reading.cc, cc_ci: sc.reading.cc_ci, correct: sc.reading.correct, n: sc.reading.n },
        composite: { score: sc.composite.est, ci: sc.composite.ci },
        checks: sc.checks,
        timing: { median_s_per_item: scoring.median(times), timeouts: sc.checks.timing.timeouts, late: sc.checks.timing.late, page_leaves: sc.checks.page_leaves.leaves, items_open_when_left: sc.checks.page_leaves.items_open_when_left },
        flags: sc.checks.flags,
        _sc: sc,
      };
    });
    const changes = rows.map((r) => (r.slot === rows[0].slot ? null : scoring.changeFrom(rows[0]._sc, r._sc)));
    const out = rows.map((r, i) => { const { _sc, ...rest } = r; return { ...rest, change_from_first: changes[i] }; });
    const rel = (sec) => scoring.splitHalfReliability(rows.map((r) => r._sc), sec);
    const voided = st.sittings.filter((s) => s.status === 'abandoned').map((s) => ({ id: s.id, started: new Date(s.start_t).toISOString(), reason: s.reason }));
    const seen = new Set(); const credits = [];
    for (const s of sittings) for (const it of s.items) if (it.section === 'listening' && it.audio && !seen.has(it.audio.audio_id)) { seen.add(it.audio.audio_id); credits.push({ audio_id: it.audio.audio_id, user: it.audio.user, license: it.audio.license }); }
    return {
      statement: scoring.STATEMENT, sittings: out, voided,
      reliability: { listening: rel('listening'), reading: rel('reading'), note: 'Needs 4 or more sittings; with one learner it is only a rough guide.' },
      pool: this.pool.meta.pool_sizes,
      audio_credits: credits,
      violations: st.violations,
      chain: { ok: st.chain_ok, head: st.head, events: st.events.length },
    };
  }

  // ---- anchoring -----------------------------------------------------------

  _pendingAnchor(st) {
    const ended = st.sittings.filter((s) => s.end_seq !== null).map((s) => s.end_seq);
    if (!ended.length) return null;
    const terminal = Math.max(...ended);
    const anchored = Math.max(-1, ...st.anchors.filter((a) => !a.failed).map((a) => a.anchored_seq));
    return terminal > anchored ? { terminal_seq: terminal } : null;
  }

  _maybeAnchor(force) {
    if (!this.anchorEnabled) return;
    const st = this.state();
    if (!this._pendingAnchor(st) || this._anchoring) return;
    const now = this.now();
    if (!force && now - this._lastAnchorAttempt < ANCHOR_RETRY_MS) return;
    this._anchorPromise = this.anchorNow().catch(() => {});
  }

  async flushAnchors() { if (this._anchorPromise) await this._anchorPromise; }

  async anchorNow() {
    if (this._anchoring) return null;
    this._anchoring = true; this._lastAnchorAttempt = this.now();
    try {
      const st = this.state();
      const pending = this._pendingAnchor(st);
      const seq = this.lines.length - 1; const head = this.head;
      const dir = path.join(this.resultsDir, 'anchors');
      fs.mkdirSync(dir, { recursive: true });
      const stem = `${String(seq).padStart(5, '0')}-${head.slice(0, 12)}`;
      let tsa;
      try { tsa = await this.tsaFn(head); } catch (e) {
        this._append({ type: 'anchor_failed', anchored_seq: seq, anchored_head: head, error: String(e.message).slice(0, 200), will_retry_in_ms: ANCHOR_RETRY_MS });
        const timer = setTimeout(() => { this._maybeAnchor(true); }, ANCHOR_RETRY_MS); if (timer.unref) timer.unref();
        return null;
      }
      fs.writeFileSync(path.join(dir, `${stem}.tsq`), tsa.tsq);
      fs.writeFileSync(path.join(dir, `${stem}.tsr`), tsa.tsr);
      let ots = null;
      try { const o = await this.otsFn(head); fs.writeFileSync(path.join(dir, `${stem}.ots`), o.ots); ots = { file: `anchors/${stem}.ots`, calendar: o.calendar }; } catch (e) { ots = null; }
      const ended = st.sittings.filter((s) => s.end_seq !== null).map((s) => s.end_t);
      this._append({
        type: 'anchor_ok', anchored_seq: seq, anchored_head: head, tsa: { url: tsa.url, tsq: `anchors/${stem}.tsq`, tsr: `anchors/${stem}.tsr` }, ots,
        delay_ms: this.now() - (ended.length ? Math.max(...ended) : this.now()), pending_at_call: pending,
      });
      return { seq, head };
    } finally { this._anchoring = false; }
  }
}

module.exports = { Engine, HttpError, parseSeal };
