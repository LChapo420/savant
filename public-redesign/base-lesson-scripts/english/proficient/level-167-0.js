
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('base-lesson-body');
  if (!root) return;

  /* ---------------- HUD / PROGRESS ---------------- */
  const state = { xp: 0, integrity: 25 };
  const xpEl = document.getElementById('hudXp');
  const gaugeEl = document.getElementById('hudGauge');
  const gaugePctEl = document.getElementById('hudGaugePct');

  function renderHud() {
    xpEl.textContent = state.xp;
    const v = Math.min(100, state.integrity);
    gaugeEl.style.width = v + '%';
    gaugePctEl.textContent = Math.round(v) + '%';
    if (v >= 100) {
      gaugeEl.classList.add('full');
      gaugePctEl.classList.add('full');
      gaugePctEl.textContent = '100%';
    }
  }
  function award(xp, pct) {
    state.xp += xp;
    state.integrity = Math.min(100, state.integrity + pct);
    renderHud();
  }
  renderHud();

  const pad = n => String(n).padStart(2, '0');

  /* ---------------- RAIL YARD DATA ---------------- */
  const RAIL_CARS = [
    {
      text: '"A 2018 study of 30,000 students across 12 districts found that later start times were associated with an average 4.5% rise in attendance."',
      answer: 'ground',
      why: 'This is a large, multi-site empirical observation, correctly hedged with "associated with" rather than "caused." It is relevant to attendance, accurately scoped, and independent of the conclusion.',
      hint: 'Ask whether this line is an observation or a hidden principle.'
    },
    {
      text: '"If later start times help attendance, they must also improve learning — and attendance is only worth anything if it raises test scores."',
      answer: 'warrant',
      why: 'This is an unstated bridge doing hidden work. It assumes attendance gains automatically transfer to achievement gains, and it ranks test scores above every other outcome without ever defending that ranking.',
      hint: 'This line is neither evidence nor noise — it is an assumption quietly holding the argument up.'
    },
    {
      text: '"Everyone knows teenagers are lazy and just want to sleep in — that is the real reason they want a later bell."',
      answer: 'distraction',
      why: 'A sweeping character attack on the people affected, offered with no evidence. It has no bearing on whether later start times improve outcomes; it shifts attention from the data to the imagined motives of students.',
      hint: 'Ask whether this line changes the probability of the conclusion at all.'
    },
    {
      text: '"The district\'s own 2022 pilot at two high schools recorded a 3% attendance gain and no change in transportation costs."',
      answer: 'ground',
      why: 'A concrete, locally sourced observation with a measurable result and a checked secondary variable. It is relevant and accurate — though its scope is explicitly narrow, and it must not be inflated beyond two schools.',
      hint: 'A measured local result with a checked variable is still evidence.'
    },
    {
      text: '"Since the pilot worked at two high schools, it is bound to work at every school in the district, whatever their demographics."',
      answer: 'warrant',
      why: 'The unstated generalization principle — "two similar schools represent all schools" — is the load-bearing assumption. It is smuggled in rather than argued, and it silently strips the pilot of its stated scope.',
      hint: 'The word "since" often flags a hidden generalization being inserted.'
    },
    {
      text: '"Ignore the district\'s numbers — a superintendent from a neighboring county, who once failed his own budget audit, says later start times are a waste of money."',
      answer: 'distraction',
      why: 'This attacks the credibility of a speaker instead of evaluating an argument, and the audit is irrelevant to start times. Whether the claim is true is completely untouched by who said it or what else they have done.',
      hint: 'Whose credibility is being attacked, and does that touch the truth of the claim?'
    }
  ];

  let ryIdx = 0;
  let rySelected = null;
  let ryBusy = false;

  const rySvg = document.getElementById('rySvg');
  const ryCarG = document.getElementById('ryCar');
  const ryCarRect = document.getElementById('ryCarRect');
  const ryCarLabel = document.getElementById('ryCarLabel');
  const ryRelease = document.getElementById('ryRelease');
  const ryDiag = document.getElementById('ryDiag');
  const ryManifestText = document.getElementById('ryManifestText');
  const ryManifestIdx = document.getElementById('ryManifestIdx');
  const ryManifestStatus = document.getElementById('ryManifestStatus');

  const RAIL_PATHS = {
    ground: document.querySelector('#rail-ground .rail-line'),
    warrant: document.querySelector('#rail-warrant .rail-line'),
    distraction: document.querySelector('#rail-distraction .rail-line')
  };

  function placeCar(x, y, rot, op) {
    ryCarG.setAttribute('transform', 'translate(' + (x - 60) + ',' + (y - 22) + ') rotate(' + (rot || 0) + ' 60 22)');
    if (op !== undefined) ryCarG.setAttribute('opacity', String(op));
  }
  placeCar(500, 40, 0, 1);

  function setRailActive(track) {
    root.querySelectorAll('.ry-rail').forEach(g => g.classList.remove('active'));
    if (track) {
      const el = document.getElementById('rail-' + track);
      if (el) el.classList.add('active');
    }
  }

  function updateRailUI() {
    if (ryIdx >= RAIL_CARS.length) {
      ryManifestIdx.textContent = 'CAR 06 / 06';
      ryManifestText.textContent = 'ALL CARS CLASSIFIED. THE HUMP IS CLEAR.';
      ryManifestStatus.textContent = 'YARD CLEARED';
      ryCarLabel.textContent = '——';
      return;
    }
    const car = RAIL_CARS[ryIdx];
    ryManifestIdx.textContent = 'CAR ' + pad(ryIdx + 1) + ' / ' + pad(RAIL_CARS.length);
    ryManifestText.textContent = car.text;
    ryCarLabel.textContent = 'CAR ' + pad(ryIdx + 1);
    ryManifestStatus.textContent = 'YARD ACTIVE';
  }
  updateRailUI();

  function rollCar(path, dur, stopEarly, done) {
    const len = path.getTotalLength();
    const t0 = performance.now();
    const limit = stopEarly ? 0.5 : 1;
    function frame(now) {
      const t = Math.min(1, (now - t0) / dur);
      const tt = t * limit;
      const p = path.getPointAtLength(len * tt);
      const p2 = path.getPointAtLength(Math.min(len, len * tt + 10));
      let rot = (p2.x - p.x) * 1.4;
      rot = Math.max(-15, Math.min(15, rot));
      placeCar(p.x, p.y, rot, 1);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        done(limit === 1);
      }
    }
    requestAnimationFrame(frame);
  }

  function derailCar() {
    const tr = ryCarG.getAttribute('transform') || '';
    const m = /translate\(([-\d.]+),([-\d.]+)\)\s*rotate\(([-\d.]+)/.exec(tr);
    let x = 440, y = 18, rot = 0;
    if (m) {
      x = parseFloat(m[1]);
      y = parseFloat(m[2]);
      rot = parseFloat(m[3]);
    }
    const t0 = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - t0) / 820);
      const dy = t * t * 155;
      ryCarG.setAttribute('transform', 'translate(' + x + ',' + (y + dy) + ') rotate(' + (rot + t * 44) + ' 60 22)');
      ryCarG.setAttribute('opacity', String(Math.max(0, 1 - t * 0.9)));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function resetCarToApex() {
    ryCarG.setAttribute('opacity', '1');
    ryCarRect.setAttribute('stroke', '#f59e0b');
    ryCarLabel.setAttribute('fill', '#f59e0b');
    placeCar(500, 40, 0, 1);
  }

  root.querySelectorAll('.ry-lever').forEach(btn => {
    btn.addEventListener('click', () => {
      if (ryBusy || ryIdx >= RAIL_CARS.length) return;
      rySelected = btn.dataset.track;
      root.querySelectorAll('.ry-lever').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setRailActive(rySelected);
      ryRelease.disabled = false;
      ryDiag.className = 'ry-diag';
      ryDiag.textContent = 'ROUTE SET → ' + btn.dataset.label + '. PRESS RELEASE TO SHUNT THE CAR.';
    });
  });

  ryRelease.addEventListener('click', () => {
    if (ryBusy || ryIdx >= RAIL_CARS.length || !rySelected) return;
    ryBusy = true;
    ryRelease.disabled = true;
    const car = RAIL_CARS[ryIdx];
    const correct = (car.answer === rySelected);
    const path = RAIL_PATHS[rySelected];
    ryDiag.className = 'ry-diag';
    ryDiag.textContent = 'CAR ' + pad(ryIdx + 1) + ' ROLLING DOWN THE HUMP…';

    rollCar(path, 1450, !correct, (completed) => {
      if (completed) {
        ryCarRect.setAttribute('stroke', '#22c55e');
        ryCarLabel.setAttribute('fill', '#22c55e');
        ryDiag.className = 'ry-diag ok';
        ryDiag.innerHTML = '<b>✔ CLASSIFIED CORRECTLY.</b> ' + car.why;
        award(100, 8);
        setTimeout(() => {
          ryIdx++;
          rySelected = null;
          setRailActive(null);
          root.querySelectorAll('.ry-lever').forEach(b => b.classList.remove('active'));
          resetCarToApex();
          ryBusy = false;
          updateRailUI();
          ryRelease.disabled = true;
          if (ryIdx >= RAIL_CARS.length) {
            ryDiag.className = 'ry-diag ok';
            ryDiag.innerHTML = '<b>✔ YARD CLEARED.</b> All six argument cars are classified and locked. Every track now holds components of a single type — grounds, warrants, and noise have been separated.';
          } else {
            ryDiag.className = 'ry-diag';
            ryDiag.textContent = 'NEXT CAR SPOTTED ON THE HUMP. READ THE MANIFEST AND SET A ROUTE.';
          }
        }, 1650);
      } else {
        derailCar();
        rySvg.classList.add('ry-shake');
        setTimeout(() => rySvg.classList.remove('ry-shake'), 620);
        ryDiag.className = 'ry-diag bad';
        ryDiag.innerHTML = '<b>✖ DERAILED AT THE BUFFER STOP.</b> That car does not belong on this track. ' + car.hint;
        setTimeout(() => {
          resetCarToApex();
          rySelected = null;
          setRailActive(null);
          root.querySelectorAll('.ry-lever').forEach(b => b.classList.remove('active'));
          ryBusy = false;
          ryRelease.disabled = true;
          ryDiag.className = 'ry-diag';
          ryDiag.textContent = 'CAR ' + pad(ryIdx + 1) + ' RETURNED TO THE APEX. SELECT A NEW ROUTE.';
        }, 1750);
      }
    });
  });

  /* ---------------- NEGATION DETONATOR ---------------- */
  const detChamber = document.getElementById('detChamber');
  const detBtn = document.getElementById('detBtn');
  const detResult = document.getElementById('detResult');
  let detDone = false;

  detBtn.addEventListener('click', () => {
    if (detDone) return;
    detDone = true;
    detBtn.disabled = true;
    detBtn.textContent = '⏳ ARMED — NEGATION CHARGING…';
    detChamber.classList.add('armed');

    setTimeout(() => {
      detChamber.classList.remove('armed');
      detChamber.classList.add('breached');
      detBtn.textContent = '💥 NEGATION FIRED — STRUCTURE COLLAPSED';
      detResult.classList.add('show');
      award(150, 10);
      setTimeout(() => {
        detChamber.classList.remove('breached');
      }, 1400);
    }, 950);
  });

  /* ---------------- LIVE FIRE FORENSICS ---------------- */
  const lffPassage = document.getElementById('lffPassage');
  const lffNotes = document.getElementById('lffNotes');
  const lffVerdict = document.getElementById('lffVerdict');
  let lffDone = false;

  function buildNotes(mode) {
    const spans = lffPassage.querySelectorAll('span[data-tag="' + mode + '"]');
    if (!spans.length) {
      lffNotes.innerHTML = '<h4>Inspector Notes</h4><p style="color:#a8a29e;font-size:12.5px;">No components detected in this channel.</p>';
      return;
    }
    let html = '<h4>Inspector Notes — ' + mode.toUpperCase() + '</h4>';
    spans.forEach((sp, i) => {
      const snip = sp.textContent.trim();
      const short = snip.length > 62 ? snip.slice(0, 62) + '…' : snip;
      html += '<div class="lff-note"><span class="snip">▸ ' + short.replace(/</g, '&lt;') + '</span>' + (sp.dataset.note || '') + '</div>';
    });
    lffNotes.innerHTML = html;
  }

  root.querySelectorAll('.lff-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      const already = btn.classList.contains('on');
      root.querySelectorAll('.lff-mode').forEach(b => b.classList.remove('on'));
      lffPassage.classList.remove('mode-grounds', 'mode-claims', 'mode-warrants');
      if (already) {
        lffNotes.innerHTML = '<h4>Inspector Notes</h4><p style="color:#a8a29e;font-size:12.5px;">Select a scanning mode to illuminate components and populate this panel.</p>';
        return;
      }
      btn.classList.add('on');
      lffPassage.classList.add('mode-' + mode);
      buildNotes(mode);
    });
  });

  root.querySelectorAll('.lff-hyp').forEach(btn => {
    btn.addEventListener('click', () => {
      if (lffDone) return;
      const pick = btn.dataset.hyp;
      if (pick === 'B') {
        lffDone = true;
        btn.classList.add('good');
        root.querySelectorAll('.lff-hyp').forEach(b => { b.disabled = true; });
        lffVerdict.className = 'lff-verdict ok';
        lffVerdict.innerHTML = '<b>✔ STRUCTURAL CLEARANCE GRANTED.</b> Hypothesis B is correct. The passage performs a Causal Leap — an uncontrolled before/after count is promoted to "cameras save lives" — and then layers a second unstated warrant on top, assuming the effect transfers to every comparable city. Hypothesis A misreads the design: 40 cameras is the size of the intervention, not the sample. Hypothesis C misreads the vocabulary: "cameras" keeps one meaning throughout, so no equivocation occurs. The two real defects are causal overreach and an unjustified transfer warrant.';
        award(200, 17);
      } else {
        btn.classList.add('bad');
        btn.disabled = true;
        lffVerdict.className = 'lff-verdict';
        if (pick === 'A') {
          lffVerdict.innerHTML = '<b>✖ NOT THE FATAL FLAW.</b> The number 40 describes how many cameras were installed, not how many observations were taken. The sample here is the city\'s full traffic record, not forty units. Re-scan the <em>Grounds</em> channel and look at what the evidence is actually doing.';
        } else {
          lffVerdict.innerHTML = '<b>✖ NOT THE FATAL FLAW.</b> "Cameras" is used consistently throughout the passage — it always refers to speed cameras. There is no drift between two senses. Switch to the <em>Warrants</em> channel and examine the inference markers.';
        }
      }
    });
  });

  /* ---------------- FINISH ---------------- */
  const finishBtn = document.getElementById('finishBtn');
  if (finishBtn) {
    finishBtn.addEventListener('click', () => {
      if (typeof window.polymathFinishLesson === 'function') {
        window.polymathFinishLesson();
      }
    });
  }
});
