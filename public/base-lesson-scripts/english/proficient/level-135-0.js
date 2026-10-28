
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('base-lesson-body');
  if (!root) return;

  /* ---------------- HUD / SCORING ---------------- */
  const gaugeFill = document.getElementById('gaugeFill');
  const gaugeVal = document.getElementById('gaugeVal');
  const xpValue = document.getElementById('xpValue');
  const btnFinish = document.getElementById('btnFinish');

  const BASE_INTEGRITY = 25;
  const MILESTONE_POINTS = { wt1: 12, wt2: 12, wt3: 12, negation: 13, modes: 8, flaw: 18 };
  const done = {};
  let xp = 0;

  function renderIntegrity() {
    let total = BASE_INTEGRITY;
    Object.keys(MILESTONE_POINTS).forEach(k => { if (done[k]) total += MILESTONE_POINTS[k]; });
    total = Math.min(100, total);
    gaugeFill.style.width = total + '%';
    if (total >= 100) {
      gaugeFill.classList.add('full');
      gaugeVal.textContent = '100% STRUCTURE SECURED & VERIFIED';
      btnFinish.classList.remove('locked');
    } else {
      gaugeFill.classList.remove('full');
      gaugeVal.textContent = total + '% CALIBRATION';
      btnFinish.classList.add('locked');
    }
  }

  function award(key) {
    if (done[key]) return;
    done[key] = true;
    renderIntegrity();
  }

  function addXP(n) {
    xp += n;
    xpValue.textContent = xp;
  }

  renderIntegrity();

  btnFinish.addEventListener('click', () => {
    if (typeof window.polymathFinishLesson === 'function') {
      window.polymathFinishLesson();
    }
  });

  /* ---------------- WIND TUNNEL: SVG STREAMLINES ---------------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const lamGroup = document.getElementById('lamGroup');
  const turbGroup = document.getElementById('turbGroup');
  const laneYs = [78, 122, 166, 210, 254, 298, 342];

  laneYs.forEach((y, i) => {
    const lam = document.createElementNS(SVG_NS, 'path');
    lam.setAttribute('d', 'M30 ' + y + ' L870 ' + y);
    lam.setAttribute('class', 'flowline');
    lamGroup.appendChild(lam);

    const amp = 16 + (i % 3) * 9;
    const d = 'M30 ' + y +
      ' C 110 ' + (y - amp) + ' 170 ' + (y + amp) + ' 250 ' + y +
      ' C 330 ' + (y - amp) + ' 390 ' + (y + amp) + ' 470 ' + y +
      ' C 550 ' + (y - amp) + ' 610 ' + (y + amp) + ' 690 ' + y +
      ' C 770 ' + (y - amp) + ' 830 ' + (y + amp) + ' 870 ' + y;
    const turb = document.createElementNS(SVG_NS, 'path');
    turb.setAttribute('d', d);
    turb.setAttribute('class', 'flowline');
    turbGroup.appendChild(turb);
  });

  /* ---------------- WIND TUNNEL: DATA ---------------- */
  const TRIALS = [
    {
      id: 'wt1',
      index: 1,
      claim: 'Latinate vocabulary makes writing more precise.',
      chips: [
        { text: '\u2026in formal academic registers', good: true },
        { text: '\u2026for readers trained in that lexicon', good: true },
        { text: '\u2026when the word fits the context', good: true },
        { text: '\u2026always, in every genre', good: false },
        { text: '\u2026as every serious writer knows', good: false },
        { text: '\u2026because Latin is a superior language', good: false }
      ],
      pass: 'Laminar flow confirmed. The claim is now bounded by register, audience, and fit, so no single counter-example can blow it apart — you converted a preference into a testable statement.',
      failBad: 'Turbulent buffeting. A ranking — "Latin is better" — has been welded onto a description, and no wind of evidence can argue against it because the criterion was never stated.',
      failPartial: 'Flow separation. The claim is still unbounded: it asserts a general rule where only a conditioned tendency is supported. Add the missing qualifiers.'
    },
    {
      id: 'wt2',
      index: 2,
      claim: 'A writer\u2019s tone is determined by how many Latin words appear per page.',
      chips: [
        { text: '\u2026within a given passage, not across a career', good: true },
        { text: '\u2026only when syntax and imagery stay constant', good: true },
        { text: '\u2026as a tendency, not a rule', good: true },
        { text: '\u2026therefore tone is measurable by word count', good: false },
        { text: '\u2026so all Latinate passages share one tone', good: false },
        { text: '\u2026regardless of context or irony', good: false }
      ],
      pass: 'Laminar. By holding syntax and imagery constant and demoting the claim to a tendency, you supplied the mechanism that a raw word count cannot. The rig holds full tonnage.',
      failBad: 'Catastrophic drag. The causal leap is load-bearing: co-occurrence of Latin words and a tonal impression has been converted into a measurement, with no mechanism and no control.',
      failPartial: 'Transitional flow. The direction is plausible but the claim is still unqualified — a tendency is being phrased as a law, and the confounds are uncontrolled.'
    },
    {
      id: 'wt3',
      index: 3,
      claim: 'The word "nice" means "precise and agreeable" because it comes from Latin nescius.',
      chips: [
        { text: '\u2026in present-day usage, after its meaning shifted', good: true },
        { text: '\u2026so etymology explains history, not current denotation', good: true },
        { text: '\u2026and only in the register where "nice" is used casually', good: true },
        { text: '\u2026so etymology is the true definition', good: false },
        { text: '\u2026therefore the Latin root always controls meaning', good: false },
        { text: '\u2026and this holds for every word in English', good: false }
      ],
      pass: 'Laminar. Separating etymology (history) from denotation (current use) and limiting the claim to a register removes the equivocation entirely. The definitional shift is gone.',
      failBad: 'Catastrophic drag. The etymological fallacy is load-bearing here: the Latin root has been substituted for the modern meaning, so the conclusion is about a different word than the evidence supports.',
      failPartial: 'Transitional flow. The claim is directionally right but unqualified — "nice" does not carry the same sense in every context, and the historical and current layers are still fused.'
    }
  ];

  let currentTrial = 0;
  let running = false;

  const stage = document.getElementById('tunnelStage');
  const chipBank = document.getElementById('chipBank');
  const podClaim = document.getElementById('podClaim');
  const podMods = document.getElementById('podMods');
  const trialIndexEl = document.getElementById('trialIndex');
  const windVal = document.getElementById('windVal');
  const flowVal = document.getElementById('flowVal');
  const dragVal = document.getElementById('dragVal');
  const dragFill = document.getElementById('dragFill');
  const verdict = document.getElementById('verdict');
  const verdictHead = document.getElementById('verdictHead');
  const verdictBody = document.getElementById('verdictBody');
  const btnRun = document.getElementById('btnRun');
  const btnReset = document.getElementById('btnReset');
  const btnNext = document.getElementById('btnNext');

  function setFlowState(mode, drag) {
    if (mode === 'idle') {
      lamGroup.classList.remove('hide');
      turbGroup.classList.remove('show');
      stage.classList.remove('turbulent', 'pass');
      flowVal.textContent = 'IDLE';
      flowVal.className = 'tel-val';
    } else if (mode === 'ramp') {
      if (drag > 20) {
        lamGroup.classList.add('hide');
        turbGroup.classList.add('show');
        stage.classList.add('turbulent');
        stage.classList.remove('pass');
        flowVal.textContent = 'TURBULENT';
        flowVal.className = 'tel-val bad';
      } else {
        lamGroup.classList.remove('hide');
        turbGroup.classList.remove('show');
        stage.classList.remove('turbulent');
        flowVal.textContent = 'RAMPPING';
        flowVal.className = 'tel-val warn';
      }
    } else if (mode === 'pass') {
      lamGroup.classList.remove('hide');
      turbGroup.classList.remove('show');
      stage.classList.remove('turbulent');
      stage.classList.add('pass');
      flowVal.textContent = 'LAMINAR';
      flowVal.className = 'tel-val good';
    } else if (mode === 'fail') {
      lamGroup.classList.add('hide');
      turbGroup.classList.add('show');
      stage.classList.add('turbulent');
      stage.classList.remove('pass');
      flowVal.textContent = drag > 60 ? 'BUFFETING' : 'SEPARATED';
      flowVal.className = 'tel-val bad';
    }
  }

  function updateDrag(drag) {
    dragVal.textContent = Math.round(drag);
    dragFill.style.width = Math.min(100, drag) + '%';
    if (drag <= 6) {
      dragFill.style.background = 'linear-gradient(90deg, #15803D, #22C55E)';
      dragVal.className = 'tel-val good';
    } else if (drag <= 30) {
      dragFill.style.background = 'linear-gradient(90deg, #B45309, #FBBF24)';
      dragVal.className = 'tel-val warn';
    } else {
      dragFill.style.background = 'linear-gradient(90deg, #9F1239, #F43F5E)';
      dragVal.className = 'tel-val bad';
    }
  }

  function renderTrial() {
    const t = TRIALS[currentTrial];
    trialIndexEl.textContent = 'TRIAL 0' + t.index + ' / 03';
    podClaim.textContent = t.claim;

    podMods.innerHTML = '';
    const applied = t.chips.filter(c => c.on);
    if (applied.length === 0) {
      const b = document.createElement('span');
      b.className = 'mod-badge bad';
      b.textContent = 'NO MODULES APPLIED';
      podMods.appendChild(b);
    } else {
      applied.forEach(c => {
        const b = document.createElement('span');
        b.className = 'mod-badge' + (c.good ? '' : ' bad');
        b.textContent = c.text;
        podMods.appendChild(b);
      });
    }

    chipBank.innerHTML = '';
    t.chips.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (c.on ? ' on' : '');
      btn.type = 'button';
      btn.textContent = (c.on ? '\u2714 ' : '\uFF0B ') + c.text;
      btn.addEventListener('click', () => {
        if (running) return;
        c.on = !c.on;
        renderTrial();
      });
      chipBank.appendChild(btn);
    });

    verdict.className = 'verdict';
    verdict.style.display = 'none';
    windVal.textContent = '0%';
    updateDrag(0);
    setFlowState('idle', 0);
    btnNext.style.display = 'none';
    btnRun.disabled = false;
    btnRun.textContent = '\u26A1 RUN WIND TUNNEL';
  }

  function computeDrag(t) {
    const good = t.chips.filter(c => c.good && c.on).length;
    const bad = t.chips.filter(c => !c.good && c.on).length;
    let drag;
    if (bad > 0) {
      drag = Math.min(100, 45 + 18 * bad + 8 * (3 - good));
    } else {
      drag = (3 - good) * 22;
    }
    return { drag: drag, good: good, bad: bad };
  }

  function runTunnel() {
    if (running) return;
    const t = TRIALS[currentTrial];
    const res = computeDrag(t);
    running = true;
    btnRun.disabled = true;
    verdict.className = 'verdict';
    verdict.style.display = 'none';
    btnNext.style.display = 'none';

    let wind = 0;
    let applied = false;
    const ramp = setInterval(() => {
      wind += 5;
      if (wind > 100) wind = 100;
      windVal.textContent = wind + '%';
      updateDrag(res.drag * (wind / 100));
      if (!applied && wind >= 55) {
        applied = true;
        setFlowState('ramp', res.drag);
      }
      if (wind >= 100) {
        clearInterval(ramp);
        finishRun(t, res);
      }
    }, 38);
  }

  function finishRun(t, res) {
    running = false;
    updateDrag(res.drag);
    const pass = (res.bad === 0 && res.good === 3);

    if (pass) {
      setFlowState('pass', res.drag);
      verdict.className = 'verdict pass show';
      verdictHead.textContent = 'LAMINAR FLOW — STRUCTURE HOLDS';
      verdictBody.textContent = t.pass;
      award(t.id);
      addXP(100);
    } else {
      setFlowState('fail', res.drag);
      verdict.className = 'verdict fail show';
      verdictHead.textContent = res.bad > 0 ? 'TURBULENT BUFFETING — LOAD FAILURE' : 'FLOW SEPARATION — UNDER-QUALIFIED';
      verdictBody.textContent = res.bad > 0 ? t.failBad : t.failPartial;
    }

    btnRun.disabled = false;
    if (pass) {
      btnRun.textContent = '\u26A1 RE-RUN TEST';
      btnNext.style.display = 'inline-block';
      if (currentTrial >= TRIALS.length - 1) {
        btnNext.textContent = '\u2714 ALL CLAIMS VERIFIED';
      } else {
        btnNext.textContent = '\u25B6 ADVANCE TO NEXT CLAIM';
      }
    } else {
      btnRun.textContent = '\u26A1 RE-RUN WIND TUNNEL';
    }
  }

  btnRun.addEventListener('click', runTunnel);
  btnReset.addEventListener('click', () => {
    if (running) return;
    TRIALS[currentTrial].chips.forEach(c => { c.on = false; });
    renderTrial();
  });
  btnNext.addEventListener('click', () => {
    if (running) return;
    if (currentTrial >= TRIALS.length - 1) return;
    currentTrial += 1;
    TRIALS[currentTrial].chips.forEach(c => { c.on = false; });
    renderTrial();
  });

  renderTrial();

  /* ---------------- NEGATION DETONATOR ---------------- */
  const detCard = document.getElementById('detCard');
  const detWords = document.getElementById('detWords');
  const detCracks = document.getElementById('detCracks');
  const btnDetonate = document.getElementById('btnDetonate');
  const CLAIM_TEXT = 'Any writer who uses Latinate vocabulary writes with greater precision.';
  let detonated = false;

  CLAIM_TEXT.split(' ').forEach(w => {
    const s = document.createElement('span');
    s.className = 'frag';
    s.textContent = w;
    detWords.appendChild(s);
  });

  function detonate() {
    if (detonated) return;
    detonated = true;
    btnDetonate.disabled = true;
    btnDetonate.textContent = '\uD83D\uDCA5 DETONATING\u2026';

    detCard.classList.add('charging');

    setTimeout(() => {
      detCard.classList.remove('charging');
      detCracks.classList.add('show');
    }, 820);

    setTimeout(() => {
      const frags = detWords.querySelectorAll('.frag');
      frags.forEach(f => {
        const dx = (Math.random() - 0.5) * 520;
        const dy = (Math.random() - 0.5) * 320 + 60;
        const rot = (Math.random() - 0.5) * 220;
        const sc = 0.5 + Math.random() * 0.7;
        f.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg) scale(' + sc.toFixed(2) + ')';
        f.style.opacity = '0';
      });
    }, 1250);

    setTimeout(() => {
      award('negation');
      addXP(100);
      btnDetonate.textContent = '\u2714 NEGATION TEST COMPLETE';
      showDebrief();
    }, 2150);
  }

  function showDebrief() {
    const back = document.createElement('div');
    back.className = 'modal-back';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML =
      '<h3>\uD83D\uDCA3 Detonation Successful</h3>' +
      '<p>By proving the opposite of the implicit assumption &mdash; that precision could belong to a word&rsquo;s <em>origin</em> rather than to its <em>fit</em> &mdash; the entire premise collapsed. The Negation Test proves this assumption was a fatal structural dependency.</p>' +
      '<p style="color:#FDA4AF;"><strong>Debris field:</strong> once origin no longer guarantees precision, &ldquo;Latinate vocabulary&rdquo; stops predicting anything at all. The claim cannot be rebuilt from its own parts.</p>' +
      '<p style="color:#86EFAC;"><strong>Repair principle:</strong> rebuild the claim around fit &mdash; &ldquo;In formal registers, and when the word matches the context, Latinate diction often reads as more precise than its Germanic equivalent.&rdquo;</p>' +
      '<button class="btn pink" id="closeDebrief" style="margin-top:10px;">\u2714 ACKNOWLEDGE &amp; CONTINUE</button>';
    back.appendChild(modal);
    root.appendChild(back);
    const closeBtn = modal.querySelector('#closeDebrief');
    closeBtn.addEventListener('click', () => back.remove());
    back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  }

  btnDetonate.addEventListener('click', detonate);

  /* ---------------- FORENSICS ---------------- */
  const passage = document.getElementById('forensicPassage');
  const inspectorBody = document.getElementById('inspectorBody');
  const modeButtons = Array.prototype.slice.call(document.querySelectorAll('.mode-bar .btn'));
  const modeSeen = {};
  let activeMode = null;

  const MODE_LABEL = {
    ground: 'Foundation / Grounds',
    claim: 'Core Claims / Outcomes',
    warrant: 'Unstated Mechanisms / Warrants'
  };

  function renderInspector(mode) {
    if (!mode) {
      inspectorBody.innerHTML = '<div class="note empty">No channel active. Select a scan mode to illuminate a structural layer.</div>';
      return;
    }
    const segs = Array.prototype.slice.call(passage.querySelectorAll('.seg[data-role="' + mode + '"]'));
    const notes = segs.map(s => s.dataset.note).filter(Boolean);
    let html = '<div class="note ' + mode + '" style="border-left-color:currentColor;color:var(--muted);">Channel: <strong style="color:#fff;">' + MODE_LABEL[mode] + '</strong> &mdash; ' + notes.length + ' segment(s) illuminated.</div>';
    notes.forEach(n => {
      html += '<div class="note ' + mode + '">' + n + '</div>';
    });
    inspectorBody.innerHTML = html;
  }

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (activeMode === mode) {
        activeMode = null;
        modeButtons.forEach(b => b.classList.remove('active'));
        Array.prototype.slice.call(passage.querySelectorAll('.seg')).forEach(s => s.classList.remove('lit'));
        renderInspector(null);
        return;
      }
      activeMode = mode;
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Array.prototype.slice.call(passage.querySelectorAll('.seg')).forEach(s => {
        s.classList.toggle('lit', s.dataset.role === mode);
      });
      renderInspector(mode);

      modeSeen[mode] = true;
      if (modeSeen.ground && modeSeen.claim && modeSeen.warrant) {
        if (!done.modes) {
          award('modes');
        }
      }
    });
  });

  const hypoButtons = Array.prototype.slice.call(document.querySelectorAll('.hypo'));
  const fxVerdict = document.getElementById('fxVerdict');
  const fxVerdictHead = document.getElementById('fxVerdictHead');
  const fxVerdictBody = document.getElementById('fxVerdictBody');
  let flawSolved = false;

  hypoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (flawSolved) return;
      const correct = btn.dataset.correct === 'true';
      if (correct) {
        flawSolved = true;
        btn.classList.add('correct');
        hypoButtons.forEach(b => { b.disabled = true; });
        fxVerdict.className = 'verdict pass show';
        fxVerdictHead.textContent = 'STRUCTURAL CLEARANCE GRANTED';
        fxVerdictBody.textContent = 'Correct. The paragraph is not broken because a fact is wrong — it is broken because the grounds are radically insufficient for the claim. A single etymological observation and a twelve-student classroom survey are asked to support a universal causal law about Romantic poetry, and then one measure is crowned "the single reliable measure" of precision. Sample sufficiency and scope qualification fail together.';
        award('flaw');
        addXP(100);
      } else {
        btn.classList.add('wrong');
        btn.disabled = true;
        fxVerdict.className = 'verdict fail show';
        fxVerdictHead.textContent = 'HYPOTHESIS REJECTED';
        if (btn.textContent.indexOf('symmetry') !== -1) {
          fxVerdictBody.textContent = 'No — "symmetry" genuinely derives from Greek (syn- "together" + metron "measure"). The etymology in the paragraph is accurate. The failure is not in any single fact but in the sufficiency of the grounds and the missing scope limits.';
        } else {
          fxVerdictBody.textContent = 'No — the paragraph does define "fearful" well enough through its etymology and syllable count. The problem is not definitional; it is that this evidence is far too thin to carry a universal claim.';
        }
      }
    });
  });

  /* ---------------- FINAL SAFETY ---------------- */
  window.addEventListener('beforeunload', () => { running = false; });
});
