
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('base-lesson-body');
  if (!root) return;

  /* ============================================================
     TELEMETRY
     ============================================================ */
  let xp = 0;
  let integrity = 25;

  const xpEl = root.querySelector('#xpCounter');
  const gaugeFill = root.querySelector('#gaugeFill');
  const gaugeVal = root.querySelector('#gaugeVal');
  const gaugeLabel = root.querySelector('#gaugeLabel');

  function renderTelemetry() {
    xpEl.textContent = xp + ' XP';
    gaugeFill.style.width = integrity + '%';
    if (integrity >= 100) {
      gaugeVal.textContent = '100% SECURED';
      gaugeLabel.textContent = 'STRUCTURE SECURED & VERIFIED';
      gaugeLabel.style.color = '#7ef0a6';
    } else {
      gaugeVal.textContent = integrity + '%';
    }
  }

  function award(points, gauge) {
    xp += points;
    integrity = Math.min(100, integrity + gauge);
    renderTelemetry();
  }

  renderTelemetry();

  /* ============================================================
     SECTION 03 — THERMAL IMAGING HEAT-LOSS FLAW DETECTOR
     ============================================================ */
  const NODES = [
    {
      id: 'N-01',
      verdict: 'sound',
      coolTemp: '21.4 °C',
      hotTemp: '21.4 °C',
      text: 'Sleep researchers have measured a puberty-driven circadian shift of roughly two hours, a finding replicated across independent studies.',
      good: 'Correct. The segment grounds its claim in replicated measurement and bounds it with "roughly," so the register stays cool and calibrated to the evidence. A measured tone backed by independent grounds needs no repair.',
      bad: 'Thermal leak misread. This segment shows no heat: it cites replicated findings and limits its own claim with "roughly." Calling it flawed would itself be an unearned tonal overreach.'
    },
    {
      id: 'N-02',
      verdict: 'value',
      coolTemp: '22.0 °C',
      hotTemp: '742 °C',
      text: 'Any administrator who defends the current bell schedule is choosing convenience over children.',
      good: 'Correct. The sentence smuggles in a moral hierarchy — convenience versus children — that the writer never argues for, and the accusatory register turns presumption into heat. Naming the unstated trade-offs (bus logistics, staffing costs) dissipates the leak.',
      bad: 'Incorrect diagnosis. The heat here is not sampling and not causation — it is an unstated value ranking fused to an accusatory register. Locate the presupposed hierarchy; that is the load path.'
    },
    {
      id: 'N-03',
      verdict: 'causal',
      coolTemp: '21.1 °C',
      hotTemp: '918 °C',
      text: 'Districts that pushed start times later also reported higher attendance, so later bells produce better learning.',
      good: 'Correct. Co-occurrence is being converted into production — "also reported" becomes "produce" — with no mechanism and no controls for other district-level changes. Hedging the bridge and naming one plausible mechanism drops the tile to cool.',
      bad: 'Incorrect diagnosis. Nothing here slides between definitions or leans on a tiny sample. The flaw is a bridge built from sequence alone: two facts reported together are being treated as cause and effect.'
    },
    {
      id: 'N-04',
      verdict: 'definition',
      coolTemp: '21.8 °C',
      hotTemp: '861 °C',
      text: "The policy's call for 'flexibility' means adjustable deadlines in the handbook, but 'flexibility' in the superintendent's speech means teachers accepting whatever schedule they are given.",
      good: 'Correct. "Flexibility" carries one sense in the handbook and a colder, coercive sense in the speech, so the reader\'s attitude cannot stabilize. Pinning both senses down explicitly removes the equivocation heat.',
      bad: 'Incorrect diagnosis. This failure is lexical, not statistical: one word is doing two jobs, and the tone slides along with it. Locate the two competing definitions before repairing anything else.'
    },
    {
      id: 'N-05',
      verdict: 'sample',
      coolTemp: '21.6 °C',
      hotTemp: '795 °C',
      text: "In my third-period class, 38 of 42 students said they'd focus better with a later start; students clearly want this change.",
      good: 'Correct. A single class period is a non-representative, self-selected slice, and the leap from 42 students to "students clearly want" converts a local reading into a universal tone. Bounding the claim back to its sample cools it immediately.',
      bad: 'Incorrect diagnosis. There is no equivocation and no causal verb here — the heat comes from sample size and a universal quantifier. Ask who was not surveyed.'
    },
    {
      id: 'N-06',
      verdict: 'sound',
      coolTemp: '20.9 °C',
      hotTemp: '20.9 °C',
      text: "The board's proposal deserves a fair hearing. The evidence is suggestive rather than decisive, and the schedule should be reviewed after one semester.",
      good: 'Correct. The sentence hedges explicitly ("suggestive rather than decisive"), bounds its own timeline, and holds an even register throughout. Cool tiles are not weak writing — they are controlled writing.',
      bad: 'Incorrect diagnosis. Measured, hedged prose is not a flaw. The tile reads cool because the writer calibrated certainty to evidence. That is tone control working exactly as designed.'
    }
  ];

  const nodeGrid = root.querySelector('#nodeGrid');
  const consolePanel = root.querySelector('#consolePanel');
  const chargeBtn = root.querySelector('#chargeBtn');
  const resetBtn = root.querySelector('#resetBtn');
  const viewport = root.querySelector('#viewport');

  let charged = false;
  let solvedCount = 0;
  let focusIndex = -1;
  let locked = false;

  function buildNodes() {
    nodeGrid.innerHTML = '';
    NODES.forEach((n, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'node';
      el.dataset.idx = String(i);
      el.innerHTML =
        '<div class="node-head"><span>' + n.id + '</span><span class="node-temp" data-temp>UNSCANNED</span></div>' +
        '<div class="node-text">' + n.text + '</div>' +
        '<div class="node-foot" data-foot>▸ AWAITING SCAN</div>';
      nodeGrid.appendChild(el);
    });
  }

  function resetScan() {
    charged = false;
    solvedCount = 0;
    focusIndex = -1;
    locked = false;
    buildNodes();
    viewport.classList.remove('scanning');
    chargeBtn.disabled = false;
    consolePanel.innerHTML = '<p class="hint">Lens idle. Charge the thermal load to reveal the tonal signature of all six segments.</p>';
  }

  buildNodes();

  chargeBtn.addEventListener('click', () => {
    if (charged) return;
    charged = true;
    chargeBtn.disabled = true;
    viewport.classList.add('scanning');

    NODES.forEach((n, i) => {
      setTimeout(() => {
        const el = nodeGrid.children[i];
        if (!el) return;
        el.classList.add('scanned');
        el.classList.add(n.verdict === 'sound' ? 'cool' : 'hot');
        const temp = el.querySelector('[data-temp]');
        const foot = el.querySelector('[data-foot]');
        temp.textContent = n.verdict === 'sound' ? n.coolTemp : n.hotTemp;
        foot.textContent = '▸ CLICK TO FOCUS LENS';
      }, 240 + i * 210);
    });

    setTimeout(() => {
      viewport.classList.remove('scanning');
      consolePanel.innerHTML = '<p class="hint">Scan complete. Six tonal signatures logged. Select a tile to lock the lens and issue a diagnostic verdict.</p>';
    }, 240 + NODES.length * 210 + 250);
  });

  resetBtn.addEventListener('click', resetScan);

  nodeGrid.addEventListener('click', (e) => {
    const el = e.target.closest('.node');
    if (!el || !charged) return;
    if (el.classList.contains('sealed')) return;
    focusNode(Number(el.dataset.idx));
  });

  function focusNode(i) {
    const n = NODES[i];
    const el = nodeGrid.children[i];
    if (!el || el.classList.contains('sealed')) return;
    focusIndex = i;
    locked = false;

    Array.prototype.forEach.call(nodeGrid.querySelectorAll('.node'), (x) => x.classList.remove('focused'));
    el.classList.add('focused');

    consolePanel.innerHTML =
      '<div class="console-head">' +
        '<span>LENS LOCKED · ' + n.id + '</span>' +
        '<span>' + (n.verdict === 'sound' ? 'READING: COOL · ' + n.coolTemp : 'READING: WHITE-HOT · ' + n.hotTemp) + '</span>' +
      '</div>' +
      '<p class="console-quote">' + n.text + '</p>' +
      '<p class="hint">Issue a diagnostic verdict for this segment. Only one is structurally correct.</p>' +
      '<div style="margin-top:12px;">' +
        '<button class="btn green wide" data-v="sound">✅ CERTIFY: SOUND TONE</button>' +
      '</div>' +
      '<div class="verdict-grid">' +
        '<button class="btn hazard" data-v="value">🔥 VALUE TRAP</button>' +
        '<button class="btn hazard" data-v="causal">🔥 CAUSAL LEAP</button>' +
        '<button class="btn hazard" data-v="definition">🔥 DEFINITIONAL SHIFT</button>' +
        '<button class="btn hazard" data-v="sample">🔥 MICRO-SAMPLE MIRAGE</button>' +
      '</div>' +
      '<div id="fbSlot"></div>';
  }

  consolePanel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-v]');
    if (!btn || locked) return;
    const i = focusIndex;
    if (i < 0) return;
    const n = NODES[i];
    const el = nodeGrid.children[i];
    const fbSlot = consolePanel.querySelector('#fbSlot');
    const chosen = btn.dataset.v;

    if (chosen === n.verdict) {
      locked = true;
      el.classList.remove('hot');
      el.classList.add('sealed', 'cool');
      el.querySelector('[data-temp]').textContent = n.verdict === 'sound' ? n.coolTemp : 'SEALED · COOL';
      el.querySelector('[data-foot]').textContent = '✔ VERIFIED · NO LEAK';
      el.classList.remove('focused');

      fbSlot.innerHTML = '<div class="feedback good"><b>◈ VERDICT ACCEPTED · TILE SEALED</b>' + n.good + '</div>';

      solvedCount++;
      award(100, 10);

      if (solvedCount === NODES.length) {
        setTimeout(() => {
          consolePanel.querySelector('#fbSlot').innerHTML +=
            '<div class="feedback good" style="margin-top:10px;"><b>◈ FULL ARRAY CLEARED</b>All six tonal segments are now certified or repaired. The editorial holds its register from first line to last.</div>';
        }, 500);
      }
    } else {
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 500);
      btn.classList.add('eliminated');
      btn.disabled = true;

      fbSlot.innerHTML = '<div class="feedback bad"><b>◈ MISDIAGNOSIS · TILE STILL LEAKING</b>' + n.bad + '</div>';
    }
  });

  /* ============================================================
     SECTION 04 — NEGATION DETONATOR
     ============================================================ */
  const detPlate = root.querySelector('#detPlate');
  const detClaim = root.querySelector('#detClaim');
  const detonateBtn = root.querySelector('#detonateBtn');
  const detDebrief = root.querySelector('#detDebrief');

  let detonated = false;

  // Fragment the claim into word spans for the collapse effect
  (function fragmentClaim() {
    const words = detClaim.textContent.trim().split(/\s+/);
    detClaim.innerHTML = words.map(w => '<span class="frag">' + w + '</span>').join(' ');
  })();

  detonateBtn.addEventListener('click', () => {
    if (detonated) return;
    detonated = true;
    detonateBtn.disabled = true;
    detonateBtn.textContent = '💥 DETONATION IN PROGRESS…';

    detPlate.classList.add('detonating');

    setTimeout(() => {
      const frags = detClaim.querySelectorAll('.frag');
      Array.prototype.forEach.call(frags, (s) => {
        s.style.transition = 'transform .95s cubic-bezier(.2,.8,.2,1), opacity .95s ease';
        const dx = (Math.random() * 2 - 1) * 130;
        const dy = (Math.random() * 2 - 1) * 90;
        const rot = (Math.random() * 2 - 1) * 75;
        s.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg)';
        s.style.opacity = '0';
      });
      detPlate.classList.remove('detonating');
      detPlate.classList.add('collapsed');
    }, 1100);

    setTimeout(() => {
      detDebrief.classList.add('show');
      detonateBtn.textContent = '💥 NEGATION CONFIRMED';
      award(100, 8);
    }, 1750);
  });

  /* ============================================================
     SECTION 05 — LIVE FIRE FORENSICS
     ============================================================ */
  const fxPassage = root.querySelector('#fxPassage');
  const inspector = root.querySelector('#inspector');
  const modeButtons = root.querySelectorAll('[data-mode]');

  const NOTES = {
    grounds: '<h4>🟢 CHANNEL: FOUNDATION / GROUNDS</h4><ul>' +
      '<li><strong>3 ground clusters detected.</strong> Two are bounded and independently sourced: the 2019–2023 district audits and the voluntary spring survey of 84 respondents.</li>' +
      '<li><strong>One is a duration marker, not evidence.</strong> "The ban has been in place for one semester" tells us how long, not how much — it supports no conclusion on its own.</li>' +
      '<li><strong>Sufficiency flag:</strong> the survey is voluntary, so its 61-of-84 result is a self-selected cohort. Grounds exist, but they are thinner than the register implies.</li>' +
      '</ul>',
    claims: '<h4>🔵 CHANNEL: CORE CLAIMS / OUTCOMES</h4><ul>' +
      '<li><strong>Node A — bounded:</strong> "cut hallway incidents by 14%" is a specific, checkable outcome.</li>' +
      '<li><strong>Node B — unbounded:</strong> "any school that keeps phones in classrooms is failing its students" is a universal verdict the grounds cannot reach.</li>' +
      '<li><strong>Node C — closure claim:</strong> "the experiment is settled; the evidence is overwhelming" asserts certainty where the evidence is suggestive. Watch the temperature rise as the claims widen.</li>' +
      '</ul>',
    warrants: '<h4>🟠 CHANNEL: UNSTATED MECHANISMS / WARRANTS</h4><ul>' +
      '<li><strong>Bridge 1:</strong> "disruptions happen when students have nothing to do, so removing the phones removes the disruptions." Asserted, never tested — and it ignores every other cause of disruption.</li>' +
      '<li><strong>Bridge 2:</strong> "calm classrooms and learning are the same thing." A definitional collapse that silently converts a hallway metric into an academic outcome.</li>' +
      '<li><strong>Load path:</strong> the absolute verdict in the next sentence rests entirely on Bridge 2. Remove it and the conclusion has no support at all.</li>' +
      '</ul>'
  };

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      fxPassage.classList.remove('mode-grounds', 'mode-claims', 'mode-warrants');
      fxPassage.classList.add('mode-' + btn.dataset.mode);
      inspector.innerHTML = NOTES[btn.dataset.mode];
    });
  });

  const clearance = root.querySelector('#clearance');
  const hypoButtons = root.querySelectorAll('.hypo');
  let flawSolved = false;

  hypoButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (flawSolved) return;
      if (btn.dataset.correct === 'true') {
        flawSolved = true;
        btn.classList.add('green');
        clearance.classList.add('show');
        hypoButtons.forEach((b) => { if (b !== btn) b.disabled = true; });
        award(100, 7);
      } else {
        btn.classList.add('hazard');
        btn.textContent = btn.textContent + '  ✖ REJECTED';
        btn.disabled = true;
        if (btn.dataset.hyp === 'A') {
          inspector.innerHTML = '<h4>◈ REJECTED — HYPOTHESIS A</h4><ul><li>Register consistency is not the failure here; the diction stays controlled throughout.</li><li>The leak is structural, not stylistic: the conclusion depends on a bridge the piece never defends.</li></ul>';
        } else {
          inspector.innerHTML = '<h4>◈ REJECTED — HYPOTHESIS C</h4><ul><li>Partly true, and deliberately planted as a decoy. A one-semester timeline weakens the evidence — that is a sufficiency problem.</li><li>But it is not the fatal dependency: with ten semesters of data, the absolute conclusion would still be unsupported, because the bridge would still be missing.</li></ul>';
        }
      }
    });
  });

  /* ============================================================
     FINISH
     ============================================================ */
  const finishBtn = root.querySelector('#finishBtn');
  finishBtn.addEventListener('click', () => {
    if (typeof window.polymathFinishLesson === 'function') {
      window.polymathFinishLesson();
    }
  });
});
