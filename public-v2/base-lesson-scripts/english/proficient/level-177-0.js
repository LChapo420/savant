
(function () {
  var booted = false;

  function boot() {
    if (booted) return;
    booted = true;

    var root = document.getElementById('base-lesson-body');
    if (!root) return;

    /* ---------------- HUD STATE ---------------- */
    var xp = 0;
    var integrity = 25;
    var xpEl = document.getElementById('xpValue');
    var fillEl = document.getElementById('gaugeFill');
    var pctEl = document.getElementById('gaugePct');
    var stateEl = document.getElementById('gaugeState');

    function renderHud() {
      xpEl.textContent = xp;
      var p = Math.max(0, Math.min(100, integrity));
      fillEl.style.width = p + '%';
      pctEl.textContent = p + '%';
      if (p >= 100) {
        fillEl.classList.add('full');
        pctEl.style.color = 'var(--green)';
        stateEl.textContent = 'STRUCTURE SECURED & VERIFIED';
        stateEl.style.color = 'var(--green)';
      } else if (p >= 70) {
        fillEl.classList.remove('full');
        pctEl.style.color = 'var(--accent)';
        stateEl.textContent = 'STABILIZING';
        stateEl.style.color = 'var(--accent)';
      } else if (p >= 45) {
        fillEl.classList.remove('full');
        pctEl.style.color = 'var(--accent)';
        stateEl.textContent = 'PARTIALLY ANCHORED';
        stateEl.style.color = 'var(--muted)';
      } else {
        fillEl.classList.remove('full');
        pctEl.style.color = 'var(--accent)';
        stateEl.textContent = 'CALIBRATING';
        stateEl.style.color = 'var(--muted)';
      }
    }

    function addXp(n) { xp += n; renderHud(); }
    function addIntegrity(n) { integrity = Math.min(100, integrity + n); renderHud(); }
    renderHud();

    /* ---------------- SECTION 03 · PNEUMATIC TUBE BANK ---------------- */
    var CANISTERS = [
      {
        id: 'C-01',
        tag: 'value',
        text: 'Grammar instruction consumes forty minutes a week and produces no measurable gain on the state test, so the department should cut it.',
        note: 'The grounds are purely descriptive (minutes consumed, test movement) while the conclusion is prescriptive ("should cut"). The missing load-bearing premise is a value claim: "standardized-test gain is the only legitimate justification for curriculum time." Negate that premise and the conclusion evaporates.'
      },
      {
        id: 'C-02',
        tag: 'value',
        text: 'The novel unit takes three weeks while the short-story unit covers the same skills in one, so we should switch to short stories.',
        note: 'Efficiency is treated as the governing criterion without ever being argued for. The unstated premise is "instructional time is the decisive measure of a unit\u2019s worth." Negate it \u2014 suppose sustained immersion is itself a skill the short-story unit cannot build \u2014 and the recommendation collapses.'
      },
      {
        id: 'C-03',
        tag: 'causal',
        text: 'Districts with one-to-one laptop programs report higher writing scores, so laptops make students better writers.',
        note: 'The grounds establish co-variation across districts and nothing more. The mechanism is unnamed, and the confounding variable is obvious: districts wealthy enough to fund one-to-one programs also tend to have smaller classes and lower teacher turnover. Reverse causation is live as well.'
      },
      {
        id: 'C-04',
        tag: 'causal',
        text: 'Students who joined the debate club raised their argumentative-essay scores by twelve percent, so joining debate improves argumentation.',
        note: 'Two problems stack here. First, no control group: the scores may have risen because of the grade-level curriculum, maturation, or repeated practice. Second, the cohort self-selected \u2014 students who join debate are already disposed to argue carefully. The mechanism is asserted, never demonstrated.'
      },
      {
        id: 'C-05',
        tag: 'definitional',
        text: 'An argument is a quarrel, and quarrels are hostile; therefore teaching students to argue teaches them hostility.',
        note: 'Sense A is technical \u2014 an argument is a claim supported by grounds and a warrant. Sense B is colloquial \u2014 an argument is a heated personal conflict. The inference needs both senses at once. Force a single definition throughout and the chain breaks into incoherence.'
      },
      {
        id: 'C-06',
        tag: 'definitional',
        text: 'Rhetoric means manipulative political language, so a rhetorical analysis course trains students to manipulate.',
        note: 'The term shifts from "the study of how persuasion works" to "deliberate deception." The conclusion depends entirely on the second sense being identical to the first. Substitute the academic definition back into the conclusion and the inference vanishes.'
      },
      {
        id: 'C-07',
        tag: 'sample',
        text: 'We polled the eighteen members of the honor society and seventeen called the rubric fair, so the rubric is fair.',
        note: 'n = 18, drawn from a voluntary academic honor society \u2014 a cohort already selected for compliance with institutional standards. The students who did not join are structurally absent, and they are precisely the population most likely to object. The unstated bridge is "honor-society perceptions represent the whole school."'
      },
      {
        id: 'C-08',
        tag: 'sample',
        text: 'The five students who completed the optional summer reading module all earned A\u2019s, proving the module raises grades.',
        note: 'n = 5, opt-in, and survivor-biased: the students who finished an optional summer module are the ones already most likely to succeed without it. "Proving" is an absolute certainty word applied to a five-person self-selected cohort. This is the definition of an unrepresentative sample.'
      }
    ];

    var CHUTES = [
      { key: 'value', name: 'VALUE TRAP', desc: 'Prescribes a "should" with no stated value premise.' },
      { key: 'causal', name: 'CAUSAL LEAP', desc: 'Co-variation or sequence sold as direct cause.' },
      { key: 'definitional', name: 'DEFINITIONAL SHIFT', desc: 'One key term, two senses, mid-argument.' },
      { key: 'sample', name: 'MICRO-SAMPLE MIRAGE', desc: 'Tiny, voluntary, or survivor-biased sample.' }
    ];

    var rackEl = document.getElementById('canisterRack');
    var chutesEl = document.getElementById('chutes');
    var cradleEl = document.getElementById('cradle');
    var feedbackEl = document.getElementById('tubeFeedback');
    var routedEl = document.getElementById('routedCount');
    var bankStatusEl = document.getElementById('bankStatus');

    var selectedId = null;
    var routed = {};
    var routedCount = 0;

    function shorten(t) {
      return t.length > 62 ? t.slice(0, 60) + '\u2026' : t;
    }

    CANISTERS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'canister';
      b.setAttribute('data-id', c.id);
      var idSpan = document.createElement('span');
      idSpan.className = 'can-id';
      idSpan.textContent = c.id;
      var txSpan = document.createElement('span');
      txSpan.className = 'can-txt';
      txSpan.textContent = shorten(c.text);
      b.appendChild(idSpan);
      b.appendChild(txSpan);
      b.addEventListener('click', function () { selectCanister(c.id); });
      rackEl.appendChild(b);
    });

    CHUTES.forEach(function (ch, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chute';
      b.setAttribute('data-key', ch.key);
      var cap = document.createElement('span');
      cap.className = 'chute-cap';
      var nm = document.createElement('span');
      nm.className = 'chute-name';
      nm.textContent = 'CHUTE ' + (i + 1) + ' · ' + ch.name;
      var ds = document.createElement('span');
      ds.className = 'chute-desc';
      ds.textContent = ch.desc;
      var ac = document.createElement('span');
      ac.className = 'chute-act';
      ac.textContent = '\u2B06 DISPATCH CANISTER';
      b.appendChild(cap);
      b.appendChild(nm);
      b.appendChild(ds);
      b.appendChild(ac);
      b.addEventListener('click', function () { dispatch(ch.key); });
      chutesEl.appendChild(b);
    });

    function setFeedback(kind, title, body) {
      feedbackEl.className = 'feedback' + (kind === 'good' ? ' good' : kind === 'bad' ? ' bad' : '');
      feedbackEl.innerHTML = '';
      var t = document.createElement('span');
      t.className = 'fb-title';
      t.textContent = title;
      feedbackEl.appendChild(t);
      feedbackEl.appendChild(document.createTextNode(body));
    }

    function selectCanister(id) {
      if (routed[id]) return;
      var c = null;
      for (var i = 0; i < CANISTERS.length; i++) { if (CANISTERS[i].id === id) { c = CANISTERS[i]; } }
      if (!c) return;
      selectedId = id;

      var buttons = rackEl.querySelectorAll('.canister');
      for (var j = 0; j < buttons.length; j++) {
        buttons[j].classList.toggle('active', buttons[j].getAttribute('data-id') === id);
      }

      cradleEl.classList.remove('launching', 'shake');
      cradleEl.innerHTML = '';
      var head = document.createElement('div');
      head.className = 'cradle-head';
      var hid = document.createElement('span');
      hid.className = 'cradle-id';
      hid.textContent = c.id;
      var hst = document.createElement('span');
      hst.className = 'cradle-status';
      hst.textContent = 'SEALED \u00B7 AWAITING CHUTE ASSIGNMENT';
      head.appendChild(hid);
      head.appendChild(hst);
      var p = document.createElement('p');
      p.className = 'cradle-text';
      p.textContent = c.text;
      cradleEl.appendChild(head);
      cradleEl.appendChild(p);

      setFeedback('neutral', 'CRADLE LOADED', 'Canister ' + c.id + ' is sealed and pressurized. Read the argument, then dispatch it to the chute whose hazard archetype it depends on.');
    }

    function dispatch(key) {
      if (!selectedId) {
        setFeedback('bad', 'CRADLE EMPTY', 'No canister is sealed. Select one from the rack before attempting a dispatch.');
        return;
      }
      var c = null;
      for (var i = 0; i < CANISTERS.length; i++) { if (CANISTERS[i].id === selectedId) { c = CANISTERS[i]; } }
      if (!c) return;

      var chuteEl = chutesEl.querySelector('.chute[data-key="' + key + '"]');
      var chuteObj = null;
      for (var k = 0; k < CHUTES.length; k++) { if (CHUTES[k].key === key) { chuteObj = CHUTES[k]; } }

      if (c.tag === key) {
        routed[c.id] = true;
        routedCount++;
        routedEl.textContent = routedCount;

        var btn = rackEl.querySelector('.canister[data-id="' + c.id + '"]');
        if (btn) {
          btn.classList.add('done');
          btn.classList.remove('active');
        }

        if (chuteEl) {
          chuteEl.classList.add('flash');
          window.setTimeout(function () { chuteEl.classList.remove('flash'); }, 900);
        }

        cradleEl.classList.add('launching');

        addXp(100);
        addIntegrity(5);

        setFeedback('good', 'ROUTING CONFIRMED \u00B7 ' + chuteObj.name + ' \u00B7 +100 XP', c.note);

        selectedId = null;
        window.setTimeout(function () {
          cradleEl.classList.remove('launching');
          cradleEl.innerHTML = '<div class="cradle-empty">CRADLE EMPTY \u2014 Select a canister from the rack to seal it for inspection.</div>';
        }, 760);

        if (routedCount >= CANISTERS.length) {
          bankStatusEl.textContent = 'BANK CLEARED \u00B7 ALL CANISTERS ROUTED';
          bankStatusEl.style.color = 'var(--green)';
        } else {
          bankStatusEl.textContent = 'BANK PRESSURIZED \u00B7 ' + (CANISTERS.length - routedCount) + ' CANISTERS REMAINING';
        }
      } else {
        cradleEl.classList.add('shake');
        window.setTimeout(function () { cradleEl.classList.remove('shake'); }, 500);
        setFeedback('bad', 'ROUTING REJECTED \u00B7 SEAL BLOWN',
          'Canister ' + c.id + ' does not exhibit the ' + chuteObj.name + ' dependency. Re-read the argument and ask what must be true \u2014 but is never stated \u2014 for the conclusion to follow. No XP awarded.');
      }
    }

    /* ---------------- SECTION 04 · NEGATION DETONATOR ---------------- */
    var detBtn = document.getElementById('detonateBtn');
    var detBox = document.getElementById('detBox');
    var detStatus = document.getElementById('detStatus');
    var detDebrief = document.getElementById('detDebrief');
    var debrisLayer = document.getElementById('debrisLayer');
    var detonated = false;

    function spawnCracks() {
      var specs = [
        { w: '3px', h: '34%', left: '22%', top: '10%', rot: '12deg' },
        { w: '2px', h: '46%', left: '48%', top: '6%', rot: '-8deg' },
        { w: '3px', h: '30%', left: '72%', top: '18%', rot: '20deg' },
        { w: '2px', h: '26%', left: '34%', top: '52%', rot: '-26deg' },
        { w: '2px', h: '38%', left: '62%', top: '44%', rot: '9deg' }
      ];
      specs.forEach(function (s) {
        var d = document.createElement('div');
        d.className = 'crack';
        d.style.width = s.w;
        d.style.height = s.h;
        d.style.left = s.left;
        d.style.top = s.top;
        d.style.transform = 'rotate(' + s.rot + ')';
        detBox.appendChild(d);
      });
    }

    function spawnDebris() {
      var palette = ['#F59E0B', '#EF4444', '#A855F7', '#38BDF8', '#22C55E'];
      for (var i = 0; i < 22; i++) {
        var s = document.createElement('span');
        s.className = 'shard';
        var ang = Math.random() * Math.PI * 2;
        var dist = 60 + Math.random() * 190;
        s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
        s.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
        s.style.background = palette[i % palette.length];
        s.style.animationDelay = (Math.random() * 0.18) + 's';
        debrisLayer.appendChild(s);
      }
      window.setTimeout(function () {
        while (debrisLayer.firstChild) { debrisLayer.removeChild(debrisLayer.firstChild); }
      }, 1700);
    }

    detBtn.addEventListener('click', function () {
      if (detonated) return;
      detonated = true;
      detBtn.disabled = true;
      detBox.classList.add('charging');
      detStatus.textContent = 'STATUS \u00B7 NEGATION CIRCUIT LIVE \u2014 ASSUMPTION INVERTED';

      window.setTimeout(function () {
        detBox.classList.add('cracking');
        spawnCracks();
        detStatus.textContent = 'STATUS \u00B7 LOAD-BEARING DEPENDENCY DETECTED \u2014 STRUCTURE FAILING';
      }, 720);

      window.setTimeout(function () {
        detBox.classList.remove('charging');
        detBox.classList.add('collapsed');
        spawnDebris();
        detStatus.textContent = 'STATUS \u00B7 COLLAPSE COMPLETE \u2014 ASSUMPTION CONFIRMED FATAL';
        detStatus.style.color = 'var(--red)';
        detDebrief.classList.add('show');
        addXp(100);
        addIntegrity(20);
      }, 1560);
    });

    /* ---------------- SECTION 05 · LIVE FIRE FORENSICS ---------------- */
    var passageEl = document.getElementById('passage');
    var inspectorTitle = document.getElementById('inspectorTitle');
    var inspectorBody = document.getElementById('inspectorBody');

    var NOTES = {
      grounds: {
        title: '\u25C6 CHANNEL 01 \u2014 FOUNDATION SCAN',
        html: '<p>Three descriptive items are on the record: the twelve-week requirement, the AP mean movement from 2.8 to 3.4, and the one-third drop in referrals.</p>' +
              '<div class="note">All three are measurable in principle \u2014 but none is <em>independent</em> of the others. They all originate from the same school, the same three-year window, and the same reporting office. Independence fails before sufficiency is even tested.</div>'
      },
      claims: {
        title: '\u25C6 CHANNEL 02 \u2014 CORE CLAIM SCAN',
        html: '<p>Two claims are stacked. The first is causal: "it is clearly responsible for both trends." The second is prescriptive and universal: "every school in the district should therefore adopt."</p>' +
              '<div class="note">Note the certainty word <strong>"clearly."</strong> That word is doing rhetorical work, not evidentiary work. And "every school in the district" is a scope the single-site evidence cannot reach. The claim is far larger than its grounds.</div>'
      },
      warrants: {
        title: '\u25C6 CHANNEL 03 \u2014 UNSTATED MECHANISM SCAN',
        html: '<p>The passage <em>offers</em> a mechanism \u2014 "the rhetoric unit teaches students to identify fallacies and to build warrants" \u2014 but offering a plausible mechanism is not the same as verifying one.</p>' +
              '<div class="note">The genuinely unstated warrants are: (1) <strong>nothing else changed</strong> in three years that could move AP scores or referrals; (2) <strong>this school\u2019s population is comparable</strong> to every other school in the district. Neither is stated, and neither is testable from the evidence given.</div>'
      }
    };

    var modeBtns = root.querySelectorAll('.mode-btn');
    for (var m = 0; m < modeBtns.length; m++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var mode = btn.getAttribute('data-mode');
          for (var n = 0; n < modeBtns.length; n++) {
            modeBtns[n].classList.toggle('active', modeBtns[n] === btn);
          }
          passageEl.className = 'passage mode-' + mode;
          var note = NOTES[mode];
          inspectorTitle.textContent = note.title;
          inspectorBody.innerHTML = note.html;
        });
      })(modeBtns[m]);
    }
    passageEl.className = 'passage mode-grounds';

    var hypos = root.querySelectorAll('.hypo');
    var clearance = document.getElementById('clearance');
    var forensicsSolved = false;

    for (var h = 0; h < hypos.length; h++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          if (forensicsSolved) return;
          if (btn.getAttribute('data-correct') === 'yes') {
            forensicsSolved = true;
            btn.classList.add('correct');
            clearance.classList.add('show');
            for (var q = 0; q < hypos.length; q++) { hypos[q].disabled = true; }
            addXp(100);
            addIntegrity(15);
          } else {
            btn.classList.add('wrong');
            btn.disabled = true;
          }
        });
      })(hypos[h]);
    }

    /* ---------------- TERMINATION ---------------- */
    var finishBtn = document.getElementById('finishBtn');
    if (finishBtn) {
      finishBtn.addEventListener('click', function () {
        if (typeof window.polymathFinishLesson === 'function') {
          window.polymathFinishLesson();
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
