'use strict';
/**
 * Replays results/log.jsonl: checks the hash chain, rebuilds every sitting from the logged public randomness and the
 * logged first-test exclusions, recomputes timing (late / timed out) from the logged server timestamps, and recomputes
 * scores. Used by the engine (to know its state) and by verify.js (to check the engine). PROTOCOL.md sections 7 and 8.
 */
const { sha256 } = require('../../spanish-check/lib/common');
const { DRAND, roundTimeMs, localDate } = require('../../spanish-check/lib/replay');
const { drawSitting } = require('./draw');
const scoring = require('../scoring');

const RULES = {
  sittings_total: 5,
  names: ['Day 0', 'Day 1', 'Day 2', 'Day 3', 'Final'],
  min_gap_ms: 12 * 3600 * 1000,
  max_voided: 2,
  beacon_max_age_ms: 90 * 1000,
  beacon_max_future_ms: 15 * 1000,
};
const limitMs = () => scoring.LIMITS.item_s * 1000;
const graceMs = scoring.LIMITS.grace_s * 1000;

const extHash = (x) => sha256(JSON.stringify({ keys: x.keys, ids: x.ids, en: x.en }));

function replay(lines, pool, genesisHash, drawCache) {
  const res = { chain_ok: true, chain_errors: [], head: genesisHash, head_seq: -1, events: [], sittings: [], violations: [], anchors: [], engine_starts: [] };
  let prev = genesisHash;
  let lastT = 0;
  const used = { keys: new Set(), dists: new Set(), en: new Set() };
  let cur = null;
  let finished = 0; let voided = 0;
  let lastStartT = null; let lastStartDate = null;
  const viol = (m) => res.violations.push(m);

  lines.forEach((raw, i) => {
    let ev;
    try { ev = JSON.parse(raw); } catch (e) { res.chain_ok = false; res.chain_errors.push(`line ${i}: not JSON`); return; }
    if (ev.seq !== i) { res.chain_ok = false; res.chain_errors.push(`line ${i}: seq ${ev.seq}`); }
    if (ev.prev !== prev) { res.chain_ok = false; res.chain_errors.push(`line ${i}: prev hash mismatch`); }
    prev = sha256(raw);
    res.head = prev; res.head_seq = i;
    if (ev.t < lastT) viol(`line ${i}: timestamp goes backwards`);
    lastT = ev.t;
    res.events.push(ev);

    switch (ev.type) {
      case 'engine_start': res.engine_starts.push(ev); break;
      case 'sitting_start': {
        if (cur) viol(`sitting ${ev.sitting_id}: started while sitting ${cur.id} was still open`);
        const id = res.sittings.length + 1;
        if (ev.sitting_id !== id) viol(`sitting id ${ev.sitting_id} expected ${id}`);
        if (ev.slot !== finished) viol(`sitting ${id}: slot ${ev.slot} expected ${finished}`);
        if (finished >= RULES.sittings_total && !ev.force) viol(`sitting ${id}: more than ${RULES.sittings_total} sittings without force`);
        if (voided > RULES.max_voided && !ev.force) viol(`sitting ${id}: more than ${RULES.max_voided} voided sittings without force`);
        const date = localDate(ev.t, ev.tz_offset_min);
        if (lastStartT !== null && !ev.force) {
          if (ev.t - lastStartT < RULES.min_gap_ms) viol(`sitting ${id}: started ${((ev.t - lastStartT) / 3600000).toFixed(1)} h after the previous start without force`);
          if (date === lastStartDate) viol(`sitting ${id}: second sitting on ${date} without force`);
        }
        lastStartT = ev.t; lastStartDate = date;
        const rt = roundTimeMs(ev.round);
        if (ev.t < rt - RULES.beacon_max_future_ms || ev.t - rt > RULES.beacon_max_age_ms) viol(`sitting ${id}: drand round ${ev.round} (made ${new Date(rt).toISOString()}) is not within the allowed window of the start time ${new Date(ev.t).toISOString()}`);
        const x = ev.first_test || {};
        const lists = { keys: x.keys || [], ids: x.ids || [], en: x.en || [] };
        if (extHash(lists) !== x.sha256) viol(`sitting ${id}: first-test exclusion lists do not match their logged hash`);
        let draw = null;
        try {
          const ck = `${ev.randomness}|${used.keys.size}|${used.dists.size}|${x.sha256}`;
          draw = drawCache && drawCache.has(ck) ? drawCache.get(ck) : drawSitting(pool, used, ev.randomness, { keys: new Set(lists.keys), ids: new Set(lists.ids), en: new Set(lists.en) });
          if (drawCache) drawCache.set(ck, draw);
        } catch (e) { viol(`sitting ${id}: draw failed: ${e.message}`); }
        const s = {
          id, slot: ev.slot, start_t: ev.t, start_seq: i, round: ev.round, randomness: ev.randomness, force: !!ev.force, first_test: x,
          items: draw ? draw.items : [], status: 'open', served: new Map(), answers: new Map(), away: false, leaves: 0, visibility: [],
          end_t: null, end_seq: null, summary: null, scored: null, name: null,
        };
        if (draw) { for (const k of draw.used.keys) used.keys.add(k); for (const d of draw.used.dists) used.dists.add(d); for (const e of draw.used.en) used.en.add(e); }
        res.sittings.push(s); cur = s;
        break;
      }
      case 'item_served': {
        if (!cur || cur.id !== ev.sitting_id) { viol(`line ${i}: item_served outside an open sitting`); break; }
        const expect = cur.served.size;
        if (ev.n !== expect) viol(`sitting ${cur.id}: item ${ev.n} served out of order (expected ${expect})`);
        if (expect > 0 && !cur.answers.has(cur.items[expect - 1] && cur.items[expect - 1].item_id)) viol(`sitting ${cur.id}: item ${ev.n} served before the previous one was answered`);
        const it = cur.items[ev.n];
        if (!it || it.item_id !== ev.item_id) viol(`sitting ${cur.id}: item ${ev.n} id ${ev.item_id} does not match the draw`);
        cur.served.set(ev.n, ev.t);
        cur.open_item = ev.n; cur.open_leaves = 0;
        break;
      }
      case 'visibility': {
        if (!cur || cur.id !== ev.sitting_id) break;
        const leaving = ev.state === 'hidden' || ev.state === 'blur';
        const back = ev.state === 'visible' || ev.state === 'focus';
        cur.visibility.push({ t: ev.t, state: ev.state, n: cur.open_item !== undefined && !cur.answers.has(cur.items[cur.open_item] && cur.items[cur.open_item].item_id) ? cur.open_item : null });
        if (leaving && !cur.away) {
          cur.away = true; cur.leaves++;
          if (cur.open_item !== undefined && !cur.answers.has(cur.items[cur.open_item].item_id)) cur.open_leaves = (cur.open_leaves || 0) + 1;
        } else if (back) cur.away = false;
        break;
      }
      case 'item_answer': {
        if (!cur || cur.id !== ev.sitting_id) { viol(`line ${i}: item_answer outside an open sitting`); break; }
        const it = cur.items[ev.n];
        const st = cur.served.get(ev.n);
        if (!it || it.item_id !== ev.item_id) { viol(`sitting ${cur.id}: answer for unknown item ${ev.n}`); break; }
        if (st === undefined) { viol(`sitting ${cur.id}: item ${ev.n} answered but never served`); break; }
        if (cur.answers.has(it.item_id)) { viol(`sitting ${cur.id}: item ${ev.n} answered twice`); break; }
        const serverMs = ev.t - st;
        const late = serverMs > limitMs() + graceMs;
        cur.answers.set(it.item_id, {
          item_id: it.item_id, choice: ev.choice == null ? null : ev.choice, dk: !!ev.dk,
          client_ms: ev.client_ms, plays: ev.plays, auto: !!ev.auto,
          timed_out: !!ev.auto || !!ev.client_timed_out, server_ms: serverMs, late, served_t: st, answered_t: ev.t,
          leaves: cur.open_leaves || 0,
        });
        break;
      }
      case 'sitting_finish': {
        if (!cur || cur.id !== ev.sitting_id) { viol(`line ${i}: sitting_finish outside an open sitting`); break; }
        if (cur.answers.size !== cur.items.length) viol(`sitting ${cur.id}: finished with ${cur.answers.size} of ${cur.items.length} items answered`);
        cur.status = 'finished'; cur.end_t = ev.t; cur.end_seq = i; cur.summary = ev.summary;
        cur.scored = scoring.scoreSitting(pool.meta, cur.items.map(toScoreItem), cur.answers, { leaves: cur.leaves });
        cur.name = RULES.names[cur.slot] || `Extra ${cur.slot}`;
        finished++; cur = null;
        break;
      }
      case 'sitting_abandon': {
        if (!cur || cur.id !== ev.sitting_id) { viol(`line ${i}: sitting_abandon outside an open sitting`); break; }
        cur.status = 'abandoned'; cur.end_t = ev.t; cur.end_seq = i; cur.reason = ev.reason || '';
        voided++; cur = null;
        break;
      }
      case 'anchor_ok': res.anchors.push({ ...ev, seq: i }); break;
      case 'anchor_failed': res.anchors.push({ ...ev, seq: i, failed: true }); break;
      default: viol(`line ${i}: unknown event type ${ev.type}`);
    }
  });
  res.open = cur; res.finished = finished; res.voided = voided; res.used = used; res.last_start_t = lastStartT; res.last_start_date = lastStartDate;
  return res;
}

const toScoreItem = (it) => ({ item_id: it.item_id, stratum: it.stratum, half: it.half, correct: it.correct });

module.exports = { replay, toScoreItem, RULES, DRAND, roundTimeMs, limitMs, graceMs, localDate, extHash };
