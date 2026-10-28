/* The lesson session — the Duolingo loop.
 *
 *   - one challenge at a time; CHECK grades it on the server; a green or red
 *     sheet explains it; CONTINUE moves on (Enter does both)
 *   - the progress bar only grows on correct answers
 *   - a wrong answer costs a heart (unless practice / exam) and the challenge
 *     comes back at the end under "Let's review the exercises you missed!"
 *   - 5 and 10 in a row turn the bar gold and bring the mascot out
 *   - SKIP counts as wrong; "Can't speak/listen now" switches those off for an hour
 *   - exam mode: no hearts, no feedback, no repeats — answers are just recorded
 *
 * ES.session.run(frame, opts) -> Promise<{ results, xp, accuracy, timeMs, quit }>
 */
(function () {
  const ES = window.ES;
  const { ui, sfx } = ES;

  const SPEAK = new Set(['speak', 'record_compare']);
  const LISTEN = new Set(['listen_choose', 'listen_meaning', 'listen_image', 'tap_heard', 'type_heard', 'minimal_pair']);
  const ENCOURAGE = {
    5: ['¡Cinco seguidas! ¡Sigue así!', 'Five in a row! Keep it up!'],
    10: ['¡Diez seguidas! ¡Increíble!', 'Ten in a row! Incredible!'],
  };

  async function check(levelId, item, response) {
    try {
      return await ES.api.post('/api/es/check', { levelId, itemId: item.id, response });
    } catch {
      return { correct: false, solution: '', error: true };
    }
  }

  async function run(frame, opts) {
    const {
      levelId, items = [], hearts: startHearts = 5, practice = false, exam = false,
      next = null, retryMistakes = true, encourage = true, total: totalOverride, tagFor = null,
    } = opts;
    let hearts = practice || exam ? null : startHearts;
    const filter = (it) => !(SPEAK.has(it.kind) && ES.speakingOff()) && !(LISTEN.has(it.kind) && ES.listeningOff());
    let queue = items.filter(filter);
    const total = totalOverride || queue.filter((i) => i.kind !== 'sound_tip').length || 1;
    let review = []; let phase = 'main';
    let combo = 0; let comboMax = 0; let done = 0;
    const attempts = new Map();   // item id -> tries
    const results = [];           // first-try results, in order
    const t0 = Date.now();
    let last = null;

    const progress = () => frame.progress(done / total, exam ? 0 : combo);
    progress();

    function present(item, tag) {
      return new Promise((resolve) => {
        let finished = false;
        const ctx = {
          levelId,
          ready: (on) => frame.footer.ready(on),
          selfResult: (res) => finish(res),
          mistake: () => { if (!exam) loseHeart(); },
        };
        const builder = ES.ex[item.kind];
        if (!builder) { resolve({ correct: true, skipped: true }); return; }
        const ex = builder(item, ctx);
        frame.setBody(ui.header(ex.header, tag), ex.el);
        ui.onKeys(ex.keys || null);

        function finish(res) {
          if (finished) return; finished = true;
          ui.onKeys(null);
          if (ex.showResult) ex.showResult(res);
          // The heart goes the moment the answer is marked wrong, as in the app.
          if (!res.correct && !exam) loseHeart();
          if (exam) {
            sfx.play('tap');
            frame.footer.continueOnly({ label: 'Continue', onClick: () => resolve(res), tone: 'es-btn--secondary' });
            setTimeout(() => resolve(res), 450);
            return;
          }
          frame.footer.result({
            correct: res.correct, note: res.note, solution: res.correct && !res.note ? '' : res.solution,
            solutionLabel: ex.solutionLabel, extraHtml: res.extraHtml || '', onContinue: () => resolve(res),
          });
        }

        if (ex.info) {
          frame.footer.continueOnly({ label: 'Continue', onClick: () => resolve({ info: true }), tone: 'es-btn--primary' });
          return;
        }
        const skipSpec = ex.skip || (ex.noSkip || exam ? null : { label: 'Skip', kind: 'generic' });
        const skip = skipSpec ? {
          label: skipSpec.label,
          onClick: async () => {
            if (finished) return;
            if (skipSpec.kind === 'speak') { ES.setSpeakingOff(); queue = queue.filter(filter); review = review.filter(filter); finished = true; resolve({ correct: true, skipped: 'speak' }); return; }
            if (skipSpec.kind === 'listen') { ES.setListeningOff(); queue = queue.filter(filter); review = review.filter(filter); finished = true; resolve({ correct: true, skipped: 'listen' }); return; }
            const res = await check(levelId, item, {});
            finish({ ...res, correct: false, skipped: true });
          },
        } : null;
        frame.footer.idle({
          canCheck: false, skip, extra: ex.footerExtra || null,
          onCheck: async () => {
            if (finished || !ex.ready()) return;
            frame.footer.busy(true);
            const res = await check(levelId, item, ex.response());
            frame.footer.busy(false);
            finish(res);
          },
        });
        if (ex.self) ES.$('.es-footer__inner .es-btn--success', frame.root).style.visibility = 'hidden';
      });
    }

    async function loseHeart() {
      if (hearts === null) return;
      hearts = Math.max(0, hearts - 1);
      frame.hearts(hearts);
      sfx.play('heartLost');
    }

    while (true) {
      let item;
      if (next) item = next(last);
      else item = queue.shift();
      if (!item) {
        if (!exam && retryMistakes && review.length) {
          phase = 'review';
          await ui.interstitial(frame, { char: 'axo', text: '¡Vamos a repasar los errores!', voice: 'axo', label: 'Continue' });
          frame.setBody(ES.h('div', {}, '<p class="es-muted">Let\'s review the exercises you missed!</p>'));
          queue = review; review = [];
          continue;
        }
        break;
      }
      const tries = (attempts.get(item.id) || 0) + 1;
      attempts.set(item.id, tries);
      const tag = phase === 'review' ? 'mistake' : (tagFor ? tagFor(item) : item.tag === 'new' ? 'new' : (item.why === 'due' ? 'due' : item.why === 'weak' ? 'weak' : null));
      const res = await present(item, tag);
      last = { item, res };
      if (res.info) { continue; }
      if (tries === 1) results.push({ item, correct: !!res.correct && !res.skipped, skipped: !!res.skipped, res });
      if (res.skipped === 'speak' || res.skipped === 'listen') { done++; progress(); continue; }
      if (res.correct) {
        done++; combo++; comboMax = Math.max(comboMax, combo);
        progress();
        if (!exam && encourage && ENCOURAGE[combo] && phase === 'main' && queue.length) {
          sfx.play('combo');
          await ui.interstitial(frame, { char: 'axo', text: ENCOURAGE[combo][0], voice: 'axo' });
        }
      } else {
        combo = 0;
        if (exam) { done++; progress(); continue; }
        progress();
        if (retryMistakes && tries < 3) review.push(item);
        else done++;
      }
      // Hearts can also run out inside a challenge (a wrong pair in match pairs).
      if (hearts === 0) {
        const choice = await ui.outOfHearts();
        if (choice === 'quit') return { results, quit: true, timeMs: Date.now() - t0 };
        hearts = startHearts; frame.hearts(hearts);
      }
    }
    frame.footer.hide();
    const graded = results.filter((r) => !(r.skipped === 'speak' || r.skipped === 'listen'));
    const right = graded.filter((r) => r.correct).length;
    const accuracy = graded.length ? Math.round((right / graded.length) * 100) : 100;
    const xp = exam ? 0 : (practice ? 5 : 10) + (accuracy === 100 ? 5 : 0) + Math.floor(comboMax / 5);
    return { results, xp, accuracy, timeMs: Date.now() - t0, comboMax, quit: false, hearts };
  }

  ES.session = { run, check };
})();
