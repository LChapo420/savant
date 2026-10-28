/* Shared parts of the server-graded checks (Check_Choice, Check_Typed).
 *
 * A check is the one kind of block that does not carry its own answer. It asks
 * `window.PolymathChecks.submit(id, answer)` — provided by the page shell — and
 * shows whatever the server says. A check already answered (the learner came
 * back to the page) is shown answered, from `PolymathChecks.answered[id]`.
 */
(function (global) {
  var CheckKit = global.PolymathCheckKit = global.PolymathCheckKit || {};

  CheckKit.TAG = 'polymath_check';

  CheckKit.styles = function () {
    var id = CheckKit.TAG + '__styles';
    if (document.getElementById(id)) return;
    var t = CheckKit.TAG;
    var st = document.createElement('style');
    st.id = id;
    st.textContent = [
      '.' + t + '__card{background:#111827;border:1px solid #1f293d;border-radius:12px;padding:18px 20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#f8fafc;}',
      '.' + t + '__kicker{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#38bdf8;margin:0 0 8px;}',
      '.' + t + '__prompt{margin:0 0 14px;font-size:16px;line-height:1.55;font-weight:600;white-space:pre-wrap;}',
      '.' + t + '__options{display:flex;flex-direction:column;gap:8px;}',
      '.' + t + '__opt{min-height:44px;padding:10px 14px;text-align:left;border:1px solid #334155;border-radius:10px;background:#090d16;color:#f8fafc;font:inherit;font-size:15px;cursor:pointer;transition:border-color 150ms,background-color 150ms;}',
      '.' + t + '__opt:hover:not(:disabled){border-color:#38bdf8;}',
      '.' + t + '__opt:focus-visible,.' + t + '__input:focus-visible,.' + t + '__go:focus-visible{outline:2px solid #38bdf8;outline-offset:2px;}',
      '.' + t + '__opt:disabled{cursor:default;}',
      '.' + t + '__opt.is-right{border-color:#34d399;box-shadow:0 0 0 1px #34d399;}',
      '.' + t + '__opt.is-wrong{border-color:#f87171;box-shadow:0 0 0 1px #f87171;}',
      '.' + t + '__row{display:flex;gap:8px;flex-wrap:wrap;}',
      '.' + t + '__input{flex:1 1 200px;min-height:44px;padding:10px 12px;border:1px solid #334155;border-radius:10px;background:#090d16;color:#f8fafc;font:inherit;font-size:15px;}',
      '.' + t + '__go{min-height:44px;padding:0 18px;border:0;border-radius:10px;background:#38bdf8;color:#090d16;font:inherit;font-weight:700;cursor:pointer;}',
      '.' + t + '__go:disabled{opacity:.5;cursor:default;}',
      '.' + t + '__verdict{margin-top:12px;padding:12px 14px;border-radius:10px;border:1px solid #1f293d;background:#090d16;font-size:14px;line-height:1.55;}',
      '.' + t + '__verdict.is-right{border-color:#34d399;}',
      '.' + t + '__verdict.is-wrong{border-color:#f87171;}',
      '.' + t + '__verdict b{display:block;margin-bottom:4px;}',
      '@media (prefers-reduced-motion:reduce){.' + t + '__opt{transition:none;}}',
    ].join('');
    document.head.appendChild(st);
  };

  CheckKit.el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = CheckKit.TAG + '__' + cls;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
  };

  /** Show the server's verdict under a check. */
  CheckKit.verdict = function (host, result) {
    var old = host.querySelector('.' + CheckKit.TAG + '__verdict');
    if (old) old.remove();
    var box = CheckKit.el('div', 'verdict');
    box.classList.add(result.correct ? 'is-right' : 'is-wrong');
    box.setAttribute('role', 'status');
    box.appendChild(CheckKit.el('b', null, result.correct ? 'Right.' : 'Not quite. The answer is: ' + (result.answer || '')));
    if (result.rationale) box.appendChild(CheckKit.el('span', null, result.rationale));
    host.appendChild(box);
  };

  CheckKit.submit = function (id, answer) {
    var api = global.PolymathChecks;
    if (!api || typeof api.submit !== 'function') {
      return Promise.reject(new Error('Checks are not connected on this page.'));
    }
    return api.submit(id, answer);
  };

  CheckKit.previous = function (id) {
    var api = global.PolymathChecks;
    return api && api.answered ? api.answered[id] || null : null;
  };

  CheckKit.registry = function () {
    return global.LessonBlocks = global.LessonBlocks || {
      modules: {},
      register: function (tag, mod) { this.modules[tag] = mod; },
      get: function (tag) { return this.modules[tag]; },
      all: function () {
        var out = [];
        for (var k in this.modules) if (this.modules.hasOwnProperty(k)) out.push(this.modules[k]);
        return out;
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
