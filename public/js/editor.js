/* A writing surface, for the essay checkpoint.
 *
 * A contenteditable region with a formatting toolbar, the shortcuts that go with
 * it, and undo — built on `document.execCommand`.
 *
 * Why that and not a library. The content security policy is `script-src 'self'`
 * with no `unsafe-eval`, so a third-party editor would have to be vendored into
 * /public/js/ *and* emit no `new Function`, with no build step to manage either.
 * `execCommand` is a DOM call rather than a string-eval, so it works under that
 * policy, and it is the only route to a working toolbar, selection preservation
 * and undo without first building an editor. It is deprecated and works
 * everywhere; if this app ever grows a bundler, `create` is the seam to swap for
 * ProseMirror or TipTap, and nothing else here depends on which it is.
 *
 * Events are wired with addEventListener and never with an on* attribute, which
 * is the house rule the policy forces — see the note at the top of app.js.
 */
(function () {
  const DOC = 'document';

  /**
   * Each control, in the order it appears. `state` is the name execCommand uses
   * to report whether the command is currently on, which is how the button
   * knows to look pressed while the caret is inside bold text.
   */
  const CONTROLS = [
    { kind: 'mark', command: 'bold', icon: 'bold', title: 'Bold (Ctrl+B)', key: 'b' },
    { kind: 'mark', command: 'italic', icon: 'italic', title: 'Italic (Ctrl+I)', key: 'i' },
    { kind: 'mark', command: 'underline', icon: 'underline', title: 'Underline (Ctrl+U)', key: 'u' },
    { kind: 'mark', command: 'strikeThrough', icon: 'strike', title: 'Strikethrough (Ctrl+Shift+X)', key: 'x', shift: true },
    { kind: 'gap' },
    { kind: 'block', command: 'insertUnorderedList', icon: 'list', title: 'Bulleted list' },
    { kind: 'block', command: 'insertOrderedList', icon: 'list-ordered', title: 'Numbered list' },
    { kind: 'gap' },
    { kind: 'block', command: 'formatBlock', value: 'h2', icon: 'layers', title: 'Heading', label: 'H' },
    { kind: 'block', command: 'formatBlock', value: 'p', icon: 'edit', title: 'Body text', label: 'P' },
    { kind: 'gap' },
    { kind: 'align', command: 'justifyLeft', icon: 'align-left', title: 'Align left' },
    { kind: 'align', command: 'justifyCenter', icon: 'align-center', title: 'Align centre' },
    { kind: 'align', command: 'justifyRight', icon: 'align-right', title: 'Align right' },
    { kind: 'gap' },
    { kind: 'history', command: 'undo', icon: 'undo', title: 'Undo (Ctrl+Z)' },
    { kind: 'history', command: 'redo', icon: 'redo', title: 'Redo (Ctrl+Shift+Z)' },
  ];

  /**
   * Build an editor inside `host`.
   *
   * `opts.value` seeds it, `opts.onInput` fires on every change, and the
   * returned handles are `getHtml`, `getText`, `setHtml`, `saveCaret` and
   * `restoreCaret` — the last two because grading re-renders this whole
   * surface, and a writer who has just been told what to fix should still be
   * looking at the sentence they were editing.
   */
  function create(host, opts) {
    const options = opts || {};
    host.innerHTML = '';

    const wrap = App.el('div', { class: 'editor' });
    const toolbar = App.el('div', { class: 'editor-toolbar', role: 'toolbar', 'aria-label': 'Formatting' });
    const surface = App.el('div', {
      class: 'editor-surface',
      contenteditable: 'true',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': 'Your writing',
      spellcheck: 'true',
    });
    // The surface is empty but editable, so a browser that has decided to
    // "help" by disabling an empty contenteditable gets overruled.
    if (options.value) surface.innerHTML = options.value;

    wrap.appendChild(toolbar);
    wrap.appendChild(surface);
    host.appendChild(wrap);

    const buttons = [];

    for (const control of CONTROLS) {
      if (control.kind === 'gap') {
        toolbar.appendChild(App.el('span', { class: 'editor-gap' }));
        continue;
      }
      const label = control.label
        ? `<span class="editor-label">${control.label}</span>`
        : window.icon(control.icon);
      const button = App.el('button', {
        class: 'editor-btn',
        type: 'button',
        title: control.title,
        'aria-label': control.title,
        'data-command': control.command,
        tabindex: '-1',
      }, label);
      // mousedown would move focus out of the surface and collapse the
      // selection before the command ran, which is the classic reason a
      // contenteditable toolbar loses the selection. preventDefault keeps it.
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        surface.focus();
        run(control);
      });
      toolbar.appendChild(button);
      buttons.push({ button, control });
    }

    function run(control) {
      try {
        if (control.kind === 'history' || control.command === 'formatBlock') {
          document.execCommand(control.command, false, control.value || null);
        } else {
          document.execCommand(control.command, false, null);
        }
      } catch {
        // A command the browser has dropped is not worth breaking a page over.
        // The text is still there and the autosave still runs.
      }
      sync();
      if (options.onInput) options.onInput();
    }

    function sync() {
      for (const { button, control } of buttons) {
        if (control.kind === 'gap') continue;
        let on = false;
        try {
          on = !!document.queryCommandState(control.command);
        } catch {
          on = false;
        }
        button.classList.toggle('is-on', on);
      }
    }

    surface.addEventListener('input', () => {
      if (options.onInput) options.onInput();
    });
    // The caret moving is the only signal that the pressed state is stale.
    for (const type of ['keyup', 'mouseup', 'focus']) {
      surface.addEventListener(type, () => setTimeout(sync, 0));
    }
    // A paste carrying a stylesheet or a script is not going to become prose,
    // and the server filters it anyway — but a plain-text paste should keep its
    // line breaks, which the default handling throws away.
    surface.addEventListener('paste', (event) => {
      const text = event.clipboardData && event.clipboardData.getData('text/plain');
      if (text === undefined || text === null) return;
      event.preventDefault();
      document.execCommand('insertText', false, text);
      sync();
      if (options.onInput) options.onInput();
    });

    // Shortcuts. Every one needs preventDefault, or the browser's own dialog for
    // the same chord opens instead of the command running.
    const KEYS = {
      b: 'bold',
      i: 'italic',
      u: 'underline',
    };
    surface.addEventListener('keydown', (event) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) {
        // Tab indents inside a list and leaves the editor everywhere else, which
        // is the difference between a list that can be nested and one that cannot.
        if (event.key === 'Tab' && inList()) {
          event.preventDefault();
          document.execCommand(event.shiftKey ? 'outdent' : 'indent', false, null);
          sync();
          if (options.onInput) options.onInput();
        }
        return;
      }

      const key = String(event.key || '').toLowerCase();
      if (event.altKey) {
        const map = { 1: 'h3', 2: 'h2', 3: 'p' };
        if (map[key]) {
          event.preventDefault();
          document.execCommand('formatBlock', false, map[key]);
          sync();
          if (options.onInput) options.onInput();
        }
        return;
      }

      let command = null;
      if (event.shiftKey && key === 'x') command = 'strikeThrough';
      else if (event.shiftKey && key === 'z') command = 'redo';
      else if (KEYS[key]) command = KEYS[key];
      else if (key === 'z') command = 'undo';
      if (!command) return;
      event.preventDefault();
      try { document.execCommand(command, false, null); } catch { /* dropped by the browser */ }
      sync();
      if (options.onInput) options.onInput();
    });

    function inList() {
      try {
        return document.queryCommandState('insertUnorderedList')
          || document.queryCommandState('insertOrderedList');
      } catch {
        return false;
      }
    }

    let caret = null;

    return {
      getHtml: () => surface.innerHTML,
      getText: () => (surface.textContent || '').replace(/ /g, ' '),
      setHtml: (html) => { surface.innerHTML = html || ''; },
      focus: () => surface.focus(),
      sync,
      /**
       * Where the writer was. A Range cannot be trusted across a re-render, so
       * this stores the plain text around the caret and `restoreCaret` finds it
       * again in the new markup.
       */
      saveCaret: () => {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (!surface.contains(range.startContainer)) return;
        const before = range.cloneRange();
        before.selectNodeContents(surface);
        before.setEnd(range.startContainer, range.startOffset);
        caret = {
          offset: (before.toString() || '').length,
          scroll: surface.scrollTop,
        };
      },
      restoreCaret: () => {
        if (!caret) return;
        surface.focus();
        const walker = document.createTreeWalker(surface, NodeFilter.SHOW_TEXT, null);
        let seen = 0;
        let node = walker.nextNode();
        let target = null;
        let remaining = caret.offset;
        while (node) {
          const next = seen + (node.nodeValue || '').length;
          if (next >= remaining) { target = { node, offset: remaining - seen }; break; }
          seen = next;
          node = walker.nextNode();
        }
        const selection = window.getSelection();
        if (!selection) return;
        if (target) {
          const range = document.createRange();
          range.setStart(target.node, Math.min(target.offset, (target.node.nodeValue || '').length));
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        surface.scrollTop = caret.scroll || 0;
        sync();
        caret = null;
      },
      /** The element itself, for a caller that needs to listen outside `create`. */
      surface,
    };
  }

  window.Editor = { create };
})();
