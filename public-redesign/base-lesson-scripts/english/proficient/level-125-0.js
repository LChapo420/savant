
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('base-lesson-body');
  if (!root) return;

  /* ------------------------------------------------------------------ */
  /* DATA                                                                */
  /* ------------------------------------------------------------------ */
  const TUBES = [
    {
      id: 0, label: 'TUBE 01', word: 'ken', slot: 'p0',
      source: 'John Keats, “On First Looking into Chapman’s Homer” (1816)',
      excerpt: '“Then felt I like some watcher of the skies / When a new planet swims into his ken.”',
      claim: '“Ken” denotes the range or horizon of a person’s perception and knowledge.',
      options: [
        {
          t: '“Ken” descends from Old English cennan, “to make known”; the noun must therefore mean “a piece of information.”',
          ok: false,
          flaw: 'ETYMOLOGICAL LEAP — a root records a word’s history, not its present literary sense. The unstated bridge “root determines meaning” was carrying the whole claim.'
        },
        {
          t: 'The simile places an astronomer watching a new planet enter his field of view, so the noun must name the boundary of that field — the range of perception.',
          ok: true,
          why: 'the bridge is a mechanism, not a slogan: the simile’s visual frame is what licenses “range of perception”, and the grounds are relevant and sufficient.'
        },
        {
          t: '“Ken” survives in Scots as a verb meaning “to know”; Keats therefore uses it as a verb meaning “to understand.”',
          ok: false,
          flaw: 'DEFINITIONAL SHIFT — the cartridge silently changes the word’s part of speech mid-inference, so the claim no longer matches the syntax of the line.'
        }
      ],
      chosen: null, bonded: false, ruptured: false
    },
    {
      id: 1, label: 'TUBE 02', word: 'want', slot: 'p1',
      source: 'Jane Austen, Pride and Prejudice (1813), opening sentence',
      excerpt: '“It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.”',
      claim: '“Want” in “in want of” means lack or need — not desire.',
      options: [
        {
          t: 'Modern readers experience “want” as “desire”; the most familiar sense must be the sense Austen intends.',
          ok: false,
          flaw: 'VALUE TRAP — familiarity is not evidence. The cartridge ranks the reader’s modern connotation above the text’s own collocational signal, which is exactly the presumption that fails.'
        },
        {
          t: 'The fixed collocation “in want of” means “lacking”; the phrase, not the isolated word, fixes the sense.',
          ok: true,
          why: 'the bridge invokes collocational resistance — a fixed phrase constrains its parts, and the scope is correctly limited to “in want of”.'
        },
        {
          t: 'Because the sentence is ironic, “want” must mean the opposite of itself — “abundance.”',
          ok: false,
          flaw: 'CAUSAL LEAP — irony qualifies the whole proposition, it does not invert an individual lexical item. The bridge “irony flips every word” is a mechanism with no support.'
        }
      ],
      chosen: null, bonded: false, ruptured: false
    },
    {
      id: 2, label: 'TUBE 03', word: 'soliciting', slot: 'p2',
      source: 'William Shakespeare, Macbeth (c.1606), Act 1 Scene 3',
      excerpt: '“This supernatural soliciting / Cannot be ill, cannot be good.”',
      claim: '“Soliciting” names an incitement or urging acting upon Macbeth — not a request for sex or money.',
      options: [
        {
          t: '“Soliciting” today names an illegal proposition; the witches must therefore be propositioning Macbeth.',
          ok: false,
          flaw: 'DEFINITIONAL SHIFT — a modern legal-colloquial sense is imported wholesale into a 1606 text, so the conclusion rests on a meaning the passage never carries.'
        },
        {
          t: 'The witches hail Macbeth and vanish without asking him for anything; the participle must name a prompting that works on him from within.',
          ok: true,
          why: 'the grounds are drawn from the scene’s action, and the bridge correctly reads the participle as naming an internal pressure rather than a transaction.'
        },
        {
          t: '“Solicit” comes from Latin sollicitare, “to agitate”; the word must therefore mean physical shaking.',
          ok: false,
          flaw: 'ETYMOLOGICAL LEAP — the root supplies a historical sense, not this line’s sense. The bridge silently assumes the etymology overrides the dramatic situation.'
        }
      ],
      chosen: null, bonded: false, ruptured: false
    },
    {
      id: 3, label: 'TUBE 04', word: 'critical', slot: 'p3',
      source: 'William Shakespeare, Othello (c.1603), Act 2 Scene 1',
      excerpt: '“I am nothing if not critical.”',
      claim: '“Critical” here denotes fault-finding, censorious judgement — not measured evaluation.',
      options: [
        {
          t: '“Critical” is the standard academic term for evaluative analysis; Iago therefore claims the neutrality of a scholar.',
          ok: false,
          flaw: 'DEFINITIONAL SHIFT — an academic register is swapped in for a dramatic one, so the claim contradicts the character who is speaking it.'
        },
        {
          t: 'Iago has just itemised a catalogue of women’s faults and says he is “nothing if not” that quality; the word must name the fault-finding habit.',
          ok: true,
          why: 'the grounds come from the immediately preceding speech, and the bridge correctly treats a self-characterising boast as evidence about the word’s sense.'
        },
        {
          t: '“Critical” derives from Greek kritikos, “able to judge”; Iago therefore claims judicial authority.',
          ok: false,
          flaw: 'ETYMOLOGICAL LEAP — the root licenses a general sense of judging, not the specific authority Iago claims. The bridge supplies a conclusion the grounds never reach.'
        }
      ],
      chosen: null, bonded: false, ruptured: false
    }
  ];

  const state = {
    xp: 0,
    integrity: 25,
    selected: 0,
    rpm: 0,
    spinning: false,
    detonated: false,
    forensics: false
  };

  /* ------------------------------------------------------------------ */
  /* HELPERS                                                             */
  /* ------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);

  function gaugeLabel(v) {
    if (v >= 100) return 'STRUCTURE SECURED & VERIFIED';
    if (v >= 80) return 'NEAR RIGID';
    if (v >= 50) return 'PARTIAL LOAD';
    return 'CALIBRATION';
  }

  function addXP(n) {
    state.xp += n;
    const el = $('l125-xp');
    if (el) el.textContent = state.xp;
  }

  function setIntegrity(v) {
    state.integrity = Math.max(0, Math.min(100, v));
    const fill = $('l125-gauge-fill');
    const txt = $('l125-gauge-txt');
    const gauge = $('l125-gauge');
    const secured = $('l125-secured');
    if (fill) fill.style.width = state.integrity + '%';
    if (txt) txt.textContent = state.integrity + '% ' + gaugeLabel(state.integrity);
    if (gauge) gauge.classList.toggle('secured', state.integrity >= 100);
    if (secured) {
      secured.textContent = state.integrity >= 100
        ? 'INTEGRITY 100% — STRUCTURE SECURED & VERIFIED'
        : 'INTEGRITY ' + state.integrity + '% — ' + gaugeLabel(state.integrity);
      secured.classList.toggle('on', state.integrity >= 100);
    }
  }

  function log(kind, msg) {
    const box = $('l125-log');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'l125-log-line l125-log-' + kind;
    div.textContent = msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  /* ------------------------------------------------------------------ */
  /* CENTRIFUGE RENDERING                                                */
  /* ------------------------------------------------------------------ */
  function renderRotor() {
    const rotor = $('l125-rotor');
    if (!rotor) return;
    rotor.innerHTML = TUBES.map((t, i) => {
      const cls = [
        'l125-slot', t.slot,
        state.selected === i ? 'sel' : '',
        t.bonded ? 'bonded' : '',
        t.ruptured ? 'ruptured' : ''
      ].filter(Boolean).join(' ');
      return '<button class="' + cls + '" data-tube="' + i + '" type="button" aria-label="Select ' + t.label + '">' +
        '<span class="l125-slot-tag">' + t.label + '</span>' +
        '<span class="l125-slot-word">' + t.word + '</span>' +
        '<span class="l125-slot-led"></span>' +
        '</button>';
    }).join('');
  }

  function renderBay() {
    const t = TUBES[state.selected];
    if (!t) return;
    $('l125-bay-src').textContent = t.source;
    $('l125-bay-excerpt').textContent = t.excerpt;
    $('l125-bay-claim').innerHTML = '<b>CLAIM:</b> ' + t.claim;

    const wrap = $('l125-cartridges');
    wrap.innerHTML = t.options.map((o, i) => {
      const letter = String.fromCharCode(65 + i);
      const chosen = t.chosen === i ? ' chosen' : '';
      const dis = t.bonded ? ' disabled' : '';
      return '<button class="l125-cart' + chosen + '" data-opt="' + i + '" type="button"' + dis + '>' +
        '<span class="l125-cart-num">' + letter + '</span>' +
        '<span class="l125-cart-txt">' + o.t + '</span>' +
        '</button>';
    }).join('');
  }

  function refresh() {
    renderRotor();
    renderBay();
  }

  /* ------------------------------------------------------------------ */
  /* CENTRIFUGE INTERACTION                                              */
  /* ------------------------------------------------------------------ */
  root.addEventListener('click', (ev) => {
    const slot = ev.target.closest('.l125-slot');
    if (slot && root.contains(slot)) {
      const idx = parseInt(slot.dataset.tube, 10);
      if (!isNaN(idx)) {
        state.selected = idx;
        refresh();
      }
      return;
    }

    const cart = ev.target.closest('.l125-cart');
    if (cart && root.contains(cart)) {
      const t = TUBES[state.selected];
      if (!t || t.bonded) return;
      const optIdx = parseInt(cart.dataset.opt, 10);
      if (isNaN(optIdx)) return;
      t.chosen = optIdx;
      t.ruptured = false;
      refresh();
      log('warn', '▸ BRIDGE CARTRIDGE ' + String.fromCharCode(65 + optIdx) + ' seated in ' + t.label + ' (' + t.word + '). Ready to spin.');
      return;
    }
  });

  const rpmSlider = $('l125-rpm');
  if (rpmSlider) {
    rpmSlider.addEventListener('input', () => {
      state.rpm = parseInt(rpmSlider.value, 10) || 0;
      $('l125-rpm-out').textContent = state.rpm.toLocaleString() + ' G';
    });
  }

  function spin() {
    if (state.spinning) return;
    if (state.rpm < 9500) {
      log('warn', '⚠ INSUFFICIENT G-FORCE. The rotor is turning at ' + state.rpm.toLocaleString() +
        ' G; separation requires at least 9,500 G. Raise the drive lever before spinning.');
      return;
    }
    if (TUBES.every(t => t.bonded)) {
      log('good', '✔ ALL FOUR SAMPLES ALREADY BONDED. The rotor is balanced and stable — nothing left to separate.');
      return;
    }

    state.spinning = true;
    const rotor = $('l125-rotor');
    const btn = $('l125-spin-btn');
    if (rotor) rotor.classList.add('l125-spinning');
    if (btn) btn.disabled = true;

    setTimeout(() => {
      if (rotor) rotor.classList.remove('l125-spinning');
      state.spinning = false;
      if (btn) btn.disabled = false;
      resolveSpin();
    }, 2000);
  }

  function resolveSpin() {
    let newlyBonded = 0;

    TUBES.forEach((t) => {
      if (t.bonded) return;

      if (t.chosen === null) {
        t.ruptured = true;
        log('bad', '✖ ' + t.label + ' (' + t.word + ') — UNBALANCED LOAD. No bridge cartridge was installed, so the ' +
          'claim had nothing connecting it to its grounds. Unsupported output separated and vented at 10,000 G.');
        return;
      }

      const opt = t.options[t.chosen];

      if (opt.ok) {
        t.bonded = true;
        t.ruptured = false;
        newlyBonded++;
        log('good', '✔ ' + t.label + ' (' + t.word + ') — BONDED AND RIGID. The bridge you installed is structurally sound: ' +
          opt.why + ' The claim held its shape under full tonnage.');
      } else {
        t.ruptured = true;
        const flawText = opt.flaw;
        t.chosen = null;
        log('bad', '✖ ' + t.label + ' (' + t.word + ') — SEAL RUPTURE. ' + flawText +
          ' The sample separated into speculation and grounds.');
      }
    });

    if (newlyBonded > 0) {
      addXP(newlyBonded * 100);
      setIntegrity(state.integrity + newlyBonded * 15);
    }

    refresh();

    if (TUBES.every(t => t.bonded)) {
      log('good', '★ ROTOR BALANCED. All four meaning-claims are bonded to verified bridges. Structural integrity nominal.');
    } else {
      const remaining = TUBES.filter(t => !t.bonded).length;
      log('warn', '▸ ' + remaining + ' sample(s) still unverified. Reseat a cartridge in each ruptured tube and spin again.');
    }
  }

  function eject() {
    if (state.spinning) return;
    TUBES.forEach((t) => {
      if (!t.bonded) {
        t.chosen = null;
        t.ruptured = false;
      }
    });
    state.rpm = 0;
    if (rpmSlider) rpmSlider.value = 0;
    const out = $('l125-rpm-out');
    if (out) out.textContent = '0 G';
    refresh();
    log('warn', '⏏ ROTOR HALTED AND SAMPLES EJECTED. Bridge cartridges cleared from all unverified tubes. Re-seat and spin.');
  }

  const spinBtn = $('l125-spin-btn');
  if (spinBtn) spinBtn.addEventListener('click', spin);
  const ejectBtn = $('l125-eject-btn');
  if (ejectBtn) ejectBtn.addEventListener('click', eject);

  /* ------------------------------------------------------------------ */
  /* NEGATION DETONATOR                                                  */
  /* ------------------------------------------------------------------ */
  const detBtn = $('l125-detonate-btn');
  if (detBtn) {
    detBtn.addEventListener('click', () => {
      if (state.detonated) return;
      state.detonated = true;
      detBtn.disabled = true;
      detBtn.textContent = '💥 CHARGE SPENT';

      const det = $('l125-det');
      const debrief = $('l125-debrief');

      det.classList.add('det-flash');

      setTimeout(() => {
        det.classList.add('det-cracked');
      }, 650);

      setTimeout(() => {
        det.classList.add('det-collapsed');
        if (debrief) debrief.classList.add('show');
        addXP(100);
        setIntegrity(state.integrity + 5);
        log('good', '💣 NEGATION TEST COMPLETE. The aesthetic reading of “art” collapsed when its warrant was negated — the assumption was load-bearing.');
      }, 1500);
    });
  }

  /* ------------------------------------------------------------------ */
  /* LIVE FIRE FORENSICS                                                 */
  /* ------------------------------------------------------------------ */
  const passage = $('l125-passage');
  const notes = $('l125-fx-notes');
  const modeBtns = root.querySelectorAll('.l125-fx-mode');

  const MODE_LABEL = {
    g: 'FOUNDATION / GROUNDS',
    c: 'CORE CLAIMS / OUTCOMES',
    w: 'UNSTATED MECHANISMS / WARRANTS'
  };

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      modeBtns.forEach(b => b.classList.toggle('active', b === btn));
      if (passage) passage.setAttribute('data-mode', mode);

      if (!notes) return;
      const spans = passage ? passage.querySelectorAll('.' + mode) : [];
      let html = '<h4 style="margin-top:0;">' + MODE_LABEL[mode] + ' — ' + spans.length + ' SEGMENT(S)</h4>';
      spans.forEach((s, i) => {
        html += '<div class="l125-note"><b>SEGMENT ' + (i + 1) + '</b>' + (s.dataset.note || '') + '</div>';
      });
      notes.innerHTML = html;
    });
  });

  const hypBtns = root.querySelectorAll('.l125-hyp');
  const verdict = $('l125-fx-verdict');

  hypBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.forensics) return;
      const ok = btn.dataset.ok === '1';

      if (ok) {
        btn.classList.add('correct');
        hypBtns.forEach(b => { b.disabled = true; });
        state.forensics = true;
        if (verdict) {
          verdict.innerHTML = '<div class="l125-debrief show"><b>STRUCTURAL CLEARANCE GRANTED.</b> ' +
            'The harsher reading of “wayward” rests on a single unstated warrant: that a word’s modern moral connotation ' +
            'governs its meaning in an 1878 text. Negate that warrant and the reading loses its only support, while the ' +
            'grounds — the “field of battle” clause and the narrator’s “fervid nature” — remain intact for the milder reading.</div>';
        }
        addXP(150);
        setIntegrity(state.integrity + 10);
        log('good', '★ FORENSIC CLEARANCE. Fatal flaw correctly identified in the “wayward” analysis.');
      } else {
        btn.classList.add('wrong');
        btn.disabled = true;
        if (verdict) {
          verdict.innerHTML = '<p style="font-size:12.5px;color:#FCA5A5;">✖ That hypothesis attacks the evidence or the narrator rather than the inference. ' +
            'Look for the sentence that supplies the connecting principle — the one that is never written on the page.</p>';
        }
      }
    });
  });

  /* ------------------------------------------------------------------ */
  /* FINISH                                                              */
  /* ------------------------------------------------------------------ */
  const finishBtn = $('l125-finish-btn');
  if (finishBtn) {
    finishBtn.addEventListener('click', () => {
      if (typeof window.polymathFinishLesson === 'function') {
        window.polymathFinishLesson();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* BOOT                                                                */
  /* ------------------------------------------------------------------ */
  refresh();
  setIntegrity(25);
  addXP(0);
});
