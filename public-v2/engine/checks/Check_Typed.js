/* Check_Typed — a graded question answered by typing.
 *
 * data: { id, prompt }. The typed answer is sent to the server, which grades
 * it (accepting other spellings and equivalent numbers) and says what was
 * right. Needs checks-common.js.
 */
(function (global) {
  var Kit = global.PolymathCheckKit;
  var blocks = Kit.registry();

  function render(container, data) {
    if (!container) return;
    Kit.styles();
    container.innerHTML = '';
    var d = data || {};
    var card = Kit.el('div', 'card');
    card.appendChild(Kit.el('p', 'kicker', 'Check'));
    var prompt = Kit.el('label', 'prompt', d.prompt || '');
    var inputId = 'polymath_check_' + String(d.id || Math.random()).replace(/[^a-z0-9_]/gi, '');
    prompt.setAttribute('for', inputId);
    card.appendChild(prompt);
    var row = Kit.el('div', 'row');
    var input = Kit.el('input', 'input');
    input.id = inputId;
    input.type = 'text';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Your answer');
    var go = Kit.el('button', 'go', 'Check');
    go.type = 'button';
    row.appendChild(input);
    row.appendChild(go);
    card.appendChild(row);
    container.appendChild(card);

    function lock(result) {
      input.disabled = true;
      go.disabled = true;
      Kit.verdict(card, result);
    }

    function send() {
      var value = input.value.trim();
      if (!value) { input.focus(); return; }
      go.disabled = true;
      input.disabled = true;
      Kit.submit(d.id, value).then(lock).catch(function (err) {
        go.disabled = false;
        input.disabled = false;
        Kit.verdict(card, { correct: false, answer: '', rationale: err.message || 'That answer could not be saved. Try again.' });
      });
    }

    go.addEventListener('click', send);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });

    var before = Kit.previous(d.id);
    if (before) lock(before);
  }

  blocks.register('Check_Typed', { tag: 'Check_Typed', render: render, renderBlock: render, schema: null });
})(typeof window !== 'undefined' ? window : globalThis);
