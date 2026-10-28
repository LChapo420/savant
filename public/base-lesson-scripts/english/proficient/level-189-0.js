
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('base-lesson-body');
  if (!root) return;

  /* ---------------- HUD STATE ---------------- */
  const TOTAL = 5;
  const state = { xp: 0, solved: new Set() };
  const xpEl = document.getElementById('l189-xp');
  const gaugeFill = document.getElementById('l189-gauge-fill');
  const gaugePct = document.getElementById('l189-gauge-pct');
  const gaugeLabel = document.getElementById('l189-gauge-label');

  function updateHUD() {
    xpEl.textContent = String(state.xp);
    const pct = 25 + (state.solved.size / TOTAL) * 75;
    gaugeFill.style.width = pct + '%';
    gaugePct.textContent = Math.round(pct) + '%';
    gaugeLabel.textContent =
      pct >= 100 ? 'Structure Secured & Verified' :
      pct >= 75 ? 'Load Path Stabilizing' :
      pct >= 50 ? 'Partial Calibration' : 'Calibration in Progress';
    if (pct >= 100) root.classList.add('is-complete');
  }

  function award(key, amount) {
    if (state.solved.has(key)) return false;
    state.solved.add(key);
    state.xp += amount;
    updateHUD();
    return true;
  }

  updateHUD();

  /* ---------------- SECTION 03: KEYSTONE ARCH SQUEEZER ---------------- */
  const ARCHES = [
    {
      claim: 'In her 2021 school-board address, Principal Alvarez shifts the later-start-time debate from logistics to child safety, leaving opponents no publicly available objection.',
      grounds: [
        '"78% of our students are walking to the bus stop before sunrise."',
        '"A teenager\u2019s brain is not awake at 7:10 a.m."'
      ],
      options: [
        {
          text: 'Alvarez\u2019s evidence is about sleep and safety, which are important topics for a school board to discuss.',
          ok: false,
          why: 'Relevance is not a bridge. This keystone restates that the evidence <em>matters</em> without explaining <em>how</em> it produces the claim\u2019s effect. The clamps find no connecting member and the arch shears.'
        },
        {
          text: 'By reclassifying a scheduling proposal as a safety measure, Alvarez makes opposition sound like an endorsement of physical risk \u2014 a cost no parent in the room can publicly accept.',
          ok: true,
          why: 'This keystone names the mechanism: reclassification changes the <em>social cost of dissent</em> for this specific audience. It connects the quoted grounds to the claim without importing an unstated value.'
        },
        {
          text: 'Alvarez uses statistics and pathos in her speech, which shows she is a skilled speaker.',
          ok: false,
          why: 'Device-spotting is not analysis. Labelling appeals tells us what is present in the text, never why it moves anyone. A label transfers no load.'
        },
        {
          text: 'Everyone already agrees that a child\u2019s wellbeing matters more than a bus schedule.',
          ok: false,
          why: 'This is a <strong>Value Trap</strong>. It smuggles in an unstated moral hierarchy and is circular \u2014 it assumes the very concession the claim is supposed to earn.'
        }
      ]
    },
    {
      claim: 'In "Delete the Plastic Aisle," the author\u2019s case for personal habit change never establishes that individual will is the binding constraint on plastic waste.',
      grounds: [
        '"Every year, Americans throw away 100 billion plastic bags." \u2014 an aggregate volume statistic.',
        '"Our grandparents carried canvas. We can too." \u2014 a nostalgic generational appeal.'
      ],
      options: [
        {
          text: 'The author uses nostalgia, which makes readers feel guilty about their shopping habits.',
          ok: false,
          why: 'A tone label with no mechanism. "Guilt" is asserted, never derived from the quoted line. The keystone carries nothing.'
        },
        {
          text: '100 billion is an enormous number, so the problem must be extremely serious.',
          ok: false,
          why: 'The magnitude of a problem is not evidence that individual will is its remedy. This keystone answers a question the claim never asked.'
        },
        {
          text: 'The grounds supply a condition (volume of waste) and a memory (past behaviour), but neither establishes that the barrier facing readers today is motivation rather than infrastructure.',
          ok: true,
          why: 'Correct. This keystone isolates the unstated warrant \u2014 <em>will is the binding constraint</em> \u2014 and shows that the supplied grounds never reach it. The arch locks because the bridge is now explicit.'
        },
        {
          text: 'Because plastic bags harm the environment, people should stop using them.',
          ok: false,
          why: 'This restates the conclusion as its own support. A circular keystone adds no new load-bearing capacity, and the clamps shear it instantly.'
        }
      ]
    },
    {
      claim: 'The author\u2019s use of the word "freedom" does considerably more work than his evidence can support.',
      grounds: [
        'Paragraph 2: "freedom" = the absence of a government fee.',
        'Paragraph 6: "freedom" = the ability to choose any product on the shelf.',
        'The conclusion requires both senses to operate simultaneously.'
      ],
      options: [
        {
          text: 'The author repeats the word "freedom," which shows that it is important to his argument.',
          ok: false,
          why: 'Frequency is not function. Repetition tells you a word is doing work; it never tells you <em>what</em> work. No bridge, no lock.'
        },
        {
          text: 'By sliding from a negative definition (no fee) to a positive one (unlimited choice) without signalling the change, the author lets the conclusion inherit the emotional force of both senses while being entailed by neither.',
          ok: true,
          why: 'This keystone names the equivocation precisely and shows why the shift is load-bearing: the conclusion needs both senses at once, and neither sense alone entails it. The arch holds.'
        },
        {
          text: 'Freedom is a core American value, so an argument built on it is automatically persuasive.',
          ok: false,
          why: 'Value Trap. It substitutes a shared moral preference for a structural explanation, and it assumes the conclusion it was meant to prove.'
        },
        {
          text: 'Paragraph 2 and paragraph 6 are about different things, which is confusing for the reader.',
          ok: false,
          why: 'A true observation with no mechanism. It never explains why the difference matters to the argument\u2019s conclusion, so no load is transferred.'
        }
      ]
    }
  ];

  let archIndex = 0;
  let selected = null;
  let busy = false;

  const stage = document.getElementById('l189-stage');
  const keystoneEl = document.getElementById('l189-keystone');
  const pressureWrap = document.getElementById('l189-pressure');
  const pressureFill = document.getElementById('l189-pressure-fill');
  const tonnageEl = document.getElementById('l189-tonnage');
  const archNumEl = document.getElementById('l189-arch-num');
  const archClaimEl = document.getElementById('l189-arch-claim');
  const archGroundsEl = document.getElementById('l189-arch-grounds');
  const archOptsEl = document.getElementById('l189-arch-options');
  const archReadout = document.getElementById('l189-arch-readout');
  const engageBtn = document.getElementById('l189-engage');
  const nextBtn = document.getElementById('l189-next');

  function setReadout(kind, title, body) {
    archReadout.className = 'l189-readout' + (kind ? ' ' + kind : '');
    archReadout.innerHTML = '<b>' + title + '</b>' + body;
  }

  function resetStage() {
    stage.classList.remove('engaged', 'fractured', 'locked');
    keystoneEl.classList.remove('seated', 'locked');
    pressureWrap.classList.remove('ok');
    pressureFill.style.width = '0%';
    tonnageEl.textContent = '0%';
    engageBtn.disabled = false;
    busy = false;
  }

  function renderArch() {
    const a = ARCHES[archIndex];
    selected = null;
    resetStage();
    archNumEl.textContent = String(archIndex + 1);
    archClaimEl.innerHTML = a.claim;
    archGroundsEl.innerHTML = a.grounds
      .map((g, i) => '<li><span class="l189-gnum">G' + (i + 1) + '</span>' + g + '</li>')
      .join('');
    archOptsEl.innerHTML = a.options
      .map((o, i) => '<button class="l189-opt" data-i="' + i + '">' + o.text + '</button>')
      .join('');
    Array.from(archOptsEl.children).forEach(btn => {
      btn.addEventListener('click', () => {
        if (busy) return;
        Array.from(archOptsEl.children).forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
        selected = parseInt(btn.dataset.i, 10);
        keystoneEl.classList.add('seated');
        setReadout('', 'Keystone Seated', 'Candidate bridge is in the slot. Engage the hydraulic clamps to apply full tonnage and test whether it transfers load.');
      });
    });
    nextBtn.disabled = true;
    setReadout('', 'Load Engineer Readout',
      'Select a candidate keystone, then engage the clamps. If the bridge is a mechanism, the arch locks. If it is a label, a restatement, or an unstated value, the stones shear apart.');
  }

  engageBtn.addEventListener('click', () => {
    if (busy) return;
    if (selected === null) {
      setReadout('bad', 'No Keystone Seated',
        'An empty slot cannot transfer load. Seat a candidate bridge before engaging the clamps \u2014 an analysis with no stated warrant has exactly this shape.');
      stage.classList.add('fractured');
      setTimeout(() => stage.classList.remove('fractured'), 700);
      return;
    }
    const a = ARCHES[archIndex];
    const opt = a.options[selected];
    busy = true;
    engageBtn.disabled = true;
    stage.classList.add('engaged');
    pressureFill.style.width = '100%';
    tonnageEl.textContent = '100%';

    setTimeout(() => {
      if (opt.ok) {
        stage.classList.add('locked');
        keystoneEl.classList.remove('seated');
        keystoneEl.classList.add('locked');
        pressureWrap.classList.add('ok');
        setReadout('ok', '✔ Arch Locked — Load Path Verified',
          opt.why + ' <br><br><strong>+100 XP</strong> awarded for a verified connecting bridge.');
        award('arch' + archIndex, 100);
        busy = false;
        nextBtn.disabled = archIndex >= ARCHES.length - 1;
      } else {
        stage.classList.add('fractured');
        keystoneEl.classList.remove('seated');
        setReadout('bad', '✖ Torque Fracture — Arch Collapsed',
          opt.why + ' <br><br>Re-seat a different keystone and re-engage.');
        pressureFill.style.width = '0%';
        tonnageEl.textContent = '0%';
        setTimeout(() => {
          stage.classList.remove('engaged', 'fractured');
          pressureFill.style.width = '0%';
          engageBtn.disabled = false;
          busy = false;
        }, 1400);
      }
    }, 900);
  });

  nextBtn.addEventListener('click', () => {
    if (archIndex < ARCHES.length - 1) {
      archIndex += 1;
      renderArch();
    }
  });

  renderArch();

  /* ---------------- SECTION 04: NEGATION DETONATOR ---------------- */
  const detArena = document.getElementById('l189-det-arena');
  const detPlate = document.getElementById('l189-det-plate');
  const negation = document.getElementById('l189-negation');
  const claimCard = document.getElementById('l189-claimcard');
  const crackOv = document.getElementById('l189-crackov');
  const detonateBtn = document.getElementById('l189-detonate');
  const resetDetBtn = document.getElementById('l189-reset-det');
  const debrief = document.getElementById('l189-debrief');
  let detonated = false;

  detonateBtn.addEventListener('click', () => {
    if (detonated) return;
    detonated = true;
    detonateBtn.disabled = true;
    negation.classList.add('show');
    detArena.classList.add('flash');
    crackOv.classList.add('show');
    detPlate.style.animation = 'l189-shake .4s ease 2';
    stageShake(detPlate);

    setTimeout(() => {
      claimCard.classList.add('collapsed');
      spawnDebris();
      debrief.classList.add('show');
      award('detonator', 100);
    }, 620);

    setTimeout(() => {
      detArena.classList.remove('flash');
      crackOv.classList.remove('show');
      detPlate.style.animation = '';
    }, 1500);
  });

  function stageShake(el) {
    el.style.animation = 'l189-shake .4s ease 2';
    setTimeout(() => { el.style.animation = ''; }, 900);
  }

  function spawnDebris() {
    const rect = claimCard.getBoundingClientRect();
    for (let i = 0; i < 16; i++) {
      const d = document.createElement('div');
      d.className = 'l189-debris';
      const x = Math.random() * Math.max(rect.width - 10, 10);
      const y = Math.random() * Math.max(rect.height - 10, 10);
      d.style.left = x + 'px';
      d.style.top = y + 'px';
      d.style.setProperty('--dx', (Math.random() * 220 - 110).toFixed(0) + 'px');
      d.style.setProperty('--dy', (Math.random() * 160 + 60).toFixed(0) + 'px');
      d.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
      d.style.background = i % 3 === 0 ? '#F59E0B' : (i % 3 === 1 ? '#EF4444' : '#6b6b74');
      claimCard.appendChild(d);
      requestAnimationFrame(() => d.classList.add('go'));
      setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 1100);
    }
  }

  resetDetBtn.addEventListener('click', () => {
    detonated = false;
    detonateBtn.disabled = false;
    negation.classList.remove('show');
    crackOv.classList.remove('show');
    claimCard.classList.remove('collapsed');
    debrief.classList.remove('show');
    claimCard.style.transform = '';
    claimCard.style.opacity = '';
    claimCard.style.filter = '';
  });

  /* ---------------- SECTION 05: LIVE FIRE FORENSICS ---------------- */
  const modeG = document.getElementById('l189-mode-g');
  const modeC = document.getElementById('l189-mode-c');
  const modeW = document.getElementById('l189-mode-w');
  const inspector = document.getElementById('l189-inspector');
  const passage = document.getElementById('l189-passage');

  const MODES = {
    g: { cls: 'x-g', root: 'mode-g', btn: modeG, label: 'Foundation / Grounds',
         blurb: 'Verbatim textual evidence. These members supply raw compressive strength \u2014 nothing more. They never analyse themselves.' },
    c: { cls: 'x-c', root: 'mode-c', btn: modeC, label: 'Core Claims / Outcomes',
         blurb: 'Assertions the essay must defend. Each one is a load the structure above it must carry.' },
    w: { cls: 'x-w', root: 'mode-w', btn: modeW, label: 'Unstated Mechanisms / Warrants',
         blurb: 'Where a bridge is missing or merely implied. These are the sites of structural failure.' }
  };

  let activeMode = null;

  function setMode(key) {
    const m = MODES[key];
    if (!m) return;
    const wasActive = activeMode === key;
    root.classList.remove('mode-g', 'mode-c', 'mode-w');
    Object.values(MODES).forEach(x => x.btn.classList.remove('on'));

    if (wasActive) {
      activeMode = null;
      inspector.innerHTML = '<h4>◈ Inspector Notes</h4><div class="l189-note">Scan channel disengaged. Reactivate a channel to inspect the specimen.</div>';
      return;
    }

    activeMode = key;
    root.classList.add(m.root);
    m.btn.classList.add('on');

    const spans = Array.from(passage.querySelectorAll('.' + m.cls));
    let html = '<h4>◈ ' + m.label + '</h4><div class="l189-note"><b>CHANNEL</b>' + m.blurb + '</div>';
    if (spans.length === 0) {
      html += '<div class="l189-note"><b>NO SIGNAL</b>No members of this class detected in the specimen.</div>';
    } else {
      spans.forEach((s, i) => {
        html += '<div class="l189-note"><b>' + m.label.toUpperCase().split(' ')[0] + ' #' + (i + 1) + '</b>' + (s.dataset.note || '') + '</div>';
      });
    }
    inspector.innerHTML = html;
  }

  modeG.addEventListener('click', () => setMode('g'));
  modeC.addEventListener('click', () => setMode('c'));
  modeW.addEventListener('click', () => setMode('w'));

  const hypoReadout = document.getElementById('l189-hypo-readout');
  const hypoWrap = document.getElementById('l189-hypos');
  let hypoSolved = false;

  Array.from(hypoWrap.children).forEach(btn => {
    btn.addEventListener('click', () => {
      if (hypoSolved) return;
      const ok = btn.dataset.ok === '1';
      if (ok) {
        btn.classList.add('good');
        hypoSolved = true;
        Array.from(hypoWrap.children).forEach(b => { b.disabled = true; });
        hypoReadout.className = 'l189-readout ok';
        hypoReadout.innerHTML = '<b>✔ Structural Clearance Granted</b>' +
          'You located the fatal flaw precisely: an over-claim plus a scope creep, held up by a warrant the essay never states. ' +
          'The grounds establish that the room felt unsafe and that teenagers are sleepy at 7:10 a.m. — they cannot establish a district-wide achievement gain. ' +
          'The missing bridge (<em>alertness in this room \u2192 measurable achievement across the district</em>) was carrying the whole paragraph, and it was never written down. ' +
          '<br><br><strong>+100 XP</strong> awarded.';
        award('forensics', 100);
      } else {
        btn.classList.add('bad');
        btn.disabled = true;
        hypoReadout.className = 'l189-readout bad';
        hypoReadout.innerHTML = '<b>✖ Not the Structural Failure</b>' +
          'That is a stylistic or quantitative complaint, not a structural one. Ask instead: which sentence asks the evidence to carry more weight than it can bear?';
      }
    });
  });

  /* ---------------- FINISH ---------------- */
  const finishBtn = document.getElementById('l189-finish');
  if (finishBtn) {
    finishBtn.addEventListener('click', () => {
      if (typeof window.polymathFinishLesson === 'function') {
        window.polymathFinishLesson();
      }
    });
  }
});
