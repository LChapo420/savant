/* The retention selection & testing loader — a real file on purpose: the app
 * runs `script-src 'self'` (middleware/security.js), so page logic must be a
 * served file or it never executes.
 *
 * What it does: lists every Ret_* block by name with selection checkboxes,
 * loads the whole family from its bundle in one request, renders each block
 * with its own test payload, and gives every card the testing tools —
 * Re-render, Render with empty data, Show test payload.
 */
(function () {
  var stage = document.getElementById('stage');
  var regEl = document.getElementById('regstate');
  var loadedEl = document.getElementById('loaded');
  var selcount = document.getElementById('selcount');
  var selnames = document.getElementById('selnames');

  var registry = null;
  var tags = [];
  var cards = {};
  var sandboxes = {};
  var selected = {};
  var t0 = performance.now();

  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&]/g, function (c) {
      return c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;';
    });
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (resolve) { setTimeout(function () { resolve({ timeout: true }); }, ms); }),
    ]);
  }

  function done(note) {
    regEl.textContent = note + ' in ' + ((performance.now() - t0) / 1000).toFixed(1) + 's';
  }

  function refreshSelection() {
    var picked = tags.filter(function (t) { return selected[t]; });
    selcount.textContent = String(picked.length);
    selnames.textContent = picked.length
      ? picked.map(function (t) { return registry[t].name; }).join(' · ')
      : 'none yet';
    tags.forEach(function (t) {
      var card = cards[t];
      if (card) card.classList.toggle('selected', !!selected[t]);
    });
  }

  function paint(tag) {
    var entry = registry[tag];
    var mod = window.LessonBlocks.get(tag);
    var sandbox = sandboxes[tag];
    var card = cards[tag];
    if (!sandbox || !card) return;
    var pre = card.querySelector('pre.data');

    function render(data) {
      try {
        window.LessonCompiler.renderBlock(sandbox, { block: tag, data: data });
      } catch (err) {
        sandbox.innerHTML = '<div class="broken">Render failed: '
          + esc(String((err && err.message) || err)) + '</div>';
      }
    }

    render((mod && mod.testPayload) || {});
    card.querySelector('[data-act="rerender"]').addEventListener('click', function () {
      render((mod && mod.testPayload) || {});
    });
    card.querySelector('[data-act="empty"]').addEventListener('click', function () {
      render({});
    });
    card.querySelector('[data-act="payload"]').addEventListener('click', function () {
      pre.hidden = !pre.hidden;
      if (!pre.hidden && !pre.textContent) {
        pre.textContent = JSON.stringify((mod && mod.testPayload) || entry.schema || {}, null, 2);
      }
    });
  }

  function paintAll() {
    tags.forEach(function (tag) {
      if (sandboxes[tag] && sandboxes[tag].querySelector('.pending')) paint(tag);
    });
  }

  (async function () {
    try {
      var res = await withTimeout(fetch('./retention/registry.json', { cache: 'no-store' }), 10000);
      registry = await res.json();
    } catch (err) {
      regEl.textContent = 'unreadable';
      stage.innerHTML = '<div class="card"><div class="sandbox"><div class="broken">Could not read '
        + './retention/registry.json — ' + esc(String((err && err.message) || err)) + '. Run '
        + '<b>node scripts/generate_blocks.js --family retention</b> and reload.</div></div></div>';
      return;
    }
    regEl.textContent = 'loaded';

    tags = Object.keys(registry);
    document.getElementById('count').textContent = String(tags.length);
    document.getElementById('idx-counts').textContent = tags.length + ' primitives · tick to build a set';

    // The selection index: one checkbox per primitive, named.
    var list = document.getElementById('idx-list');
    tags.forEach(function (tag) {
      var li = document.createElement('li');
      li.innerHTML = '<label><input type="checkbox" data-sel="' + esc(tag) + '">'
        + esc(registry[tag].name || tag) + '<span class="tag">' + esc(tag) + '</span></label>';
      list.appendChild(li);
      li.querySelector('input').addEventListener('change', function (e) {
        selected[tag] = e.target.checked;
        refreshSelection();
      });
    });

    // A named card per block: description, learner fit, live render, tools.
    tags.forEach(function (tag, i) {
      var entry = registry[tag];
      var card = document.createElement('div');
      card.className = 'card';
      card.id = 'block-' + tag;
      card.innerHTML =
        '<div class="card-head">'
        + '<div class="card-title"><span class="num">' + (i + 1) + '</span>' + esc(entry.name || tag) + '</div>'
        + '<div style="display:flex; gap:8px; align-items:center">'
        + '<span class="badge">' + esc(entry.category || 'Retention') + '</span>'
        + '<span class="chip">' + esc(tag) + '</span>'
        + '</div></div>'
        + '<div class="card-desc">' + esc(entry.description || '') + '</div>'
        + (entry.bestFor ? '<div class="card-fit"><b>Best suited for:</b> ' + esc(entry.bestFor) + '</div>' : '')
        + '<div class="sandbox"><div class="pending">loading module…</div></div>'
        + '<div class="tools">'
        + '<button class="tool" data-act="rerender">Re-render</button>'
        + '<button class="tool" data-act="empty">Render with empty data</button>'
        + '<button class="tool" data-act="payload">Show test payload</button>'
        + '</div>'
        + '<pre class="data" hidden></pre>';
      stage.appendChild(card);
      cards[tag] = card;
      sandboxes[tag] = card.querySelector('.sandbox');
    });
    refreshSelection();

    document.getElementById('copy-sel').addEventListener('click', function () {
      var picked = tags.filter(function (t) { return selected[t]; });
      var text = picked.join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
      selnames.textContent = picked.length ? 'copied: ' + picked.join(', ') : 'none selected';
    });

    // One request for the whole family: the bundle registers every module the
    // moment it parses. Per-file loading stays only as a fallback, and every
    // wait has a deadline — nothing here loads forever.
    var bundleOk = false;
    try {
      await withTimeout(window.LessonCompiler.inject('./retention/bundle.js'), 12000);
      bundleOk = tags.every(function (tag) { return !!window.LessonBlocks.get(tag); });
    } catch (e) { bundleOk = false; }

    if (bundleOk) {
      paintAll();
      loadedEl.textContent = String(tags.length);
      done('all loaded');
    } else {
      await Promise.all(tags.map(function (tag) {
        // The registry's `file` is relative to the registry's own folder
        // (./retention/), not to this page (/engine/) — say so explicitly.
        return withTimeout(window.LessonCompiler.inject('./retention/' + registry[tag].file.replace(/^\.\//, '')), 8000).then(function () {
          if (window.LessonBlocks.get(tag)) paint(tag);
          else sandboxes[tag].innerHTML = '<div class="broken">Module did not load: '
            + esc(registry[tag].file) + '</div>';
          loadedEl.textContent = String(Number(loadedEl.textContent || 0) + 1);
        });
      }));
      paintAll();
      done('all loaded');
    }

    setTimeout(function () {
      paintAll();
      if (regEl.textContent === 'loaded') done('stopped at deadline');
    }, 25000);
  })();
})();
