/* The free ACT level check page (/act-check). Talks to /api/act-check; the guest token lives in this browser only. */
(function () {
  'use strict';
  var KEY = 'savant.actcheck.token';
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var ref = (params.get('ref') || '').slice(0, 32);
  var ch = (params.get('ch') || params.get('utm_source') || '').slice(0, 20);
  var token = '';
  var state = null;
  var picks = {};
  var clockTimer = null;

  function store(op, v) {
    try { if (op === 'get') return localStorage.getItem(KEY) || ''; if (op === 'set') localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* private mode: the check still runs, it just cannot resume */ }
    return '';
  }
  function show(id) {
    ['intro', 'under13', 'walk', 'loading', 'result'].forEach(function (s) { $(s).hidden = s !== id; });
    window.scrollTo(0, 0);
  }
  function say(id, msg) { var el = $(id); el.textContent = msg || ''; el.hidden = !msg; }

  function api(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Guest-Token'] = token;
    return fetch('/api/act-check' + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); });
  }

  /* ── the walk ── */
  function drawWalk() {
    var box = $('questions');
    box.textContent = '';
    picks = {};
    state.questions.forEach(function (q) {
      var wrap = document.createElement('div');
      wrap.className = 'ac-q';
      var p = document.createElement('p');
      p.className = 'ac-prompt';
      p.textContent = q.prompt;
      wrap.appendChild(p);
      var set = function (value) {
        picks[q.index] = value;
        Array.prototype.forEach.call(wrap.querySelectorAll('.ac-choice'), function (b) { b.setAttribute('aria-pressed', b.dataset.value === value ? 'true' : 'false'); });
        api('POST', '/answer', { grade_id: state.grade_id, index: q.index, answer: value });
      };
      if (q.choices && q.choices.length) {
        q.choices.forEach(function (c) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'ac-choice';
          b.dataset.value = c;
          b.setAttribute('aria-pressed', 'false');
          b.textContent = c;
          b.addEventListener('click', function () { set(c); });
          wrap.appendChild(b);
        });
      } else {
        var input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.setAttribute('aria-label', 'Your answer');
        input.addEventListener('change', function () { picks[q.index] = input.value; });
        input.addEventListener('blur', function () { if (input.value) set(input.value); });
        wrap.appendChild(input);
      }
      var idk = document.createElement('button');
      idk.type = 'button';
      idk.className = 'ac-idk';
      idk.textContent = 'I do not know';
      idk.addEventListener('click', function () {
        picks[q.index] = '';
        Array.prototype.forEach.call(wrap.querySelectorAll('.ac-choice'), function (b) { b.setAttribute('aria-pressed', 'false'); });
        var t = wrap.querySelector('input'); if (t) t.value = '';
        idk.textContent = 'Skipped';
      });
      wrap.appendChild(idk);
      box.appendChild(wrap);
    });
    $('progress').textContent = state.asked_so_far + ' answered, up to ' + state.max_questions;
    $('bar').style.width = Math.min(100, Math.round((state.asked_so_far / state.max_questions) * 100)) + '%';
    say('walk-error', '');
    tick();
    show('walk');
  }
  function tick() {
    clearInterval(clockTimer);
    var end = state && state.deadline_at ? Date.parse(state.deadline_at) : 0;
    var draw = function () {
      if (!end) { $('clock').textContent = ''; return; }
      var left = Math.max(0, Math.round((end - Date.now()) / 1000));
      $('clock').textContent = 'About ' + Math.max(1, Math.ceil(left / 60)) + ' min left';
    };
    draw();
    clockTimer = setInterval(draw, 15000);
  }

  function enter(res) {
    if (res.__status === 401) { store('clear'); token = ''; show('intro'); return; }
    if (res.field === 'age13') { store('clear'); token = ''; show('intro'); return; }
    if (res.error && !res.state) { say('intro-error', res.error); show('intro'); return; }
    if (res.finished || (res.state && res.state.phase === 'done')) return loadResult();
    state = res.state;
    if (state && state.phase === 'walk') drawWalk(); else show('intro');
  }

  function begin(body) {
    $('loading-text').textContent = 'Starting...';
    show('loading');
    return api('POST', '/start', body).then(function (res) {
      if (res.under13) { store('clear'); token = ''; show('under13'); return; }
      if (res.token) { token = res.token; store('set', token); }
      enter(res);
    }).catch(function () { say('intro-error', 'Could not reach Savant. Check your connection and try again.'); show('intro'); });
  }

  $('age-yes').addEventListener('click', function () { say('intro-error', ''); begin({ age13: true, ref: ref, ch: ch }); });
  $('age-no').addEventListener('click', function () { begin({ age13: false }); });

  $('next').addEventListener('click', function () {
    var answers = Object.keys(picks).map(function (k) { return { index: Number(k), answer: picks[k] }; });
    var btn = $('next');
    btn.disabled = true;
    api('POST', '/submit', { answers: answers }).then(function (res) {
      btn.disabled = false;
      if (res.__status === 401) return enter(res);
      if (res.error) { say('walk-error', res.error); return; }
      if (res.finished) return loadResult();
      state = res.state;
      drawWalk();
    }).catch(function () { btn.disabled = false; say('walk-error', 'Could not reach Savant. Your answers are kept; try Next again.'); });
  });

  /* ── the result ── */
  function loadResult() {
    clearInterval(clockTimer);
    $('loading-text').textContent = 'Working out your estimate...';
    show('loading');
    api('GET', '/result').then(function (res) {
      if (res.__status === 401) { store('clear'); token = ''; show('intro'); return; }
      if (res.error) { say('intro-error', res.error); show('intro'); return; }
      drawResult(res);
    });
  }
  function drawResult(res) {
    var r = res.result;
    $('band').textContent = r.composite_low === r.composite_high ? 'About ' + r.composite_low : 'About ' + r.composite_low + ' to ' + r.composite_high;
    $('band-sub').textContent = 'Estimated ACT composite, from ' + r.asked + ' questions (' + r.correct + ' right). Best fit: ' + r.grade_name + '.';
    var list = $('weak');
    list.textContent = '';
    r.weakest.forEach(function (w) {
      var li = document.createElement('li');
      li.textContent = w.name;
      var s = document.createElement('small');
      s.textContent = w.correct + ' of ' + w.asked + ' right. ' + w.note;
      li.appendChild(s);
      list.appendChild(li);
    });
    if (!r.weakest.length) { var none = document.createElement('li'); none.textContent = 'Not enough questions in any one area to tell yet.'; list.appendChild(none); }
    $('agree-text').textContent = res.agree_text;
    $('consent-text').textContent = res.email_text;
    drawStanding(res.standing);
    show('result');
  }
  function drawStanding(st) {
    $('apply-box').hidden = !!st.applied;
    $('standing').hidden = !st.applied;
    if (st.applied) {
      $('standing-text').textContent = 'You are number ' + st.position + ' of ' + st.applicants + '. ' + (st.referrals ? st.referrals + ' qualified friend' + (st.referrals === 1 ? '' : 's') + ' joined through your link.' : 'Each qualified friend moves you up.');
      $('qualified-text').textContent = (st.qualified ? 'You are a qualified applicant. ' : 'Not qualified yet: finish the check, be 13 or older, agree to about 30 minutes a day, and give a valid email. ') + st.qualified_count + ' qualified so far. We will email you if you are approved.';
    }
    var link = location.origin + st.share_path;
    $('share-link').value = link;
    $('share').onclick = function () {
      var text = 'I just did a free ACT level check on Savant. No signup.';
      if (navigator.share) { navigator.share({ title: 'Free ACT level check', text: text, url: link }).catch(function () {}); return; }
      $('share-link').select();
      try { navigator.clipboard.writeText(link); $('share').textContent = 'Copied'; } catch (e) { document.execCommand('copy'); $('share').textContent = 'Copied'; }
    };
  }

  $('apply-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    say('apply-error', '');
    api('POST', '/apply', {
      email: $('email').value, name: $('name').value, agree_30_min: $('agree30').checked, consent_email: $('consent').checked,
    }).then(function (res) {
      if (res.__status === 401) return enter(res);
      if (res.error) { say('apply-error', res.error); return; }
      drawStanding(res.standing);
    }).catch(function () { say('apply-error', 'Could not reach Savant. Try again.'); });
  });

  $('retake').addEventListener('click', function () { store('clear'); token = ''; ref = ''; show('intro'); });

  /* ── start ── */
  try {
    if (!sessionStorage.getItem('savant.actcheck.visit')) {
      sessionStorage.setItem('savant.actcheck.visit', '1');
      fetch('/api/act-check/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: ref, ch: ch }) });
    }
  } catch (e) {
    fetch('/api/act-check/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: ref, ch: ch }) });
  }
  token = store('get');
  if (token) {
    $('loading-text').textContent = 'Picking up where you left off...';
    show('loading');
    api('POST', '/start', { ref: ref, ch: ch }).then(enter).catch(function () { show('intro'); });
  } else show('intro');
})();
