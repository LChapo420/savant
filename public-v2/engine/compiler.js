/* Lesson layout compiler — the runtime half of Option 3: Modular Primitives.
 *
 * Blocks are generated code modules that register themselves here; a lesson is
 * a JSON plan of { block, data } entries that this compiler lays out in order.
 * The pedagogical content lives entirely in the plan's data — the modules are
 * instruments, the plan is the music.
 *
 *   <script src="/engine/compiler.js"></script>
 *   <script src="/engine/blocks/Sort_Challenge.js"></script>  (or LessonCompiler.load)
 *   LessonCompiler.compile(container, [
 *     { block: 'Concept_Card', data: {...} },
 *     { block: 'Sort_Challenge', data: {...} },
 *   ]);
 */
(function (global) {
  var Blocks = global.LessonBlocks = global.LessonBlocks || {
    modules: {},
    register: function (tag, mod) { this.modules[tag] = mod; },
    get: function (tag) { return this.modules[tag]; },
    all: function () {
      var out = [];
      for (var k in this.modules) if (this.modules.hasOwnProperty(k)) out.push(this.modules[k]);
      return out;
    },
  };

  var LessonCompiler = {
    /** The registry index, once loaded: { Tag: {id, name, category, description, file, schema} }. */
    registry: null,

    /**
     * Load the registry and every block module it names.
     *
     * Scripts are injected and awaited in order, so a page can `await
     * LessonCompiler.load(...)` and know the library is ready before it plans
     * anything. Block modules are cached by the browser like any static file.
     */
    load: function (registryUrl) {
      var self = this;
      return fetch(registryUrl)
        .then(function (r) { return r.json(); })
        .then(function (registry) {
          self.registry = registry;
          var base = registryUrl.replace(/[^/]*$/, '');
          var tags = Object.keys(registry);
          return tags.reduce(function (chain, tag) {
            return chain.then(function () {
              return self.inject(base + registry[tag].file.replace(/^\.\//, ''));
            });
          }, Promise.resolve());
        })
        .then(function () { return self.registry; });
    },

    /** Load one script, resolved when it has executed. */
    inject: function (src) {
      return new Promise(function (resolve) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = function () { resolve(); };
        s.onerror = function () { resolve(); }; // a missing block skips, not breaks
        document.head.appendChild(s);
      });
    },

    /**
     * The library-wide standard: render one block entry into one target.
     *
     * `blockData` is `{ block: 'Tag', data: {...} }`. A tag with no registered
     * module renders a quiet placeholder rather than throwing — a lesson plan
     * written against a block that has not been generated yet should degrade on
     * the page, not take the page down.
     */
    renderBlock: function (targetElement, blockData) {
      if (!targetElement || !blockData) return null;
      var mod = Blocks.get(blockData.block);
      if (!mod) {
        targetElement.innerHTML = '<div style="padding:14px 16px;border:1px dashed #334155;'
          + 'border-radius:10px;color:#94a3b8;font-size:.85rem">Block '
          + String(blockData.block || '(unnamed)').replace(/[<>&]/g, '')
          + ' is not in the library yet.</div>';
        return null;
      }
      mod.renderBlock(targetElement, blockData.data);
      return mod;
    },

    /**
     * Lay a lesson out: one section per plan entry, in order.
     *
     * Returns what rendered, so a caller can see a skipped block instead of
     * guessing where the lesson went short.
     */
    compile: function (container, plan) {
      var self = this;
      container.innerHTML = '';
      return (plan || []).map(function (entry, i) {
        var section = document.createElement('section');
        section.setAttribute('data-block', entry.block || '');
        section.style.margin = '0 0 18px';
        container.appendChild(section);
        var mod = self.renderBlock(section, entry);
        return { index: i, block: entry.block, rendered: !!mod };
      });
    },

    /** Every registered module, in registration order. */
    all: function () { return Blocks.all(); },
    get: function (tag) { return Blocks.get(tag); },
  };

  global.LessonCompiler = LessonCompiler;
})(typeof window !== 'undefined' ? window : globalThis);
