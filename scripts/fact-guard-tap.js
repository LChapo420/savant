/**
 * A preload for proofs of the fact guard, never for the live app: `node -r ./scripts/fact-guard-tap.js server.js` with FACT_TAP_FILE=<temp file>.
 * Writes one JSON line per checker call and per guard decision (the text checked, the verdict, the checker, the time), so a person can read every hold.
 * It changes nothing the guard decides. It also keeps a run to prepaid providers: the keys in FACT_TAP_BLANK (comma list) are blanked before the .env loads.
 * The text it writes is whatever the run's learners produced, so point it only at test learners on a DB copy.
 */
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');

for (const k of String(process.env.FACT_TAP_BLANK || '').split(',').map((s) => s.trim()).filter(Boolean)) process.env[k] = '';
if (process.env.FACT_TAP_ENV) require('dotenv').config({ path: process.env.FACT_TAP_ENV });
for (const k of String(process.env.FACT_TAP_BLANK || '').split(',').map((s) => s.trim()).filter(Boolean)) process.env[k] = '';

const FILE = process.env.FACT_TAP_FILE;
const write = (row) => { if (FILE) { try { fs.appendFileSync(FILE, `${JSON.stringify({ at: new Date().toISOString(), ...row })}\n`); } catch { /* a proof's log */ } } };
const als = new AsyncLocalStorage();

function install() {
  const guard = require('../services/fact-guard');
  const ai = require('../services/ai');
  const origDetail = ai.structuredDetail;
  ai.structuredDetail = async function tapped(args) {
    if (args && args.task === 'fact_live') {
      const t0 = Date.now();
      const ctx = als.getStore() || {};
      try {
        const res = await origDetail.call(this, args);
        write({ kind: 'check', key: ctx.key || null, mode: ctx.mode || null, user: args.user, system_len: String(args.system || '').length, exclude: args.excludeFamilies || null, ok: !!(res && res.data), wrong: res && res.data ? res.data.wrong : null, checked: res && res.data ? res.data.checked : null, model: res ? res.model : null, ms: Date.now() - t0, userId: args.userId || null });
        return res;
      } catch (err) {
        write({ kind: 'check', key: ctx.key || null, ok: false, error: String(err.message).slice(0, 200), ms: Date.now() - t0, userId: args.userId || null });
        throw err;
      }
    }
    return origDetail.call(this, args);
  };
  const origPass = guard.pass;
  guard.pass = async function tappedPass(a) {
    const key = a.factTask || (a.req && a.req.factTask) || a.task;
    if (key === 'fact_live') return origPass.call(this, a);
    const t0 = Date.now();
    const out = await als.run({ key, mode: a.req && a.req.factMode }, () => origPass.call(this, a));
    const res = a.result;
    const ms = Date.now() - t0;
    const outcome = !res ? 'empty' : out === res ? (ms < 3 ? 'unchecked' : 'passed') : !out ? 'blocked' : out.held ? `held_${out.held}` : out.fact_dropped ? 'dropped' : 'second_try';
    write({ kind: 'pass', key, outcome, ms, writer: res && res.model, fact_dropped: out && out.fact_dropped, text: res && typeof res.text === 'string' ? res.text : undefined, data: res && res.data && outcome !== 'unchecked' ? res.data : undefined, second: outcome === 'second_try' ? out.text : undefined, learnerSaid: a.req && Array.isArray(a.req.messages) ? String((a.req.messages.slice(-1)[0] || {}).content || '').slice(0, 300) : undefined, source: a.req && a.req.factSource ? String(a.req.factSource).slice(0, 1500) : undefined, userId: a.userId || null });
    return out;
  };
  const origPT = guard.passesText;
  guard.passesText = async function tappedPT(a) {
    const t0 = Date.now();
    const ok = await als.run({ key: a.task, mode: a.mode }, () => origPT.call(this, a));
    write({ kind: 'pass', key: a.task, outcome: ok ? 'passed' : 'blocked', ms: Date.now() - t0, text: a.text, source: a.source ? String(a.source).slice(0, 1500) : undefined, userId: a.userId || null });
    return ok;
  };
}
/**
 * Drills: FACT_TAP_DRILL_FILE names a JSON file { "off": ["coral","zerogpu","nvidia"], "mode": "error"|"hang" }, read on every call. A checker call to a named provider then
 * fails on the wire (a 503, or no answer until the caller gives up), while the same provider still writes. Every provider call is logged with whether it was a check.
 */
const HOSTS = () => ({
  coral: process.env.CORAL_BASE_URL, zerogpu: process.env.ZEROGPU_BASE_URL, nvidia: 'integrate.api.nvidia.com', gonka: process.env.GONKA_BASE_URL, munito: process.env.MUNITO_BASE_URL, lyceum: process.env.LYCEUM_BASE_URL, grokified: process.env.GROKIFIED_BASE_URL, openrouter: 'openrouter.ai', xkiro: process.env.XKIRO_BASE_URL, gemini: 'generativelanguage.googleapis.com', ollama: '127.0.0.1:11434',
});
const hostOf = (v) => { try { return new URL(v).host; } catch { return String(v || ''); } };
function providerOf(url) { const h = HOSTS(); for (const k of Object.keys(h)) { const want = hostOf(h[k]); if (want && String(url).includes(want)) return k; } return null; }
const MARKS = ['You fact-check text an AI tutor wrote', 'You check text written for a learner against a SOURCE', 'You check text written for a student from THEIR OWN', 'is about to be put over a LESSON'];
function installWire() {
  const orig = global.fetch;
  global.fetch = async function tappedFetch(url, init = {}) {
    const prov = providerOf(typeof url === 'string' ? url : url && url.url);
    if (!prov) return orig(url, init);
    const body = typeof init.body === 'string' ? init.body : '';
    const isCheck = MARKS.some((m) => body.includes(m));
    let drill = { off: [], mode: 'error' };
    if (isCheck && process.env.FACT_TAP_DRILL_FILE) { try { drill = JSON.parse(fs.readFileSync(process.env.FACT_TAP_DRILL_FILE, 'utf8')); } catch { /* none */ } }
    const blocked = isCheck && (drill.off || []).includes(prov);
    write({ kind: 'wire', provider: prov, check: isCheck, blocked });
    if (!blocked) return orig(url, init);
    if (drill.mode === 'hang') {
      await new Promise((resolve, reject) => { const sig = init.signal; const out = setTimeout(resolve, 120000); if (sig) sig.addEventListener('abort', () => { clearTimeout(out); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true }); });
    }
    return new Response(JSON.stringify({ error: { message: 'drill: this checker is off' } }), { status: 503, headers: { 'content-type': 'application/json' } });
  };
}
if (FILE) { install(); installWire(); }
module.exports = { install, als };
