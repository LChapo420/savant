/* The showcase loader — a real file on purpose.
 *
 * The app sends `Content-Security-Policy: script-src 'self'` (see
 * middleware/security.js): an inline <script> on a page is silently killed by
 * every real browser. The first version of this page kept its loader inline and
 * rendered exactly nothing in the browser while every headless check passed —
 * headless DOMs do not enforce CSP. All page logic lives in served files.
 */
(function () {
  var stage = document.getElementById('stage');
  var regEl = document.getElementById('regstate');
  var loadedEl = document.getElementById('loaded');

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

  var registry = null;
  var tags = [];
  var cards = {};
  var sandboxes = {};
  var t0 = performance.now();

  function done(note) {
    var secs = ((performance.now() - t0) / 1000).toFixed(1);
    regEl.textContent = note + ' in ' + secs + 's';
  }

  // One standard call per block, with its own error card: a broken block names
  // itself instead of taking the page down with it.
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
    // 1. The registry: one small fetch, and the complete named index paints
    //    immediately — 107 names on screen before a single module has loaded.
    try {
      var res = await withTimeout(fetch('./registry.json', { cache: 'no-store' }), 10000);
      registry = await res.json();
    } catch (err) {
      regEl.textContent = 'unreadable';
      stage.innerHTML = '<div class="card"><div class="sandbox"><div class="broken">Could not read '
        + './registry.json — ' + esc(String((err && err.message) || err)) + '. Run '
        + '<b>node scripts/generate_blocks.js</b> and reload.</div></div></div>';
      return;
    }
    regEl.textContent = 'loaded';

    tags = Object.keys(registry);
    document.getElementById('count').textContent = String(tags.length);

    var order = ['Foundational', 'Assessment', 'Game', 'Utility'];
    var counts = {};
    tags.forEach(function (t) {
      var c = registry[t].category || 'Utility';
      counts[c] = (counts[c] || 0) + 1;
    });
    document.getElementById('idx-counts').textContent = order.map(function (c) {
      return (counts[c] || 0) + ' ' + c;
    }).join(' · ');

    var groups = document.getElementById('idx-groups');
    order.forEach(function (category) {
      var mine = tags.filter(function (t) { return (registry[t].category || 'Utility') === category; });
      if (!mine.length) return;
      var g = document.createElement('div');
      g.className = 'idx-group';
      g.innerHTML = '<h3>' + esc(category) + ' — ' + mine.length + '</h3><ul class="idx-list"></ul>';
      var list = g.querySelector('ul');
      mine.forEach(function (tag) {
        var li = document.createElement('li');
        li.innerHTML = '<a href="#block-' + esc(tag) + '">' + esc(registry[tag].name || tag)
          + '<span class="tag">' + esc(tag) + '</span></a>';
        list.appendChild(li);
      });
      groups.appendChild(g);
    });

    // 2. A named card per block, all at once — each with its own sandbox.
    tags.forEach(function (tag, i) {
      var entry = registry[tag];
      var card = document.createElement('div');
      card.className = 'card';
      card.id = 'block-' + tag;
      card.innerHTML =
        '<div class="card-head">'
        + '<div class="card-title"><span class="num">' + (i + 1) + '</span>' + esc(entry.name || tag) + '</div>'
        + '<div style="display:flex; gap:8px; align-items:center">'
        + '<span class="badge">' + esc(entry.category || '') + '</span>'
        + '<span class="chip">' + esc(tag) + '</span>'
        + '</div></div>'
        + '<div class="card-desc">' + esc(entry.description || '') + '</div>'
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

    // 3. ONE request for the whole library: the bundle registers every module
    //    the moment it parses. 107 separate scripts is 107 round trips the
    //    browser queues a few at a time — minutes of "loading" for what the
    //    bundle does in one read. Per-file loading remains only as a fallback,
    //    and every wait has a deadline: nothing on this page loads forever.
    var bundleOk = false;
    try {
      await withTimeout(window.LessonCompiler.inject('./bundle.js'), 12000);
      bundleOk = tags.every(function (tag) { return !!window.LessonBlocks.get(tag); });
    } catch (e) { bundleOk = false; }

    if (bundleOk) {
      paintAll();
      loadedEl.textContent = String(tags.length);
      done('all loaded');
    } else {
      await Promise.all(tags.map(function (tag) {
        return withTimeout(window.LessonCompiler.inject(registry[tag].file), 8000).then(function () {
          if (window.LessonBlocks.get(tag)) paint(tag);
          else sandboxes[tag].innerHTML = '<div class="broken">Module did not load: '
            + esc(registry[tag].file) + '</div>';
          loadedEl.textContent = String(Number(loadedEl.textContent || 0) + 1);
        });
      }));
      paintAll();
      done('all loaded');
    }

    // Absolute deadline: whatever is unpainted at 25s is named and closed out,
    // so the page can never sit on "loading" again.
    setTimeout(function () {
      paintAll();
      if (regEl.textContent === 'loaded') done('stopped at deadline');
    }, 25000);
  })();
})();
