/* Check_Choice — a graded multiple-choice question.
 *
 * data: { id, prompt, choices: [string] }. No answer: the choice is sent to the
 * server, which grades it and says what was right. Needs checks-common.js.
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
    card.appendChild(Kit.el('p', 'prompt', d.prompt || ''));
    var list = Kit.el('div', 'options');
    var buttons = [];
    (d.choices || []).forEach(function (choice) {
      var b = Kit.el('button', 'opt', choice);
      b.type = 'button';
      b.addEventListener('click', function () { choose(choice, b); });
      buttons.push(b);
      list.appendChild(b);
    });
    card.appendChild(list);
    container.appendChild(card);

    function lock(choice, result) {
      buttons.forEach(function (b) {
        b.disabled = true;
        if (b.textContent === result.answer) b.classList.add('is-right');
        else if (b.textContent === choice && !result.correct) b.classList.add('is-wrong');
      });
      Kit.verdict(card, result);
    }

    function choose(choice, button) {
      buttons.forEach(function (b) { b.disabled = true; });
      button.setAttribute('aria-pressed', 'true');
      Kit.submit(d.id, choice).then(function (result) {
        lock(choice, result);
      }).catch(function (err) {
        buttons.forEach(function (b) { b.disabled = false; });
        Kit.verdict(card, { correct: false, answer: '', rationale: err.message || 'That answer could not be saved. Try again.' });
      });
    }

    var before = Kit.previous(d.id);
    if (before) lock(before.choice || null, before);
  }

  blocks.register('Check_Choice', { tag: 'Check_Choice', render: render, renderBlock: render, schema: null });
})(typeof window !== 'undefined' ? window : globalThis);
