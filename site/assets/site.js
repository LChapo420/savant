/* Savant public site: theme toggle, socials and contact links from config.js,
 * the grade strips, and the four forms (updates, beta, investors, removal).
 *
 * The beta application is two steps (email and the two ticks first, saved at once; then
 * name, role, subjects and an optional "why"), in the hero and in the section lower down.
 * A sticky bar on phones jumps back to the hero form. After applying: thanks and a share line.
 *
 * Forms post JSON to server.js when it answers /api/health. When it does not
 * (a static host, or the file opened from disk), each form opens the visitor's
 * email app with the same details instead. Without JavaScript the forms still
 * post normally to server.js. No cookies, no ad trackers, no third-party requests.
 *
 * Visit statistics (see privacy.html, "Visit statistics"): one small beacon per
 * page view to our own server, then batches of interaction events from
 * assets/track.js. In the UK, EU, EEA and Switzerland the server asks first (the
 * notice at the bottom); until the visitor allows it, and with Global Privacy
 * Control, it keeps anonymous counts only. What anyone types is never recorded.
 */
(function () {
  'use strict';

  var CFG = window.SAVANT_SITE || {};
  var TRACK = null; // the visit-statistics recorder, set up at the end of this file
  function tk(method, a, b, c) { if (TRACK && TRACK[method]) { try { TRACK[method](a, b, c); } catch (e) { /* never break the page */ } } }
  var isFilled = function (v) { return typeof v === 'string' && v.length > 0 && v.indexOf('REPLACE_') !== 0; };
  var emailFor = function (kind) {
    var specific = kind === 'investors' ? CFG.investorEmail : kind === 'privacy' ? CFG.privacyEmail : '';
    if (isFilled(specific)) return specific;
    return isFilled(CFG.contactEmail) ? CFG.contactEmail : '';
  };
  var TICK = '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path pathLength="1" d="M5.2 17.6c2.3 1.3 4.6 3.7 6.5 7.2C15 17 19.9 10.6 27 5.4"/></svg>';

  /* ── theme ─────────────────────────────────────────────────────────── */
  function currentTheme() {
    var set = document.documentElement.getAttribute('data-theme');
    if (set === 'light' || set === 'dark') return set;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function labelTheme(btn) {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    btn.title = 'Switch to ' + next + ' theme';
  }
  document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
    labelTheme(btn);
    btn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('savant-site-theme', next); } catch (e) { /* not saved; fine */ }
      labelTheme(btn);
    });
    // Keep the label right when the system theme changes while the page is open.
    var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { labelTheme(btn); });
  });

  /* ── socials and contact links ─────────────────────────────────────── */
  // The platforms' own glyphs (24 x 24), drawn inline so nothing is fetched
  // from them. TikTok, X and YouTube paths after Simple Icons (CC0).
  var SVG_OPEN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">';
  var ICONS = {
    instagram: '<rect class="stroke" x="2.75" y="2.75" width="18.5" height="18.5" rx="5.25"/><circle class="stroke" cx="12" cy="12" r="4.35"/><circle cx="17.6" cy="6.4" r="1.3"/>',
    tiktok: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
    x: '<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>',
    youtube: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
  };
  function iconKey(s) {
    var k = String(s.icon || s.name || '').toLowerCase();
    if (ICONS[k]) return k;
    if (/^x\b|twitter/.test(k)) return 'x';
    if (/insta/.test(k)) return 'instagram';
    if (/tik ?tok/.test(k)) return 'tiktok';
    if (/you ?tube/.test(k)) return 'youtube';
    return '';
  }
  document.querySelectorAll('[data-socials]').forEach(function (list) {
    var pending = 0;
    list.classList.add('socials');
    (CFG.socials || []).forEach(function (s) {
      var li = document.createElement('li');
      var key = iconKey(s);
      var live = isFilled(s.url) && /^https:\/\//.test(s.url);
      var el = document.createElement(live ? 'a' : 'span');
      el.className = 'social' + (live ? '' : ' is-placeholder');
      if (live) { el.href = s.url; el.rel = 'me noopener'; }
      el.title = live ? s.name : s.name + ': link to come';
      if (key) el.innerHTML = SVG_OPEN + ICONS[key] + '</svg>';
      var label = document.createElement('span');
      if (key) label.className = 'visually-hidden';
      label.textContent = live ? 'Savant on ' + s.name : s.name + ': link to come';
      el.appendChild(label);
      if (!live) pending += 1;
      li.appendChild(el);
      list.appendChild(li);
    });
    if (pending) {
      var note = document.createElement('p');
      note.className = 'socials-note';
      note.textContent = pending === (CFG.socials || []).length ? 'Accounts open soon.' : 'More accounts open soon.';
      list.after(note);
    }
  });
  // Contact links are written into the HTML (so they work without JavaScript)
  // and kept in step with config.js here.
  document.querySelectorAll('[data-mailto]').forEach(function (el) {
    var addr = emailFor(el.getAttribute('data-mailto'));
    if (addr) {
      var a = el.tagName === 'A' ? el : document.createElement('a');
      a.href = 'mailto:' + addr;
      a.textContent = el.getAttribute('data-label') || addr;
      if (a !== el) { a.setAttribute('data-mailto', el.getAttribute('data-mailto')); el.replaceWith(a); }
    } else {
      var span = document.createElement('span');
      span.className = 'placeholder';
      span.textContent = el.getAttribute('data-placeholder') || 'contact email to come';
      el.replaceWith(span);
    }
  });

  /* ── creator link: /beta?ref=<code> (or ?utm_source=) fills the beta forms' hidden field ── */
  var REF = ''; // the code, also sent with the two-step beta application (hero and lower form)
  (function () {
    var fields = document.querySelectorAll('form[data-form="beta"] input[name="ref"]');
    if (!fields.length) return;
    var clean = function (v) { return String(v || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').slice(0, 40); };
    var code = clean(fields[0].value);
    try {
      var sp = new URLSearchParams(location.search);
      code = code || clean(sp.get('ref')) || clean(sp.get('utm_source'));
      // Kept for this tab, so a reload or a hop to another page and back keeps the link.
      if (code) sessionStorage.setItem('savant-ref', code); else code = clean(sessionStorage.getItem('savant-ref'));
    } catch (e) { /* storage blocked: the URL still works */ }
    REF = code;
    fields.forEach(function (f) { f.value = code; });
  })();

  /* ── creators page: full link text and copy buttons ── */
  document.querySelectorAll('[data-origin-text]').forEach(function (el) {
    el.textContent = location.origin + el.getAttribute('data-origin-text');
  });
  document.querySelectorAll('[data-copy-from]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var src = document.getElementById(btn.getAttribute('data-copy-from'));
      if (!src || !navigator.clipboard) return;
      navigator.clipboard.writeText(src.textContent.trim()).then(function () {
        var was = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = was; }, 1500);
      }, function () { /* copy blocked: the text is selectable */ });
    });
  });

  /* ── grade strips: one bar per grade ───────────────────────────────── */
  // Each bar's height is how many levels that grade has in the base curriculum
  // (assets/grade-levels.js, generated from the app's config/curriculum.js). Each
  // subject's strip is scaled to its own largest grade, because level counts differ
  // tenfold between subjects (Spanish grades run 95-256 levels, IQ 1,522-3,120) and
  // one shared scale would flatten the smaller subjects. Hovering a bar shows its
  // count. Strips share the column width of the longest subject, so lengths compare.
  var LEVELS = window.SAVANT_GRADE_LEVELS || {};
  function stripHeights(counts, n, minH, maxH) {
    if (!counts || counts.length !== n) {
      var flat = [];
      for (var j = 0; j < n; j++) flat.push(Math.round((minH + maxH) / 2));
      return flat;
    }
    var top = Math.max.apply(null, counts);
    return counts.map(function (c) { return Math.max(minH, Math.round((c / top) * maxH)); });
  }
  var strips = document.querySelectorAll('[data-grades]');
  var maxGrades = 0;
  strips.forEach(function (strip) { maxGrades = Math.max(maxGrades, parseInt(strip.getAttribute('data-grades'), 10) || 0); });
  strips.forEach(function (strip) {
    var n = parseInt(strip.getAttribute('data-grades'), 10) || 0;
    var row = strip.closest('[data-subject]');
    var counts = row ? LEVELS[row.getAttribute('data-subject')] : null;
    var heights = stripHeights(counts, n, 3, 22);
    strip.textContent = '';
    // CSSOM writes are allowed by the page's CSP (style-src 'self'); style="" attributes are not.
    strip.style.gridTemplateColumns = 'repeat(' + Math.max(maxGrades, n, 1) + ', minmax(0, 1fr))';
    heights.forEach(function (h, i) {
      var bar = document.createElement('i');
      bar.style.height = h + 'px';
      if (counts && counts[i]) bar.title = 'Grade ' + (i + 1) + ': ' + counts[i].toLocaleString() + ' levels';
      strip.appendChild(bar);
    });
  });

  /* ── forms ─────────────────────────────────────────────────────────── */
  var EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
  var FORMS = {
    updates: {
      to: 'contact', subject: 'Savant updates sign-up',
      rules: { email: 'email', consent: 'tick' },
      tick: { consent: 'Tick this so we can send you updates.' },
      done: function (d) { return ['You are on the list.', 'We will email ' + d.email + ' when there is news.']; },
    },
    // The beta form, whole: what the email fallback lists and what a post without JavaScript carries.
    beta: {
      to: 'contact', subject: 'Savant beta application',
      rules: { email: 'email', name: 'name', role: 'role', interests_other: 'other', why: 'why', age_ok: 'tick', consent: 'tick' },
      tick: {
        age_ok: 'Please confirm this to apply. Under 13? Ask a parent to apply for you.',
        consent: 'Tick this so we can email you about the beta.',
      },
      done: function (d) { return ['Application received.', 'Thanks, ' + d.name + '. Every application is read by hand. If there is a place, we will email ' + d.email + '.']; },
    },
    // Its two steps, checked one at a time in the browser (and again in server.js).
    beta1: {
      rules: { email: 'email', age_ok: 'tick', consent: 'tick' },
      tick: {
        age_ok: 'Please confirm this to apply. Under 13? Ask a parent to apply for you.',
        consent: 'Tick this so we can email you about the beta.',
      },
    },
    beta2: { rules: { name: 'name', role: 'role', interests_other: 'other', why: 'why' } },
    investors: {
      to: 'investors', subject: 'Savant investor enquiry',
      rules: { name: 'name', email: 'email', firm: 'firm', message: 'message' },
      done: function () { return ['Note received.', 'Thank you. The founder will reply by email.']; },
    },
    forget: {
      to: 'privacy', subject: 'Remove my details from Savant',
      rules: { email: 'email' },
      done: function (d) { return ['Done.', 'If ' + d.email + ' was on any Savant list, it has been removed.']; },
    },
  };
  var LABELS = { email: 'Email', name: 'Name', role: 'Role', interests: 'Wants to learn', interests_other: 'Something else', source: 'Form', ref: 'Link tag', why: 'Why you should pick me', age_ok: 'Age confirmed', consent: 'OK to email me', firm: 'Firm', message: 'Message' };
  var WHY_MAX = 1000; // "Why should we pick you?" is optional; this is only the limit
  var OTHER_MAX = 120;

  function check(kind, data) {
    var spec = FORMS[kind];
    var errors = {};
    Object.keys(spec.rules).forEach(function (field) {
      var rule = spec.rules[field];
      var v = data[field];
      if (rule === 'email') {
        if (!v) errors[field] = 'Enter your email address.';
        else if (v.length > 254 || !EMAIL_RE.test(v)) errors[field] = 'That does not look like an email address. Check for a typo.';
      } else if (rule === 'name') {
        if (!v) errors[field] = kind === 'beta' ? 'Enter a name or nickname.' : 'Enter your name.';
        else if (v.length > 80) errors[field] = 'Keep this under 80 characters.';
      } else if (rule === 'role') {
        if (['learner', 'parent', 'teacher'].indexOf(v) < 0) errors[field] = 'Choose learner, parent or teacher.';
      } else if (rule === 'tick') {
        if (v !== 'yes') errors[field] = spec.tick[field];
      } else if (rule === 'why') {
        if (v && v.length > WHY_MAX) errors[field] = 'Keep this under 1,000 characters.';
      } else if (rule === 'other') {
        if (v && v.length > OTHER_MAX) errors[field] = 'Keep this under ' + OTHER_MAX + ' characters.';
      } else if (rule === 'firm') {
        if (v && v.length > 120) errors[field] = 'Keep this under 120 characters.';
      } else if (rule === 'message') {
        if (!v || v.length < 10) errors[field] = 'Write a short note, at least 10 characters.';
        else if (v.length > 4000) errors[field] = 'Keep this under 4,000 characters.';
      }
    });
    return errors;
  }

  function read(form) {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return;
      if (el.name === 'interests') { (data.interests = data.interests || []).push(el.value); return; } // the subject chips
      data[el.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
    });
    if (data.email) data.email = data.email.toLowerCase();
    return data;
  }

  function errorSlot(form, field) {
    return form.querySelector('[data-error-for="' + field + '"]');
  }
  function controlsFor(form, field) {
    return Array.prototype.filter.call(form.elements, function (el) { return el.name === field; });
  }
  function clearErrors(form) {
    form.querySelectorAll('[data-error-for]').forEach(function (p) { p.hidden = true; p.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
  }
  function showErrors(form, errors) {
    var first = null;
    var fname = window.SavantTrack ? window.SavantTrack.formName(form) : '';
    Object.keys(errors).forEach(function (field) {
      // Visit statistics: which field and what kind of error (e.g. why / too-short), never the value.
      if (fname && window.SavantTrack) tk('formError', fname, field, window.SavantTrack.errorCode(errors[field]));
      var slot = errorSlot(form, field);
      if (slot) { slot.textContent = errors[field]; slot.hidden = false; }
      controlsFor(form, field).forEach(function (el) {
        el.setAttribute('aria-invalid', 'true');
        if (!first) first = el;
      });
    });
    if (first) first.focus();
    return first;
  }
  function setStatus(form, text, isError) {
    var s = form.querySelector('.form-status');
    if (!s) return;
    s.textContent = text || '';
    s.classList.toggle('is-error', !!isError);
  }
  function shareBlock() {
    var url = location.origin + '/';
    var wrap = document.createElement('div');
    wrap.className = 'share';
    var p = document.createElement('p');
    p.appendChild(document.createTextNode("Know someone who'd want this? Share "));
    var b = document.createElement('b');
    b.textContent = 'savantedu.com';
    p.appendChild(b);
    wrap.appendChild(p);
    var row = document.createElement('div');
    row.className = 'share-actions';
    var state = document.createElement('span');
    state.className = 'share-state';
    state.setAttribute('role', 'status');
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn';
    copy.setAttribute('data-track', 'share-copy');
    copy.textContent = 'Copy link';
    copy.addEventListener('click', function () {
      var ok = function () { state.textContent = 'Link copied.'; };
      var fallback = function () {
        var t = document.createElement('textarea');
        t.value = url; t.setAttribute('readonly', ''); t.className = 'visually-hidden';
        document.body.appendChild(t); t.select();
        try { if (document.execCommand('copy')) ok(); else state.textContent = 'Copy this: ' + url; } catch (e) { state.textContent = 'Copy this: ' + url; }
        t.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, fallback); else fallback();
    });
    row.appendChild(copy);
    if (navigator.share) {
      var sh = document.createElement('button');
      sh.type = 'button';
      sh.className = 'btn';
      sh.setAttribute('data-track', 'share-native');
      sh.textContent = 'Share…';
      sh.addEventListener('click', function () { navigator.share({ title: 'Savant', text: 'Savant learns how you learn, then teaches you any subject your best way.', url: url }).catch(function () {}); });
      row.appendChild(sh);
    }
    row.appendChild(state);
    wrap.appendChild(row);
    return wrap;
  }

  function done(form, lines, extra, opts) {
    opts = opts || {};
    var box = document.createElement('div');
    box.className = 'form-done is-drawn' + (form.classList.contains('form-panel') ? ' form-panel' : '');
    box.tabIndex = -1;
    box.setAttribute('role', 'status');
    box.innerHTML = TICK;
    var text = document.createElement('div');
    var h = document.createElement('h3');
    h.textContent = lines[0];
    var p = document.createElement('p');
    p.textContent = lines[1];
    text.appendChild(h);
    text.appendChild(p);
    if (extra) {
      var p2 = document.createElement('p');
      p2.className = 'form-note';
      p2.textContent = extra;
      text.appendChild(p2);
    }
    if (opts.share) text.appendChild(shareBlock());
    box.appendChild(text);
    form.replaceWith(box);
    if (opts.focus !== false) box.focus();
    return box;
  }

  // Which way the forms send: 'server' or 'mailto'. Decided once, on first need.
  var base = (CFG.formEndpoint && CFG.formEndpoint !== 'mailto') ? String(CFG.formEndpoint).replace(/\/+$/, '') : '';
  var modePromise = null;
  function mode() {
    if (modePromise) return modePromise;
    if (CFG.formEndpoint === 'mailto' || location.protocol === 'file:') {
      modePromise = Promise.resolve('mailto');
      return modePromise;
    }
    modePromise = new Promise(function (resolve) {
      var finished = false;
      var timer = setTimeout(function () { if (!finished) { finished = true; resolve('mailto'); } }, 3500);
      fetch(base + '/api/health', { method: 'GET', cache: 'no-store', credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (!finished) { finished = true; clearTimeout(timer); resolve(j && j.ok ? 'server' : 'mailto'); } })
        .catch(function () { if (!finished) { finished = true; clearTimeout(timer); resolve('mailto'); } });
    });
    return modePromise;
  }

  function mailto(form, kind, data) {
    var spec = FORMS[kind];
    var to = emailFor(spec.to);
    if (!to) {
      setStatus(form, 'Sign-ups are not open on this copy of the site yet. Please check back soon.', true);
      return;
    }
    var lines = Object.keys(spec.rules).map(function (f) {
      var v = data[f];
      return LABELS[f] + ': ' + (Array.isArray(v) ? v.join(', ') : (v || ''));
    });
    var href = 'mailto:' + to + '?subject=' + encodeURIComponent(spec.subject) + '&body=' + encodeURIComponent(lines.join('\n') + '\n');
    window.location.href = href;
    done(form, ['Almost done: press send in your email app.',
      'Your email app should have opened with the details filled in. Nothing is sent until you send it.'],
      'Nothing opened? Write to ' + to + ' instead.');
  }

  function send(form, kind, data) {
    var btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    setStatus(form, 'Sending…');
    var body = {};
    Object.keys(data).forEach(function (k) { body[k] = data[k]; });
    body.elapsed = Math.round(performance.now() - (form._shownAt || 0));
    return fetch(base + '/api/' + kind, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; });
    }).then(function (res) {
      if (btn) btn.disabled = false;
      if (res.status >= 200 && res.status < 300 && res.json.ok) {
        if (window.SavantTrack) tk('formDone', window.SavantTrack.formName(form));
        done(form, FORMS[kind].done(data));
      } else if (res.status === 400 && res.json.errors) {
        setStatus(form, '');
        showErrors(form, res.json.errors);
      } else if (res.status === 429) {
        setStatus(form, 'Too many tries from this connection. Please wait a few minutes and try again.', true);
      } else if (res.status === 404 || res.status === 405 || res.status >= 500) {
        mailto(form, kind, data);
      } else {
        setStatus(form, (res.json && res.json.error) || 'That did not go through. Please try again.', true);
      }
    }).catch(function () {
      if (btn) btn.disabled = false;
      mailto(form, kind, data);
    });
  }

  document.querySelectorAll('form[data-form]').forEach(function (form) {
    var kind = form.getAttribute('data-form');
    if (!FORMS[kind] || kind === 'beta') return; // the beta forms are the two-step ones, set up below
    form.noValidate = true; // our messages replace the browser's bubbles
    form._shownAt = performance.now();
    if (base) form.action = base + '/api/' + kind;

    // Live character count under text areas that have one.
    form.querySelectorAll('[data-count-for]').forEach(function (meta) {
      var field = form.elements[meta.getAttribute('data-count-for')];
      if (!field) return;
      var max = parseInt(field.getAttribute('maxlength'), 10) || 0;
      var min = parseInt(field.getAttribute('minlength'), 10) || 0;
      var update = function () {
        var n = field.value.trim().length;
        meta.textContent = min && n < min ? n + ' of at least ' + min : n + ' / ' + max.toLocaleString('en');
        meta.classList.toggle('is-over', max > 0 && n > max);
      };
      field.addEventListener('input', update);
      update();
    });

    form.addEventListener('input', function (e) {
      var el = e.target;
      if (el.getAttribute('aria-invalid') === 'true') {
        controlsFor(form, el.name).forEach(function (c) { c.removeAttribute('aria-invalid'); });
        var slot = errorSlot(form, el.name);
        if (slot) { slot.hidden = true; slot.textContent = ''; }
        // Once every error is fixed, drop the "n things to fix" line too.
        if (!form.querySelector('[aria-invalid="true"]')) setStatus(form, '');
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (window.SavantTrack) tk('formSubmit', window.SavantTrack.formName(form));
      clearErrors(form);
      setStatus(form, '');
      var data = read(form);
      var errors = check(kind, data);
      if (Object.keys(errors).length) {
        var n = Object.keys(errors).length;
        setStatus(form, n === 1 ? 'One thing to fix before sending.' : n + ' things to fix before sending.', true);
        showErrors(form, errors);
        return;
      }
      if (data.website) { done(form, FORMS[kind].done(data)); return; } // honeypot: say thanks, send nothing
      mode().then(function (m) {
        if (m === 'server') send(form, kind, data);
        else mailto(form, kind, data);
      });
    });
  });

  /* ── the beta application: two steps ──────────────────────────────── */
  // Step 1 sends the email and the two ticks, and the server keeps them at once (a "started"
  // application). Step 2 appears in the same place and completes that record, using the link the
  // server handed back. If the server cannot be reached, step 2 falls back to the email app like
  // the other forms. Without JavaScript the lower form is posted whole.
  var applied = false;
  var betaForms = Array.prototype.slice.call(document.querySelectorAll('form[data-form="beta"]'));

  function setState(form, n) { form.setAttribute('data-state', String(n)); }

  function reveal(form, data) {
    setState(form, 2);
    var saved = form.querySelector('.apply-saved');
    if (saved) {
      saved.textContent = '';
      var s = document.createElement('strong');
      s.textContent = 'Step 2 of 2.';
      saved.appendChild(s);
      saved.appendChild(document.createTextNode(' Email saved (' + data.email + '). A few details so we can read your application.'));
      saved.hidden = false;
    }
    setStatus(form, '');
    var name = form.elements.name;
    if (name) {
      try { name.focus({ preventScroll: true }); } catch (e) { name.focus(); }
      var r = name.getBoundingClientRect();
      if (r.bottom > window.innerHeight || r.top < 60) name.scrollIntoView({ block: 'center' });
    }
  }

  function finishApply(form, data) {
    applied = true;
    updateSticky();
    var lines = FORMS.beta.done(data);
    betaForms.forEach(function (f) {
      if (!f.isConnected) return;
      done(f, lines, null, { share: true, focus: f === form });
    });
  }

  function betaSend(form, data, step) {
    var btn = form.querySelector('[data-step="' + (step || 2) + '"] [type="submit"]');
    if (btn) btn.disabled = true;
    setStatus(form, step === 1 ? 'Saving…' : 'Sending…');
    var body = {};
    Object.keys(data).forEach(function (k) { body[k] = data[k]; });
    body.elapsed = Math.round(performance.now() - (form._shownAt || 0));
    if (step) body.step = step;
    if (step === 2 && form._token) body.token = form._token;
    return fetch(base + '/api/beta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; });
    }).then(function (res) {
      if (btn) btn.disabled = false;
      if (res.status >= 200 && res.status < 300 && res.json.ok) {
        if (step === 1) {
          form._token = res.json.token || '';
          reveal(form, data);
        } else {
          if (window.SavantTrack) tk('formDone', window.SavantTrack.formName(form));
          finishApply(form, data);
        }
      } else if (res.status === 400 && res.json.errors) {
        setStatus(form, '');
        showErrors(form, res.json.errors);
      } else if (res.status === 429) {
        setStatus(form, 'Too many tries from this connection. Please wait a few minutes and try again.', true);
      } else if (res.status === 404 || res.status === 405 || res.status >= 500) {
        betaFallback(form, data, step);
      } else {
        setStatus(form, (res.json && res.json.error) || 'That did not go through. Please try again.', true);
      }
    }).catch(function () {
      if (btn) btn.disabled = false;
      betaFallback(form, data, step);
    });
  }

  // The server is not there (a static copy of the page, or it is down): step 1 just moves on,
  // and step 2 opens the email app with everything filled in.
  function betaFallback(form, data, step) {
    if (step === 1) { form._local = true; reveal(form, data); } else mailto(form, 'beta', data);
  }

  function initApply(form) {
    form.noValidate = true; // our messages replace the browser's bubbles
    form._shownAt = performance.now();
    if (base) form.action = base + '/api/beta';
    setState(form, 1);
    form.querySelectorAll('[data-count-for]').forEach(function (meta) {
      var field = form.elements[meta.getAttribute('data-count-for')];
      if (!field) return;
      var max = parseInt(field.getAttribute('maxlength'), 10) || 0;
      var update = function () {
        var n = field.value.trim().length;
        meta.textContent = n + ' / ' + max.toLocaleString('en');
        meta.classList.toggle('is-over', max > 0 && n > max);
      };
      field.addEventListener('input', update);
      update();
    });
    form.addEventListener('input', function (e) {
      var el = e.target;
      if (el.getAttribute('aria-invalid') === 'true') {
        controlsFor(form, el.name).forEach(function (c) { c.removeAttribute('aria-invalid'); });
        var slot = errorSlot(form, el.name);
        if (slot) { slot.hidden = true; slot.textContent = ''; }
        if (!form.querySelector('[aria-invalid="true"]')) setStatus(form, '');
      }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (window.SavantTrack) tk('formSubmit', window.SavantTrack.formName(form));
      clearErrors(form);
      setStatus(form, '');
      var step = form.getAttribute('data-state') === '2' ? 2 : 1;
      var data = read(form);
      var errors = check(step === 2 ? 'beta2' : 'beta1', data);
      if (Object.keys(errors).length) {
        var n = Object.keys(errors).length;
        setStatus(form, n === 1 ? 'One thing to fix before sending.' : n + ' things to fix before sending.', true);
        showErrors(form, errors);
        return;
      }
      if (data.website) { if (step === 1) reveal(form, data); else finishApply(form, data); return; } // honeypot: say thanks, send nothing
      mode().then(function (m) {
        if (m !== 'server') { betaFallback(form, data, step); return; }
        if (step === 1) betaSend(form, data, 1);
        else if (form._local) mailto(form, 'beta', data);
        else if (form._token) betaSend(form, data, 2);
        else betaSend(form, data, 0); // step 1 never reached the server: send the whole form
      });
    });
  }
  betaForms.forEach(initApply);

  /* ── the sticky apply bar (phones) ─────────────────────────────────── */
  var stickyBar = document.querySelector('[data-sticky-apply]');
  var heroForm = document.getElementById('hero-form');
  var watched = { hero: false, lower: false };
  function updateSticky() {
    if (!stickyBar) return;
    var show = !applied && !watched.hero && !watched.lower;
    stickyBar.classList.toggle('is-visible', show);
    var btn = stickyBar.querySelector('button');
    if (btn) {
      btn.tabIndex = show ? 0 : -1;
      btn.textContent = heroForm && heroForm.getAttribute('data-state') === '2' ? 'Finish your application' : 'Apply for the beta — free';
    }
  }
  if (stickyBar && heroForm && window.IntersectionObserver) {
    var lowerForm = document.getElementById('beta-form');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { watched[en.target === heroForm ? 'hero' : 'lower'] = en.isIntersecting; });
      updateSticky();
    }, { threshold: 0 });
    io.observe(heroForm);
    if (lowerForm) io.observe(lowerForm);
    new MutationObserver(updateSticky).observe(heroForm, { attributes: true, attributeFilter: ['data-state'] });
    stickyBar.querySelector('button').addEventListener('click', function () {
      if (!heroForm.isConnected) return;
      var src = heroForm.elements.source;
      if (src) src.value = 'sticky';
      var target = heroForm.getAttribute('data-state') === '2' ? heroForm.elements.name : heroForm.elements.email;
      heroForm.scrollIntoView({ block: 'center' });
      if (target) { try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
    });
  }

  // In email mode, say so before anyone types.
  if (document.querySelector('form[data-form]')) {
    mode().then(function (m) {
      if (m !== 'mailto') return;
      document.querySelectorAll('form[data-form]').forEach(function (form) {
        var n = form.querySelector('.form-note[data-mode-note]');
        if (!n) return;
        n.textContent = emailFor(FORMS[form.getAttribute('data-form')].to)
          ? 'This copy of the site sends sign-ups by email: the button opens your email app with the details filled in.'
          : 'Sign-ups are not open on this copy of the site yet.';
      });
    });
  }

  /* ── visit statistics ──────────────────────────────────────────────── */
  // Our own server only, no cookies. The choice on the notice (or the privacy
  // page's "Visit stats" control) is kept in this browser's localStorage: it is a
  // consent record, not a tracker. Nothing typed into a form is ever read here.
  var VISIT_KEY = 'savant-visit-stats';
  function visitChoice() {
    try { var v = localStorage.getItem(VISIT_KEY); return v === 'allow' || v === 'deny' ? v : ''; } catch (e) { return ''; }
  }
  function setVisitChoice(v) { try { localStorage.setItem(VISIT_KEY, v); } catch (e) { /* not kept; asked again next time */ } }
  var T = window.SavantTrack;
  var statsOn = !!(T && window.fetch && window.JSON && CFG.formEndpoint !== 'mailto' && location.protocol !== 'file:');
  var gpc = navigator.globalPrivacyControl === true;
  var visitRes = null;

  function postJson(route, obj) {
    return fetch(base + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj),
      credentials: 'same-origin',
      keepalive: true,
    }).then(function (r) { return r.ok ? r.json() : null; });
  }
  function sendBatch(json) {
    var url = base + '/api/visit-events';
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([json], { type: 'text/plain' }))) return;
    } catch (e) { /* fall back to fetch */ }
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: json, credentials: 'same-origin', keepalive: true }).catch(function () {});
  }

  function showNotice() {
    if (document.querySelector('.visit-notice')) return;
    var box = document.createElement('div');
    box.className = 'visit-notice';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Visit statistics');
    var p = document.createElement('p');
    p.appendChild(document.createTextNode('May we keep simple visit stats, including your IP address? See '));
    var a = document.createElement('a');
    a.href = '/privacy.html#visit-stats';
    a.textContent = 'Privacy';
    p.appendChild(a);
    p.appendChild(document.createTextNode('.'));
    box.appendChild(p);
    var actions = document.createElement('div');
    actions.className = 'visit-notice-actions';
    var close = function (choice) {
      if (choice === 'allow' || choice === 'deny') setVisitChoice(choice);
      tk('consent', choice);
      box.remove();
    };
    [['Allow', 'btn btn-primary btn-sm', 'allow'], ['No thanks', 'btn btn-sm', 'deny']].forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = b[1];
      btn.textContent = b[0];
      btn.setAttribute('data-track', 'visit-notice-' + b[2]);
      btn.addEventListener('click', function () { close(b[2]); });
      actions.appendChild(btn);
    });
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'icon-btn visit-notice-close';
    x.setAttribute('aria-label', 'Close without choosing');
    x.setAttribute('data-track', 'visit-notice-dismiss');
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.addEventListener('click', function () { close('dismiss'); });
    actions.appendChild(x);
    box.appendChild(actions);
    document.body.appendChild(box);
  }

  // The privacy page's "Visit stats" control.
  function visitControl() {
    var box = document.querySelector('[data-visit-stats]');
    if (!box) return;
    box.hidden = false;
    var status = box.querySelector('[data-visit-status]');
    var buttons = box.querySelectorAll('[data-visit-choice]');
    function show(extra) {
      var c = visitChoice();
      var out = visitRes && visitRes.x;
      var text;
      if (!statsOn || !visitRes || visitRes.off) text = 'Visit stats are not being kept for this browser right now.';
      else if (gpc) text = 'Your browser sends Global Privacy Control, so we only keep anonymous counts for you.';
      else if (c === 'deny' || out) text = 'Your choice: don’t allow. We keep only anonymous counts for you.';
      else if (c === 'allow') text = 'Your choice: allowed.';
      else if (visitRes.r) text = 'No choice yet. Until you allow it, we keep only anonymous counts for you.';
      else text = 'No choice yet. Visit stats are kept as described above.';
      if (status) status.textContent = text + (extra ? ' ' + extra : '');
      Array.prototype.forEach.call(buttons, function (b) {
        var v = b.getAttribute('data-visit-choice');
        b.setAttribute('aria-pressed', String(v === 'allow' ? c === 'allow' && !out : c === 'deny' || !!out));
      });
    }
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-visit-choice') === 'allow' ? 'allow' : 'deny';
        setVisitChoice(v);
        tk('consent', v);
        if (!statsOn) { show(); return; }
        postJson('/api/visit-choice', { choice: v }).then(function (r) {
          if (r && r.ok && visitRes) visitRes.x = r.x;
          show(r && r.ok ? 'Saved.' : 'Saved in this browser.');
        }).catch(function () { show('Saved in this browser.'); });
      });
    });
    show();
  }

  function where(file, line) {
    var f = String(file || '');
    try { var u = new URL(f); f = u.origin === location.origin ? u.pathname : u.hostname; } catch (e) { f = ''; }
    return f ? f + ':' + (line || 0) : '';
  }

  function startStats() {
    var now = function () { return performance.now(); };
    TRACK = new T.Tracker({ send: sendBatch, now: now, path: location.pathname });
    var q = { src: '', s: '', m: '', c: '' };
    try {
      var sp = new URLSearchParams(location.search);
      q = { src: sp.get('src') || sp.get('ref') || '', s: sp.get('utm_source') || '', m: sp.get('utm_medium') || '', c: sp.get('utm_campaign') || '' };
    } catch (e) { /* no tags */ }
    var body = { p: location.pathname, r: document.referrer || '', u: { s: q.s, m: q.m, c: q.c }, src: q.src, c: visitChoice(), gpc: gpc, wd: navigator.webdriver === true };
    if (document.body.hasAttribute('data-not-found')) body.nf = 1;
    postJson('/api/visit', body).then(function (res) {
      visitRes = res;
      TRACK.setMode(res);
      if (res && res.notice) showNotice();
      if (res && res.v) collectDevice();
      visitControl();
    }).catch(function () { TRACK.setMode(null); visitControl(); });

    // scroll depth
    var scheduled = false;
    var measure = function () {
      scheduled = false;
      var d = document.documentElement;
      tk('scroll', T.scrollPercent(window.scrollY || d.scrollTop || 0, window.innerHeight, Math.max(d.scrollHeight, document.body.scrollHeight)));
    };
    window.addEventListener('scroll', function () {
      if (!scheduled) { scheduled = true; (window.requestAnimationFrame || setTimeout)(measure); }
    }, { passive: true });
    // activity (only the time of the last input is kept), time, batches
    ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart', 'mousemove'].forEach(function (ev) {
      window.addEventListener(ev, function () { tk('activity'); }, { passive: true, capture: true });
    });
    setInterval(function () { tk('tick', document.visibilityState === 'visible', document.hasFocus()); }, 1000);
    setInterval(function () { tk('flush', false); }, 5000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') tk('flush', false); });
    window.addEventListener('pagehide', function () { tk('pagehide'); });
    window.addEventListener('pageshow', function (e) { if (e.persisted) tk('pageshow'); });
    // sections and forms coming into view
    if (window.IntersectionObserver) {
      // A section is "in view" while it crosses the middle fifth of the window, so
      // sections taller than the screen count too. Pages without sections use their
      // headings with ids.
      var secObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { tk('section', en.target.id, en.isIntersecting); });
      }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 });
      var secs = document.querySelectorAll('main section[id]');
      if (!secs.length) secs = document.querySelectorAll('main h2[id]');
      secs.forEach(function (el) { secObs.observe(el); });
      // A form is "seen" once its top part is above the bottom quarter of the window.
      var formObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) tk('formSeen', T.formName(en.target)); });
      }, { rootMargin: '0px 0px -25% 0px', threshold: 0 });
      document.querySelectorAll('form[data-form]').forEach(function (el) { formObs.observe(el); });
    }
    // fields: the name of each field focused, and the last one touched (never the value)
    document.addEventListener('focusin', function (e) {
      var info = T.fieldInfo(e.target);
      if (info) tk('fieldFocus', info.f, info.n);
    }, true);
    document.addEventListener('input', function (e) {
      var info = T.fieldInfo(e.target);
      if (info) tk('fieldTouch', info.f, info.n);
    }, true);
    // clicks
    var ctx = { origin: location.origin, path: location.pathname, style: function (el) { try { return window.getComputedStyle(el); } catch (e) { return null; } } };
    document.addEventListener('click', function (e) {
      tk('click', T.describeClick(e.target, ctx), e.clientX, e.clientY);
    }, true);
    // speed: load timing and Web Vitals
    window.addEventListener('load', function () {
      setTimeout(function () {
        var n = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        if (n) tk('perf', n.responseStart, n.domContentLoadedEventEnd, n.loadEventEnd);
        measure();
      }, 0);
    });
    if (window.PerformanceObserver) {
      try {
        new PerformanceObserver(function (list) {
          var es = list.getEntries();
          if (es.length) tk('vital', 'lcp', es[es.length - 1].startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) { /* not supported */ }
      try {
        var cls = 0;
        var win = 0;
        var first = 0;
        var last = 0;
        new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (en) {
            if (en.hadRecentInput) return;
            if (win && (en.startTime - last > 1000 || en.startTime - first > 5000)) win = 0;
            if (!win) first = en.startTime;
            win += en.value;
            last = en.startTime;
            if (win > cls) { cls = win; tk('vital', 'cls', cls); }
          });
        }).observe({ type: 'layout-shift', buffered: true });
      } catch (e) { /* not supported */ }
      try {
        var inter = {};
        new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (en) {
            if (!en.interactionId) return;
            inter[en.interactionId] = Math.max(inter[en.interactionId] || 0, en.duration);
          });
          var ds = Object.keys(inter).map(function (k) { return inter[k]; }).sort(function (a, b) { return b - a; });
          if (ds.length) tk('vital', 'inp', ds[Math.min(Math.floor(ds.length / 50), ds.length - 1)]);
        }).observe({ type: 'event', buffered: true, durationThreshold: 40 });
      } catch (e) { /* not supported */ }
    }
    // script errors: the message and file:line only
    window.addEventListener('error', function (e) {
      if (e && e.message) tk('error', e.message, where(e.filename, e.lineno));
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      tk('error', 'Unhandled rejection: ' + (r && r.message ? r.message : typeof r), '');
    });
  }

  function collectDevice() {
    var dev = { w: screen.width, h: screen.height, dpr: window.devicePixelRatio || 1, lang: navigator.language || '', tz: '', tp: navigator.maxTouchPoints || 0 };
    try { dev.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* none */ }
    var uad = navigator.userAgentData;
    if (uad) dev.mobile = !!uad.mobile;
    var sent = false;
    var finish = function () { if (!sent) { sent = true; tk('setDevice', dev); } };
    if (uad && uad.getHighEntropyValues) {
      uad.getHighEntropyValues(['model', 'platformVersion']).then(function (h) {
        dev.model = h.model || '';
        dev.pv = h.platformVersion || '';
        finish();
      }, finish);
      setTimeout(finish, 800);
    } else finish();
  }

  if (statsOn) {
    try { startStats(); } catch (e) { TRACK = null; }
  } else visitControl();
})();
