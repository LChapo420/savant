
  // The boot flag is declared before anything that can call initLesson.
  //
  // It was written after them, and the call below fires immediately when the page
  // has already loaded — which is the case here, because this script is loaded
  // after the page it belongs to. So `initLesson` ran before `__lessonBooted` had
  // been initialised, which is a temporal-dead-zone ReferenceError: the throw
  // aborted the rest of this script, `__lessonBooted` was never initialised at
  // all, and every later call failed the same way. The lesson's whole interactive
  // layer was dead, and the page looked completely normal.
  let __lessonBooted = false;

  document.addEventListener('DOMContentLoaded', () => { initLesson(); });
  if (document.readyState !== 'loading') { initLesson(); }

  function initLesson() {
    if (__lessonBooted) return;
    __lessonBooted = true;

    const root = document.getElementById('base-lesson-body');
    if (!root) return;

    /* ---------------- STATE ---------------- */
    const state = {
      xp: 0,
      integrity: 25,
      rigSolved: 0,
      arenaSolved: false,
      forensicsSolved: false
    };

    const xpVal = document.getElementById('xpVal');
    const gaugeFill = document.getElementById('gaugeFill');
    const gaugeVal = document.getElementById('gaugeVal');
    const gaugeWrap = document.getElementById('gaugeWrap');
    const termStatus = document.getElementById('termStatus');

    function addXP(n) {
      state.xp += n;
      xpVal.textContent = state.xp;
      xpVal.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
        { duration: 420, easing: 'ease-out' }
      );
    }

    function addIntegrity(n) {
      state.integrity = Math.min(100, state.integrity + n);
      gaugeFill.style.width = state.integrity + '%';
      if (state.integrity >= 100) {
        gaugeWrap.classList.add('secured');
        gaugeVal.textContent = '100% SECURED';
        termStatus.textContent = '◈ STRUCTURE SECURED & VERIFIED — 100% STRUCTURAL INTEGRITY';
        termStatus.classList.add('secured');
      } else {
        gaugeVal.textContent = state.integrity + '% CALIBRATION';
        termStatus.textContent = '◈ CALIBRATION INCOMPLETE — ' + state.integrity + '% STRUCTURAL INTEGRITY';
      }
    }

    /* ================= SECTION 03 : NEGATION DETONATOR RIG ================= */

    const RIG_ROUNDS = [
      {
        claim: 'Therefore, describing a politician\u2019s corruption as "egregious" is a misuse, since the Latin e-gregius means "standing out from the herd" in a neutral or even flattering sense.',
        struts: [
          {
            text: '"Egregious" derives from Latin e- (out of) + grex (flock); its earliest attested English sense was "distinguished, eminent."',
            loadBearing: false,
            kind: 'Stated Grounds — verified historical record'
          },
          {
            text: 'A word\u2019s present meaning is governed by its earliest literal etymology.',
            loadBearing: true,
            kind: 'Unstated Warrant — LOAD-BEARING'
          },
          {
            text: 'The claim concerns modern standard American English usage in formal prose.',
            loadBearing: false,
            kind: 'Scope Qualifier — range limiter'
          },
          {
            text: 'The word appeared in a newspaper editorial about municipal corruption.',
            loadBearing: false,
            kind: 'Background Context — decorative detail'
          }
        ],
        success: 'DETONATION SUCCESSFUL. Negating the bridge \u2014 "present meaning is not governed by earliest literal etymology" \u2014 removes the only support holding the usage verdict in place, and the capsule drops intact into the debris tray. This is the Etymological Fallacy: a true historical record was asked to license a verdict about contemporary meaning.',
        failGrounds: 'STRUT SEVERED \u2014 CAPSULE STABLE. You cut a verified historical record, which supplies raw material rather than inferential weight; the claim is still hanging. Locate the strut that states the unstated principle licensing the leap.',
        failScope: 'STRUT SEVERED \u2014 CAPSULE STABLE. You cut a scope qualifier, which constrains range rather than carrying support; the inference is untouched. Locate the strut that states the unstated principle licensing the leap.',
        failContext: 'STRUT SEVERED \u2014 CAPSULE STABLE. You cut a decorative context plate that the inference never rested on. Locate the strut that states the unstated principle licensing the leap.',
        failNone: 'INERT CHARGE. No circuit was inverted, so the claim capsule never lost support. Flip the strut you believe is the unstated warrant to NEGATE, then fire again.'
      },
      {
        claim: 'Therefore, the poet\u2019s phrase "a sanguine disposition" describes a bloodthirsty, violent temperament.',
        struts: [
          {
            text: '"Sanguine" descends from Latin sanguis, "blood," and humoral theory linked blood to a hopeful, ruddy temperament.',
            loadBearing: false,
            kind: 'Stated Grounds — verified historical record'
          },
          {
            text: 'The claim is about a twentieth-century poem read by modern secondary students.',
            loadBearing: false,
            kind: 'Scope Qualifier — range limiter'
          },
          {
            text: 'Where a word\u2019s historical or technical sense is recoverable, that sense overrides the sense established by the surrounding literary context.',
            loadBearing: true,
            kind: 'Unstated Warrant — LOAD-BEARING'
          },
          {
            text: 'The phrase occurs in a line describing a friend\u2019s temperament.',
            loadBearing: false,
            kind: 'Background Context — decorative detail'
          }
        ],
        success: 'DETONATION SUCCESSFUL. With "context does not yield to historical sense" inverted, the poem\u2019s surrounding language regains authority and the bloodthirsty reading has nothing left to stand on. The original argument committed a Definitional Shift \u2014 smuggling a technical sense past the contextual one that governs the line.',
        failGrounds: 'STRUT SEVERED \u2014 CAPSULE STABLE. The etymology you cut is accurate but inert; it feeds the argument without holding it up. Locate the strut that states the unstated principle licensing the leap.',
        failScope: 'STRUT SEVERED \u2014 CAPSULE STABLE. Cutting a scope qualifier only changes how far the claim reaches, not whether it stands. Locate the strut that states the unstated principle licensing the leap.',
        failContext: 'STRUT SEVERED \u2014 CAPSULE STABLE. That descriptive detail carries no inferential weight at all. Locate the strut that states the unstated principle licensing the leap.',
        failNone: 'INERT CHARGE. No circuit was inverted, so the claim capsule never lost support. Flip the strut you believe is the unstated warrant to NEGATE, then fire again.'
      },
      {
        claim: 'Therefore, all ninth graders in the district will gain roughly eleven points of verbal ability if they enrol in Latin.',
        struts: [
          {
            text: 'District Latin enrolment rose from 90 to 240 students over the decade under review.',
            loadBearing: false,
            kind: 'Stated Grounds — verified historical record'
          },
          {
            text: 'The claim covers every ninth grader in the district, not only current Latin students.',
            loadBearing: false,
            kind: 'Scope Qualifier — range limiter'
          },
          {
            text: 'The state verbal assessment is administered each spring in grades 9\u201312.',
            loadBearing: false,
            kind: 'Background Context — decorative detail'
          },
          {
            text: 'The eleven-point verbal gain was produced by Latin enrolment rather than by any concurrent change in the cohort, the curriculum, or the testing population.',
            loadBearing: true,
            kind: 'Unstated Warrant — LOAD-BEARING'
          }
        ],
        success: 'DETONATION SUCCESSFUL. Inverting the causal bridge leaves the parallel rise entirely unexplained, and the district-wide mandate collapses into a bare correlation. This is the Causal Leap: a confounded ten-year trend was quietly converted into a mechanism.',
        failGrounds: 'STRUT SEVERED \u2014 CAPSULE STABLE. The enrolment figures are a factual record, not the support beam; severing them contradicts the district\u2019s data rather than dismantling the inference. Locate the strut that states the unstated principle licensing the leap.',
        failScope: 'STRUT SEVERED \u2014 CAPSULE STABLE. You removed a range limiter, which changes how far the claim reaches but not whether it holds. Locate the strut that states the unstated principle licensing the leap.',
        failContext: 'STRUT SEVERED \u2014 CAPSULE STABLE. Administrative background detail carries no inferential weight. Locate the strut that states the unstated principle licensing the leap.',
        failNone: 'INERT CHARGE. No circuit was inverted, so the claim capsule never lost support. Flip the strut you believe is the unstated warrant to NEGATE, then fire again.'
      }
    ];

    let rigIndex = 0;
    let rigState = [];
    let rigLocked = false;

    const capsule = document.getElementById('capsule');
    const capsuleText = document.getElementById('capsuleText');
    const roundNum = document.getElementById('roundNum');
    const strutGrid = document.getElementById('strutGrid');
    const chamberGlass = document.getElementById('chamberGlass');
    const chamberAlert = document.getElementById('chamberAlert');
    const debrisField = document.getElementById('debrisField');
    const rigReadout = document.getElementById('rigReadout');
    const fireBtn = document.getElementById('fireBtn');
    const nextBtn = document.getElementById('nextBtn');
    const rigDots = Array.from(document.querySelectorAll('#rigProgress .rig-dot'));

    function loadRound(i) {
      const round = RIG_ROUNDS[i];
      rigState = round.struts.map(() => false);
      rigLocked = false;

      capsule.classList.remove('shattered', 'cracking');
      capsule.style.opacity = '';
      capsule.style.transform = '';
      chamberGlass.classList.remove('breach', 'shake');
      chamberAlert.classList.remove('on');
      debrisField.innerHTML = '';
      strutGrid.classList.remove('revealed');
      strutGrid.innerHTML = '';
      nextBtn.hidden = true;
      fireBtn.hidden = false;
      fireBtn.disabled = false;

      capsuleText.textContent = round.claim;
      roundNum.textContent = String(i + 1);

      const letters = ['A', 'B', 'C', 'D'];
      round.struts.forEach((s, idx) => {
        const el = document.createElement('div');
        el.className = 'strut';
        el.dataset.idx = String(idx);
        el.innerHTML =
          '<div class="strut-head">' +
            '<span class="strut-id">CANDIDATE STRUT ' + letters[idx] + '</span>' +
            '<span class="strut-switch">ASSERT</span>' +
          '</div>' +
          '<p class="strut-text">' + s.text + '</p>' +
          '<div class="strut-status">STRUCTURAL INTEGRITY: HOLDING</div>' +
          '<div class="strut-kind">' + s.kind + '</div>';
        el.addEventListener('click', () => toggleStrut(idx, el));
        strutGrid.appendChild(el);
      });

      rigDots.forEach((d, di) => {
        d.classList.remove('active', 'done');
        if (di < i) d.classList.add('done');
        if (di === i) d.classList.add('active');
      });

      rigReadout.className = 'readout';
      rigReadout.innerHTML = '<span class="ro-label">RIG TELEMETRY · ROUND ' + (i + 1) + ' OF 3</span>' +
        'Four struts mounted beneath the capsule. Read each candidate carefully, flip the one you believe is the unstated warrant to NEGATE, then fire.';
    }

    function toggleStrut(idx, el) {
      if (rigLocked) return;
      rigState[idx] = !rigState[idx];
      const sw = el.querySelector('.strut-switch');
      const st = el.querySelector('.strut-status');
      if (rigState[idx]) {
        el.classList.add('negated');
        sw.textContent = 'NEGATE';
        st.textContent = 'SEVERED — STRUT REMOVED';
      } else {
        el.classList.remove('negated');
        sw.textContent = 'ASSERT';
        st.textContent = 'STRUCTURAL INTEGRITY: HOLDING';
      }
    }

    function spawnDebris() {
      debrisField.innerHTML = '';
      for (let i = 0; i < 16; i++) {
        const d = document.createElement('i');
        d.className = 'debris';
        d.style.setProperty('--dx', (Math.random() * 300 - 150) + 'px');
        d.style.setProperty('--dy', (Math.random() * -200 - 40) + 'px');
        d.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
        d.style.left = (28 + Math.random() * 44) + '%';
        d.style.top = (28 + Math.random() * 32) + '%';
        d.style.animationDelay = (Math.random() * 0.22) + 's';
        if (i % 3 === 0) {
          d.style.background = 'var(--violet)';
          d.style.boxShadow = '0 0 10px var(--violet-glow)';
        } else if (i % 3 === 1) {
          d.style.background = 'var(--gold)';
          d.style.boxShadow = '0 0 10px var(--gold-glow)';
        }
        debrisField.appendChild(d);
      }
    }

    fireBtn.addEventListener('click', () => {
      if (rigLocked) return;
      const round = RIG_ROUNDS[rigIndex];
      const negatedIdx = rigState.map((v, i) => v ? i : -1).filter(i => i >= 0);

      rigLocked = true;
      strutGrid.classList.add('revealed');

      if (negatedIdx.length === 0) {
        chamberGlass.classList.add('shake');
        setTimeout(() => chamberGlass.classList.remove('shake'), 600);
        rigReadout.className = 'readout bad';
        rigReadout.innerHTML = '<span class="ro-label">FIRING SEQUENCE ABORTED</span>' + round.failNone;
        rigLocked = false;
        return;
      }

      const loadIdx = round.struts.findIndex(s => s.loadBearing);

      if (rigState[loadIdx]) {
        /* SUCCESS */
        chamberAlert.classList.add('on');
        chamberGlass.classList.add('breach');
        capsule.classList.add('cracking');
        spawnDebris();
        setTimeout(() => { capsule.classList.add('shattered'); }, 380);

        rigReadout.className = 'readout ok';
        rigReadout.innerHTML = '<span class="ro-label">DETONATION SUCCESSFUL · CLAIM CAPSULE SHATTERED</span>' + round.success;

        state.rigSolved += 1;
        addXP(100);
        addIntegrity(15);

        const dot = rigDots[rigIndex];
        if (dot) { dot.classList.remove('active'); dot.classList.add('done'); }

        fireBtn.hidden = true;
        if (rigIndex < RIG_ROUNDS.length - 1) {
          nextBtn.hidden = false;
        } else {
          rigReadout.innerHTML += '<br><br><strong>RIG CERTIFIED — all three claim capsules collapsed under negation. The detonator is now cleared for live-fire forensics.</strong>';
        }
      } else {
        /* FAILURE */
        chamberGlass.classList.add('shake');
        setTimeout(() => chamberGlass.classList.remove('shake'), 600);

        const cutIdx = negatedIdx[0];
        const cut = round.struts[cutIdx];
        let msg;
        if (cut.kind.indexOf('Grounds') >= 0) msg = round.failGrounds;
        else if (cut.kind.indexOf('Scope') >= 0) msg = round.failScope;
        else msg = round.failContext;

        rigReadout.className = 'readout bad';
        rigReadout.innerHTML = '<span class="ro-label">NEGATION TEST FAILED · CAPSULE INTACT</span>' + msg;

        setTimeout(() => {
          rigState = round.struts.map(() => false);
          Array.from(strutGrid.children).forEach(el => {
            el.classList.remove('negated');
            el.querySelector('.strut-switch').textContent = 'ASSERT';
            el.querySelector('.strut-status').textContent = 'STRUCTURAL INTEGRITY: HOLDING';
          });
          rigLocked = false;
        }, 500);
      }
    });

    nextBtn.addEventListener('click', () => {
      rigIndex += 1;
      if (rigIndex >= RIG_ROUNDS.length) { nextBtn.hidden = true; return; }
      loadRound(rigIndex);
    });

    loadRound(0);

    /* ================= SECTION 04 : NEGATION DETONATOR ARENA ================= */

    const detonateBtn = document.getElementById('detonateBtn');
    const detCard = document.getElementById('detCard');
    const debriefOverlay = document.getElementById('debriefOverlay');
    const debriefClose = document.getElementById('debriefClose');
    let detonating = false;

    detonateBtn.addEventListener('click', () => {
      if (detonating) return;
      detonating = true;
      detonateBtn.disabled = true;
      detonateBtn.textContent = '💥 SEQUENCE RUNNING…';

      detCard.classList.add('flash');
      setTimeout(() => { detCard.classList.add('crack'); }, 520);
      setTimeout(() => { detCard.classList.add('collapse'); }, 1150);
      setTimeout(() => {
        debriefOverlay.classList.add('on');
        if (!state.arenaSolved) {
          state.arenaSolved = true;
          addXP(100);
          addIntegrity(15);
        }
        detonateBtn.textContent = '💥 NEGATION TEST COMPLETE';
      }, 1900);
    });

    debriefClose.addEventListener('click', () => {
      debriefOverlay.classList.remove('on');
    });

    /* ================= SECTION 05 : LIVE FIRE FORENSICS ================= */

    const passage = document.getElementById('passage');
    const notesList = document.getElementById('notesList');
    const scanBtns = Array.from(document.querySelectorAll('.scan-btn'));
    let activeMode = null;

    const MODE_META = {
      grounds: { cls: 'g', label: 'GROUNDS' },
      core: { cls: 'c', label: 'CORE CLAIM' },
      warrant: { cls: 'w', label: 'UNSTATED WARRANT' }
    };

    function renderNotes(mode) {
      const spans = Array.from(passage.querySelectorAll('span[data-scan="' + mode + '"]'));
      const meta = MODE_META[mode];
      if (!spans.length) {
        notesList.innerHTML = '<p class="muted">No elements detected in this channel.</p>';
        return;
      }
      let html = '';
      spans.forEach((sp, i) => {
        const text = sp.textContent.trim();
        const short = text.length > 68 ? text.slice(0, 68) + '…' : text;
        html += '<div class="note-item ' + meta.cls + '">' +
                  '<b>' + meta.label + ' ' + (i + 1) + '</b>' +
                  '<span style="display:block;color:#A9A9C6;font-size:0.72rem;margin-bottom:4px;">"' + short + '"</span>' +
                  sp.dataset.note +
                '</div>';
      });
      notesList.innerHTML = html;
    }

    scanBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (activeMode === mode) {
          activeMode = null;
          passage.classList.remove('scan-grounds', 'scan-core', 'scan-warrant');
          scanBtns.forEach(b => b.classList.remove('active'));
          notesList.innerHTML = '<p class="muted">Select a scan mode to illuminate the passage and load inspector notes.</p>';
          return;
        }
        activeMode = mode;
        passage.classList.remove('scan-grounds', 'scan-core', 'scan-warrant');
        passage.classList.add('scan-' + mode);
        scanBtns.forEach(b => b.classList.toggle('active', b === btn));
        renderNotes(mode);
      });
    });

    const hypoBtns = Array.from(document.querySelectorAll('.hypo'));
    const hypoFeedback = document.getElementById('hypoFeedback');
    let forensicsDone = false;

    hypoBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (forensicsDone) return;
        const correct = btn.dataset.correct === 'true';
        hypoFeedback.className = 'hypo-feedback on ' + (correct ? 'ok' : 'bad');
        hypoFeedback.innerHTML = (correct ? '<strong>✔ STRUCTURAL CLEARANCE GRANTED. </strong>' : '<strong>✘ HYPOTHESIS REJECTED. </strong>') + btn.dataset.fb;

        if (correct) {
          forensicsDone = true;
          btn.classList.add('correct');
          hypoBtns.forEach(b => { b.disabled = true; });
          if (!state.forensicsSolved) {
            state.forensicsSolved = true;
            addXP(100);
            addIntegrity(15);
          }
        } else {
          btn.classList.add('wrong');
          setTimeout(() => btn.classList.remove('wrong'), 700);
        }
      });
    });

    /* ================= TERMINATION ================= */

    const finishBtn = document.getElementById('finishBtn');
    finishBtn.addEventListener('click', () => {
      if (window.polymathFinishLesson && typeof window.polymathFinishLesson === 'function') {
        window.polymathFinishLesson();
      }
    });

    /* ================= INIT HUD ================= */
    gaugeFill.style.width = state.integrity + '%';
    gaugeVal.textContent = state.integrity + '% CALIBRATION';
    termStatus.textContent = '◈ CALIBRATION INCOMPLETE — ' + state.integrity + '% STRUCTURAL INTEGRITY';
    xpVal.textContent = '0';
  }
