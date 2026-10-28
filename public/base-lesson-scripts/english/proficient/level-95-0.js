
document.addEventListener('DOMContentLoaded', function () {
  if (window.__ddlLesson95Init) { return; }
  window.__ddlLesson95Init = true;

  var ROOT = document.getElementById('base-lesson-body');
  if (!ROOT) { return; }

  /* ================= STATE ================= */
  var TOTAL_TESTS = 6;
  var state = {
    xp: 0,
    solved: {},
    solvedCount: 0
  };

  var gaugeFill = document.getElementById('ddlGaugeFill');
  var gaugeLabel = document.getElementById('ddlGaugeLabel');
  var xpBadge = document.getElementById('ddlXp');
  var finishBtn = document.getElementById('finishBtn');

  function updateHUD() {
    xpBadge.textContent = '+' + state.xp + ' XP';
    var pct = 25 + 75 * (state.solvedCount / TOTAL_TESTS);
    if (state.solvedCount >= TOTAL_TESTS) { pct = 100; }
    gaugeFill.style.width = pct.toFixed(1) + '%';
    if (pct >= 100) {
      gaugeLabel.innerHTML = 'Structural Integrity: <b>100%</b> Structure Secured &amp; Verified';
      finishBtn.disabled = false;
    } else {
      gaugeLabel.innerHTML = 'Structural Integrity: <b>' + Math.round(pct) + '%</b> Calibration';
    }
  }

  function solve(key) {
    if (state.solved[key]) { return false; }
    state.solved[key] = true;
    state.solvedCount += 1;
    state.xp += 100;
    updateHUD();
    return true;
  }

  updateHUD();

  /* ================= SECTION 03 — LOGIC CHROMATOGRAPH ================= */
  var CHROM_ROUNDS = [
    {
      id: 1,
      label: 'SAMPLE 01 — REGISTER & CHARGE',
      text: 'Wire report draft: "The regime tightened its grip on the province."',
      win: [40, 62],
      bands: { blue: 58, amber: 12, violet: 30 },
      load: 45,
      correct: 'pathos',
      why: 'The Noise Blue fraction (58u) dwarfs the Data Amber fraction (12u), and 12u falls far short of the 45u claim load. "Regime" carries a documented pejorative charge in standard news registers; a neutral wire report cannot license that charge with the evidence attached.'
    },
    {
      id: 2,
      label: 'SAMPLE 02 — DENOTATIVE SLIDE',
      text: 'Review draft: "The report was decimated — utterly wiped out by the reviewers."',
      win: [52, 74],
      bands: { blue: 10, amber: 22, violet: 68 },
      load: 20,
      correct: 'warrant',
      why: 'The amber fraction clears the 20u load, but the Mechanism Violet band is grossly over-dominant at 68u. The inference from "decimated" to "utterly wiped out" rests on an unlicensed definitional slide from the technical sense (reduce by one tenth) to the colloquial one — an unstated bridge doing all the work.'
    },
    {
      id: 3,
      label: 'SAMPLE 03 — SCOPE OVERREACH',
      text: 'Style claim: "Everyone says \'impactful\' is standard now — nobody objects anymore."',
      win: [64, 86],
      bands: { blue: 8, amber: 9, violet: 14 },
      load: 50,
      correct: 'sample',
      why: 'Total signal is 31u against a 50u claim load. A universal claim about "everyone" requires representative usage evidence — corpus data stratified across registers and regions — not the speaker\'s informal circle. The sample is non-representative and self-selected, so the grounds collapse under the scope of the claim.'
    },
    {
      id: 4,
      label: 'SAMPLE 04 — LICENSED CHOICE',
      text: 'Lab report draft: "The technician performed a meticulous calibration of every instrument."',
      win: [46, 68],
      bands: { blue: 18, amber: 55, violet: 27 },
      load: 50,
      correct: 'sufficient',
      why: 'Amber (55u) clears the 50u claim load, noise stays low at 18u, and the 27u warrant band is proportionate rather than dominant. Denotation ("showing great attention to detail"), connotation (careful, exacting), and register (formal technical prose) all point the same direction. The choice is both valid and sound.'
    }
  ];

  var VERDICTS = [
    { key: 'sufficient', label: '✅ GROUNDS SUFFICIENT', sub: 'Amber ≥ claim load; warrant proportionate.' },
    { key: 'pathos', label: '🔵 PATHOS CONTAMINATION', sub: 'Noise band outweighs the data band.' },
    { key: 'warrant', label: '🟣 UNSTATED MECHANISM', sub: 'Warrant band over-dominant / definitional slide.' },
    { key: 'sample', label: '🟠 MICRO-SAMPLE MIRAGE', sub: 'Grounds too thin for the claim\'s scope.' }
  ];

  var chromIndex = 0;
  var chromResolved = false;

  var elSlider = document.getElementById('chromSlider');
  var elSliderVal = document.getElementById('chromSliderVal');
  var elCaseLabel = document.getElementById('chromCaseLabel');
  var elCaseText = document.getElementById('chromCaseText');
  var elMsg = document.getElementById('chromMsg');
  var elTube = document.getElementById('chromTube');
  var elFront = document.getElementById('chromFront');
  var elScale = document.getElementById('chromScale');
  var elReadBlue = document.getElementById('readBlue');
  var elReadAmber = document.getElementById('readAmber');
  var elReadViolet = document.getElementById('readViolet');
  var elLoad = document.getElementById('chromLoad');
  var elVerdicts = document.getElementById('chromVerdicts');
  var elFeedback = document.getElementById('chromFeedback');
  var elNext = document.getElementById('chromNext');
  var elRun = document.getElementById('chromRun');
  var elPurge = document.getElementById('chromPurge');

  var BAND_NODES = {
    blue: document.getElementById('cbBlue'),
    amber: document.getElementById('cbAmber'),
    violet: document.getElementById('cbViolet')
  };
  var BAND_ORDER = ['blue', 'amber', 'violet'];

  /* build scale ticks */
  (function buildScale() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i <= 10; i++) {
      var tick = document.createElement('div');
      tick.className = 'chrom-tick' + (i % 5 === 0 ? ' major' : '');
      tick.style.bottom = (i * 10) + '%';
      if (i % 5 === 0) {
        var sp = document.createElement('span');
        sp.textContent = (i * 10);
        tick.appendChild(sp);
      }
      frag.appendChild(tick);
    }
    elScale.appendChild(frag);
  })();

  function resetTube() {
    BAND_ORDER.forEach(function (k) {
      var n = BAND_NODES[k];
      n.style.height = '0%';
      n.style.bottom = '0%';
      n.style.opacity = '0';
      n.style.filter = 'none';
    });
    elTube.classList.remove('is-resolved', 'is-smear');
  }

  function applyBands(bands, resolved) {
    var cursor = 0;
    BAND_ORDER.forEach(function (k, i) {
      var n = BAND_NODES[k];
      var bottom, height;
      if (resolved) {
        height = bands[k];
        bottom = cursor;
        cursor += bands[k];
      } else {
        height = Math.max(18, bands[k] * 0.75);
        bottom = 8 + i * 14;
      }
      n.style.bottom = bottom + '%';
      n.style.height = height + '%';
      n.style.opacity = '1';
      n.style.filter = resolved ? 'none' : 'blur(7px)';
    });
  }

  function setReadouts(bands) {
    if (bands) {
      elReadBlue.textContent = bands.blue + ' u';
      elReadAmber.textContent = bands.amber + ' u';
      elReadViolet.textContent = bands.violet + ' u';
    } else {
      elReadBlue.textContent = '—';
      elReadAmber.textContent = '—';
      elReadViolet.textContent = '—';
    }
  }

  function setMessage(txt, kind) {
    elMsg.textContent = txt;
    elMsg.className = 'chrom-msg' + (kind ? ' ' + kind : '');
  }

  function renderVerdicts(enabled) {
    elVerdicts.innerHTML = '';
    VERDICTS.forEach(function (v) {
      var b = document.createElement('button');
      b.className = 'ddl-btn';
      b.type = 'button';
      b.disabled = !enabled;
      b.innerHTML = '<span>' + v.label + '</span><span class="sub">' + v.sub + '</span>';
      b.addEventListener('click', function () { judge(v.key); });
      elVerdicts.appendChild(b);
    });
  }

  function showFeedback(kind, title, body) {
    elFeedback.className = 'chrom-feedback show ' + kind;
    elFeedback.innerHTML = '<b>' + title + '</b>' + body;
  }

  function hideFeedback() {
    elFeedback.className = 'chrom-feedback';
    elFeedback.innerHTML = '';
  }

  function loadChromRound(idx) {
    var r = CHROM_ROUNDS[idx];
    chromResolved = false;
    elCaseLabel.textContent = r.label;
    elCaseText.textContent = r.text;
    elLoad.textContent = r.load + ' u';
    elSlider.value = 20;
    elSliderVal.textContent = '20';
    resetTube();
    setReadouts(null);
    hideFeedback();
    renderVerdicts(false);
    elNext.style.display = 'none';
    elRun.disabled = false;
    elPurge.disabled = false;
    setMessage('Sample injected. Sweep the gradient fader and run the elution — each mixture resolves in a different polarity window.', '');
  }

  function runElution() {
    var r = CHROM_ROUNDS[chromIndex];
    var g = parseInt(elSlider.value, 10);
    resetTube();
    setReadouts(null);
    hideFeedback();
    renderVerdicts(false);
    chromResolved = false;

    /* restart solvent-front animation */
    elFront.classList.remove('is-running');
    void elFront.offsetWidth;
    elFront.classList.add('is-running');

    if (g < r.win[0]) {
      applyBands(r.bands, false);
      elTube.classList.add('is-smear');
      elTube.classList.remove('is-resolved');
      elTube.classList.add('ddl-shake');
      setTimeout(function () { elTube.classList.remove('ddl-shake'); }, 600);
      setMessage('BANDS UNRESOLVED — the solvent front stalled and all three fractions smeared into a single overlapping band. Raise the gradient polarity and re-run.', 'bad');
      return;
    }
    if (g > r.win[1]) {
      applyBands(r.bands, false);
      elTube.classList.add('is-smear');
      elTube.classList.remove('is-resolved');
      elTube.classList.add('ddl-shake');
      setTimeout(function () { elTube.classList.remove('ddl-shake'); }, 600);
      setMessage('SAMPLE OVERRUN — the fractions eluted past the detector window and the data fraction was lost off-column. Lower the gradient polarity and re-run.', 'bad');
      return;
    }

    applyBands(r.bands, true);
    elTube.classList.add('is-resolved');
    elTube.classList.remove('is-smear');
    chromResolved = true;
    setReadouts(r.bands);
    renderVerdicts(true);
    setMessage('BANDS RESOLVED — three clean fractions isolated at ' + g + '% polarity. Read the integrator and compare the amber fraction against the claim load.', 'ok');
  }

  function judge(key) {
    if (!chromResolved) { return; }
    var r = CHROM_ROUNDS[chromIndex];
    if (key === r.correct) {
      var isNew = solve('chrom' + r.id);
      showFeedback('ok', 'RULING ACCEPTED — ' + r.why, '');
      renderVerdicts(false);
      elRun.disabled = true;
      elPurge.disabled = true;
      if (isNew) {
        showFeedback('ok', 'RULING ACCEPTED (+100 XP)', r.why);
      }
      if (chromIndex < CHROM_ROUNDS.length - 1) {
        elNext.style.display = 'inline-flex';
        elNext.textContent = '▶ LOAD NEXT SAMPLE';
      } else {
        elNext.style.display = 'inline-flex';
        elNext.textContent = '✔ CHROMATOGRAPH CALIBRATED — RETURN TO CONSOLE';
        elNext.disabled = true;
        setMessage('All four samples resolved and ruled. The chromatograph is fully calibrated.', 'ok');
      }
    } else {
      elTube.classList.add('ddl-shake');
      setTimeout(function () { elTube.classList.remove('ddl-shake'); }, 600);
      var hint = '';
      if (key === 'sufficient') {
        hint = 'Check the amber fraction against the claim load before clearing the sample. If amber < claim load, the grounds cannot carry the assertion.';
      } else if (key === 'pathos') {
        hint = 'Compare the blue noise fraction to the amber data fraction. Pathos contamination is only the diagnosis when noise actually outweighs grounds.';
      } else if (key === 'warrant') {
        hint = 'Look at the violet mechanism band. An unstated mechanism is the diagnosis when the warrant band is disproportionate or over-dominant relative to the data.';
      } else {
        hint = 'Ask whether the sample is representative. The micro-sample diagnosis applies when total signal falls far short of the claim load and the claim speaks universally.';
      }
      showFeedback('bad', 'RULING REJECTED — re-read the integrator', hint);
    }
  }

  elSlider.addEventListener('input', function () {
    elSliderVal.textContent = elSlider.value;
  });
  elRun.addEventListener('click', runElution);
  elPurge.addEventListener('click', function () {
    resetTube();
    setReadouts(null);
    hideFeedback();
    renderVerdicts(false);
    chromResolved = false;
    setMessage('Column purged. Sample retained in the injection port — set a new gradient and re-run.', '');
  });
  elNext.addEventListener('click', function () {
    if (chromIndex < CHROM_ROUNDS.length - 1) {
      chromIndex += 1;
      loadChromRound(chromIndex);
    }
  });

  loadChromRound(0);

  /* ================= SECTION 04 — NEGATION DETONATOR ================= */
  var detScenarioEl = document.getElementById('detScenario');
  var detArena = document.getElementById('detArena');
  var detBtn = document.getElementById('detBtn');
  var detPopup = document.getElementById('detPopup');
  var detAck = document.getElementById('detAck');
  var detFired = false;

  (function buildDetScenario() {
    var text = "The committee voted to rename the 'Remedial Reading Program' the 'Accelerated Literacy Program.' Test scores will rise, because students who feel labeled 'remedial' underperform.";
    var words = text.split(' ');
    var frag = document.createDocumentFragment();
    words.forEach(function (w) {
      var s = document.createElement('span');
      s.className = 'det-word';
      s.textContent = w + ' ';
      frag.appendChild(s);
    });
    detScenarioEl.appendChild(frag);
  })();

  detBtn.addEventListener('click', function () {
    if (detFired) { return; }
    detFired = true;
    detBtn.disabled = true;
    detArena.classList.add('is-charging');

    setTimeout(function () {
      detArena.classList.remove('is-charging');
      detArena.classList.add('is-collapsed');

      var words = detScenarioEl.querySelectorAll('.det-word');
      for (var i = 0; i < words.length; i++) {
        var dx = (Math.random() * 260 - 130).toFixed(1);
        var dy = (Math.random() * 200 - 40).toFixed(1);
        var rot = (Math.random() * 120 - 60).toFixed(1);
        words[i].style.transitionDelay = (i * 0.012) + 's';
        words[i].style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)';
      }
    }, 1100);

    setTimeout(function () {
      detPopup.classList.add('show');
      solve('detonator');
    }, 2100);
  });

  detAck.addEventListener('click', function () {
    detPopup.classList.remove('show');
  });

  /* ================= SECTION 05 — LIVE FIRE FORENSICS ================= */
  var fxWrap = document.getElementById('fxWrap');
  var fxNotes = document.getElementById('fxNotes');
  var fxModeLabel = document.getElementById('fxModeLabel');
  var fxResult = document.getElementById('fxResult');
  var fxModes = fxWrap.querySelectorAll('.fx-mode');
  var fxHyps = document.getElementById('fxHyps');
  var fxActive = null;

  var FX_NOTES = {
    grounds: [
      { cls: 'g', title: 'Grounds located', body: 'A single quantitative figure: 78 percent of students "surveyed." Survey provenance is unstated — who was sampled, how many, and whether participation was voluntary.' },
      { cls: 'g', title: 'Sufficiency check', body: 'One self-report item about a feeling ("discouraged") is asked to support a behavioural prediction two years out. The grounds are relevant but far too thin for the claim load.' },
      { cls: 'g', title: 'Independence check', body: 'No second source. No enrollment data, no comparison cohort, no register-stratified usage evidence for the phrase "basic skills."' }
    ],
    claims: [
      { cls: 'b', title: 'Core outcome claim', body: '"Enrollment in advanced coursework will climb by at least a third within two years." A precise, falsifiable, quantitative prediction — and therefore a claim that requires strong grounds.' },
      { cls: 'b', title: 'Policy claim', body: '"Every course title be audited for deficit language by December." A sweeping mandate generalised from one survey of one phrase.' },
      { cls: 'b', title: 'Scope note', body: 'The claim is universal ("every course title") while the evidence covers one phrase in one district. The scope of the conclusion exceeds the scope of the grounds.' }
    ],
    warrants: [
      { cls: 'o', title: 'Unstated mechanism #1', body: '"Because the new name signals ambition rather than deficiency…" This is the bridge: label → perception → motivation → enrollment. Every link is asserted, none is demonstrated.' },
      { cls: 'o', title: 'Unstated mechanism #2', body: '"No student can thrive while being called undeveloped." A universal psychological claim smuggled in as common sense.' },
      { cls: 'o', title: 'Definitional slide', body: '"Basic" is reduced to "simple" or "undeveloped." The technical sense (foundational, prerequisite) is discarded and the colloquial pejorative sense is spent instead — a textbook equivocation.' }
    ]
  };

  function renderFxNotes(mode) {
    var notes = FX_NOTES[mode] || [];
    if (!notes.length) {
      fxNotes.innerHTML = '<div class="fx-empty">Select a spectral mode to begin scanning the passage.</div>';
      return;
    }
    var html = '';
    notes.forEach(function (n) {
      html += '<div class="fx-note ' + n.cls + '"><b>' + n.title + '</b>' + n.body + '</div>';
    });
    fxNotes.innerHTML = html;
  }

  fxModes.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var mode = btn.getAttribute('data-mode');
      if (fxActive === mode) {
        fxActive = null;
        fxWrap.classList.remove('mode-grounds', 'mode-claims', 'mode-warrants');
        fxModes.forEach(function (b) { b.classList.remove('active'); });
        fxModeLabel.textContent = 'NONE';
        renderFxNotes(null);
        return;
      }
      fxActive = mode;
      fxWrap.classList.remove('mode-grounds', 'mode-claims', 'mode-warrants');
      fxWrap.classList.add('mode-' + mode);
      fxModes.forEach(function (b) { b.classList.toggle('active', b === btn); });
      fxModeLabel.textContent = mode.toUpperCase();
      renderFxNotes(mode);
    });
  });

  fxHyps.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.fx-hyp') : null;
    if (!btn || btn.disabled) { return; }
    var ok = btn.getAttribute('data-ok') === '1';
    if (ok) {
      var all = fxHyps.querySelectorAll('.fx-hyp');
      for (var i = 0; i < all.length; i++) { all[i].disabled = true; }
      btn.classList.add('correct');
      fxResult.className = 'fx-result show';
      fxResult.innerHTML = '<b>Structural Clearance Granted</b>The fatal flaw is the unstated mechanism bridging a name change to a behavioural outcome, compounded by self-selected survey grounds. The 78 percent figure is relevant but insufficient, and the inference from "felt discouraged" to "enrollment will climb by a third" is licensed by nothing in the passage. Hypotheses B and C attack surface features and an implementation detail; neither touches a load-bearing component.';
      solve('forensics');
    } else {
      btn.classList.add('wrong');
      btn.disabled = true;
      fxResult.className = 'fx-result show';
      fxResult.style.borderColor = 'var(--danger-dark)';
      fxResult.style.background = 'rgba(239,68,68,.09)';
      fxResult.style.color = '#FEE2E2';
      fxResult.innerHTML = '<b style="color:#F87171;">Hypothesis Rejected</b>That observation may be true, but it is not load-bearing. A flaw must break the inference between grounds and outcome — surface features and implementation details do not. Re-scan the orange channel and locate the bridge that carries the argument.';
    }
  });

  /* ================= TERMINATION ================= */
  finishBtn.addEventListener('click', function () {
    if (typeof window.polymathFinishLesson === 'function') {
      window.polymathFinishLesson();
    }
  });

  /* ================= CALLSIGN ================= */
  var callsignInput = document.getElementById('ddlCallsign');
  callsignInput.addEventListener('input', function () {
    var v = callsignInput.value.toUpperCase().replace(/[^A-Z0-9\-_]/g, '');
    callsignInput.value = v;
  });
});
