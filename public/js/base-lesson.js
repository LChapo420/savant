/* The page under the native navbar for a generated base lesson.
 *
 * This is the shell the model's HTML is dropped into, and it is deliberately thin.
 * The lesson page brings its own `<style>` and its own `<script>`, written by the
 * model against a strict output contract: a fragment, styles scoped to a container,
 * no external fetches, and a `Finish Lesson` button that calls
 * `window.polymathFinishLesson()`.
 *
 * Two things this shell does that the model must not:
 *
 *   **Finish Lesson.** The model's button is a plain element; what it calls is here,
 *   with the enrollment id the page is being read for. A generated page is never
 *   trusted to know which course it is on, so a page that has been tampered with
 *   cannot finish somebody else's level.
 *
 *   **The failure path.** A page with no Finish button, or one whose button does
 *   not call through, would leave a learner sitting on a page with no way off it.
 *   So the button is also provided here, after the model's own, and the two are
 *   kept apart by a caption rather than by one replacing the other.
 */

/**
 * Put a generated lesson into the page, and make it run.
 *
 * A script element written through `innerHTML` is inert: the parser treats it as
 * markup rather than as code, so it is added to the document and never evaluated.
 * That is the whole reason this function exists. The lesson looked correct in every
 * other respect — its styles applied, its text read, its layout was right — and
 * none of it worked, because the one line that wires the controls to the markup
 * never ran.
 *
 * So the markup goes in as parsed HTML, the `<style>` is hoisted into the head so
 * the page's own rules come first in the cascade, and each `<script>` is re-created
 * as a fresh element and appended, which is the only way to get the browser to
 * execute code that arrived as a string.
 *
 * ## The one thing this has to get right: DOMContentLoaded
 *
 * The lesson is asked to wrap its work in `DOMContentLoaded`, and that event has
 * already fired by the time this page fetches a lesson — the page loaded, then
 * signed the user in, then asked for the HTML. A handler registered now would
 * never be called, so every control would be dead again, in a way that looks
 * exactly like the bug above rather than like a fix for it.
 *
 * So the event is delivered by hand: the code is run once as written, and then any
 * `DOMContentLoaded` listener it registered is invoked directly. A lesson that
 * wrapped itself in the event fires it here. A lesson that did not has already
 * run, and running its body twice is avoided by only invoking the listeners it
 * actually added — the wrapper the prompt asks for is what registers one.
 *
 * @param {HTMLElement} host where the lesson goes
 * @param {string} html the model's fragment
 * @param {string} track the track id, for the script endpoint
 * @param {string} grade the grade id
 * @param {number} level the level number
 * @returns {Promise<void>} resolves once the lesson's code has loaded and run
 */
function mountLesson(host, html, track, grade, level) {
  if (!host) return;

  // Parsed inert, then adopted. `template` gives the browser a document it can
  // parse the lesson into without running anything, and `content` is then moved
  // into the live page. This is the standard way to turn a string of markup into
  // nodes that belong to the document.
  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = template.content;

  // The lesson's styles, hoisted into the head so the app's own rules stay
  // earlier in the cascade than the lesson's. A rule the lesson writes against
  // `body` would still be able to reach the header, which is why the generator is
  // asked to scope every rule under its own root and `inspect` refuses a page
  // that does not.
  const styles = Array.from(fragment.querySelectorAll('style'));

  // The scripts come out before the markup goes in, so the lesson's own code
  // cannot run against a page that is still being assembled.
  const scripts = Array.from(fragment.querySelectorAll('script'));
  scripts.forEach((script) => script.remove());

  host.appendChild(fragment);
  styles.forEach((style) => document.head.appendChild(style));

  // Now the behaviour, in the order it was written.
  //
  // ## The three ways this does not work, and the one that does
  //
  // The lesson's code has to run in the page, and the page's content security
  // policy is `script-src 'self'` — no inline script, no `eval`, no third-party
  // origin. That rules out almost every way of running a string of code:
  //
  //   - Writing the script into `innerHTML` does nothing at all. The parser
  //     treats it as text, so it is added to the document and never evaluated.
  //   - `new Function(...)` is `unsafe-eval`, which the policy forbids.
  //   - Appending a `<script>` whose text was set from a string is inline script,
  //     which the policy also forbids.
  //
  // What the policy *does* allow is a script from this origin, which is the whole
  // of the reason the app is built the way it is. So the lesson's code is handed
  // to the server, written to a file under the site, and loaded as an ordinary
  // `<script src>`. It arrives as a same-origin file, the policy is satisfied, and
  // the code runs with the document in the state it will be in.
  //
  // The order matters and is the other half of the bug. The lesson opens with
  // `const root = document.getElementById('base-lesson-body'); if (!root) return;`
  // — so the markup must already be in the document when the code runs, or the
  // whole lesson bails on line one and every control is dead with no error. The
  // markup is appended above, and a script appended after it is guaranteed to see
  // it, because scripts execute in document order and this one is added last.
  //
  // `DOMContentLoaded` has already fired by the time a lesson arrives — the page
  // loaded, then signed the user in, then fetched the lesson — so a lesson that
  // wraps its work in that event would never run it. It is dispatched by hand
  // once the file has loaded, which is the moment the lesson's own wrapper is
  // registered and can therefore be called.
  return loadLessonScripts(track, grade, level, scripts);
}

/** Mount a complete same-origin engine without handing its scripts to the lesson loader. */
function mountGameFrame(host, url, engineId) {
  if (!host || !url) return Promise.resolve(null);
  const frame = document.createElement('iframe');
  frame.title = `${engineId} game`;
  frame.className = 'course-game-frame';
  frame.setAttribute('allow', 'autoplay');
  frame.setAttribute('referrerpolicy', 'same-origin');
  frame.style.cssText = 'display:block;width:100%;height:min(78vh,760px);min-height:clamp(360px,60vh,520px);border:0;background:#0b1020;';
  host.appendChild(frame);

  return new Promise((resolve, reject) => {
    frame.addEventListener('load', () => resolve(frame), { once: true });
    frame.addEventListener('error', () => reject(new Error('The game could not be loaded.')), { once: true });
    // Give the parent event bridge a turn to install before the engine can emit.
    window.setTimeout(() => { frame.src = url; }, 0);
  });
}

function isValidGameFrameMessage(event, frame, engineId) {
  if (!event || event.origin !== window.location.origin) return false;
  const data = event.data || {};
  if (!(frame && event.source === frame.contentWindow
    && data.type === 'polymath:game' && data.engineId === engineId)) return false;
  if (!['question', 'answer', 'win', 'lose', 'draw'].includes(data.name)) return false;
  if (data.name === 'question') return Number.isInteger(data.questionIndex) && data.questionIndex >= 0;
  if (data.name === 'answer') {
    return typeof data.questionId === 'string' && data.questionId.length > 0
      && Number.isInteger(data.questionIndex) && data.questionIndex >= 0
      && typeof data.correct === 'boolean' && Number.isFinite(data.ms) && data.ms >= 0;
  }
  return data.result === data.name;
}

/**
 * A model-written lesson or game page in a sandboxed frame (security review
 * 2026-10-24, D4). `sandbox="allow-scripts allow-forms"` without allow-same-origin:
 * the page runs with an opaque origin, so it cannot read this page, the learner's
 * cookies or storage, or call the API as them. It reaches this page only through
 * the messages public/js/lesson-frame.js sends, which `frameMessage` checks.
 *
 * Resolves with the frame's "ready" report ({ hasFinish }) once the page has run,
 * or with {} after a while if it never says (a page that threw on load).
 */
function mountSandboxFrame(host, url, { title, game }) {
  if (!host || !url) return { frame: null, ready: Promise.resolve({}) };
  const frame = document.createElement('iframe');
  frame.title = title || 'Lesson';
  frame.className = game ? 'course-game-frame lesson-sandbox-frame' : 'lesson-sandbox-frame';
  frame.setAttribute('sandbox', 'allow-scripts allow-forms');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  if (game) frame.setAttribute('allow', 'autoplay');
  frame.style.cssText = `display:block;width:100%;border:0;background:transparent;height:${game ? 'min(78vh,760px)' : '480px'};`
    + (game ? 'min-height:clamp(360px,60vh,520px);' : '');
  let settle;
  const ready = new Promise((resolve) => { settle = resolve; });
  frame.polymathReady = (info) => settle(info || {});
  window.setTimeout(() => settle({}), 15000);
  host.appendChild(frame);
  frame.src = url;
  return { frame, ready };
}

/** Where a frame's link may take the learner: this app's own course pages, nothing else. */
function frameNavigationTarget(href) {
  let u;
  try { u = new URL(String(href || ''), window.location.origin); } catch (err) { return null; }
  if (u.origin !== window.location.origin) return null;
  if (!/^\/(session|path|dashboard|base-lesson)(\.html)?$/.test(u.pathname)) return null;
  return u.pathname + u.search;
}

/**
 * A message from the sandboxed frame, or null. It must come from that frame's own
 * window, with the opaque origin a sandboxed document has ("null"), and be one of the
 * shapes lesson-frame.js sends. Everything else is ignored.
 */
function frameMessage(event, frame) {
  if (!event || !frame || event.source !== frame.contentWindow || event.origin !== 'null') return null;
  const d = event.data;
  if (!d || typeof d !== 'object' || d.type !== 'polymath:frame' || typeof d.name !== 'string') return null;
  const int = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
  switch (d.name) {
    case 'size': return Number.isFinite(d.height) && d.height >= 0 ? { name: 'size', height: Math.min(30000, Math.max(120, Math.ceil(d.height))) } : null;
    case 'ready': return { name: 'ready', hasFinish: d.hasFinish === true };
    case 'finish': return { name: 'finish', level: int(d.level, 100000) ? d.level : null };
    case 'navigate': { const href = frameNavigationTarget(d.href); return href ? { name: 'navigate', href } : null; }
    case 'question': return int(d.questionIndex, 100000) && int(d.at, 1000000) ? { name: 'question', questionIndex: d.questionIndex, at: d.at } : null;
    case 'answer':
      return typeof d.questionId === 'string' && d.questionId.length > 0 && d.questionId.length <= 200
        && int(d.questionIndex, 100000) && typeof d.correct === 'boolean' && Number.isFinite(d.ms) && d.ms >= 0
        ? { name: 'answer', questionId: d.questionId, questionIndex: d.questionIndex, correct: d.correct, ms: Math.min(d.ms, 3600000) } : null;
    case 'win': case 'lose': case 'draw':
      return d.result === d.name ? {
        name: d.name, result: d.name,
        correct: int(d.correct, 100000) ? d.correct : 0, wrong: int(d.wrong, 100000) ? d.wrong : 0,
        questionsUsed: int(d.questionsUsed, 100000) ? d.questionsUsed : 0,
      } : null;
    case 'capture': {
      if (!Array.isArray(d.report)) return null;
      const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(v, 1e9) : 0);
      const report = d.report.slice(0, 5).map((p, i) => ({
        index: i,
        block: 'the lesson page',
        ms: num(p && p.ms),
        interactions: num(p && p.interactions),
        log: Array.isArray(p && p.log) ? p.log.slice(0, 25).map((x) => String(x).slice(0, 90)) : [],
        right: Math.min(200, num(p && p.right)),
        wrong: Math.min(200, num(p && p.wrong)),
      }));
      return { name: 'capture', report };
    }
    default: return null;
  }
}

/**
 * Write a lesson's scripts to disk and load them, in order.
 *
 * @param {string} track
 * @param {string} grade
 * @param {number} level
 * @param {Element[]} scripts the script elements from the lesson
 * @returns {Promise<void>} resolves once every script has run
 */
function loadLessonScripts(track, grade, level, scripts) {
  if (!scripts.length) return Promise.resolve();

  const host = document.getElementById('base-lesson-host');
  const external = scripts.filter((script) => script.hasAttribute('src'));
  const allowedGameScripts = new Set(['/games/remade.js', '/games/boards.js', '/games/arcade.js']);
  // Only code-owned game assets may bypass script preparation. A generated
  // lesson cannot ask this loader to execute an arbitrary third-party source.
  if (external.some((script) => !allowedGameScripts.has(script.getAttribute('src')))) {
    return Promise.reject(new Error('The page requested an unsupported script.'));
  }
  const sources = scripts.filter((script) => !script.hasAttribute('src')).map((script) => script.textContent);
  if (!host) return Promise.resolve();

  // Hand the code to the server, which writes it under the site and hands back a
  // path this origin can load. A lesson that fails here has a page that renders
  // and does nothing, so the failure is reported rather than swallowed.
  //
  // The listener watch goes on first, and the list is emptied, so the only
  // handlers that can be found below are the ones this lesson's code registers.
  watchForLessonListeners();
  pendingLessonHandlers = [];

  return App.api.post(`/api/lessons/${track}/${grade}/${level}/script`, {
    scripts: sources,
  }).then((res) => {
    if (!res || !res.files || !res.files.length) {
      throw new Error('the lesson\'s code could not be prepared');
    }
    let inlineIndex = 0;
    const orderedFiles = scripts.map((script) => script.hasAttribute('src')
      ? script.getAttribute('src') : res.files[inlineIndex++]);
    return orderedFiles.reduce((chain, file) => chain.then(() => new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = file;
      el.onload = () => {
        // The lesson asked to be wrapped in `DOMContentLoaded`, and that event
        // fired before this page got here, so the lesson is initialised by hand.
        //
        // The event is never dispatched. The lesson registers its handler on
        // `document`, so anything dispatched has to reach `document` to initialise
        // it — and this page has a listener there too. `App.mount` registers on
        // `DOMContentLoaded` while the document is loading, and a synthetic event
        // that reaches it re-runs the whole page: the lesson is fetched and mounted
        // again, replacing the markup under the learner and discarding whatever
        // they had done on it.
        //
        // That failure is worth naming because it does not look like one. A control
        // lights up, holds for a moment, and snaps back, once per cycle, with no
        // error in the console and nothing in the DOM to explain it. It reads as a
        // flaky page rather than as the page rebuilding itself mid-click.
        //
        // The script's own handler was recorded as it registered, so the correct
        // handler is simply called — the lesson initialises, and the page is left
        // exactly as it was.
        const pending = pendingLessonHandlers.filter((h) => h.type === 'DOMContentLoaded');
        pendingLessonHandlers = pendingLessonHandlers.filter((h) => h.type !== 'DOMContentLoaded');
        const event = new Event('DOMContentLoaded');
        pending.forEach(({ target, handler }) => {
          try { handler.call(target, event); } catch (err) {
            console.error('base lesson: a DOMContentLoaded handler threw', err);
          }
        });
        resolve();
      };
      el.onerror = () => reject(new Error(`the lesson's code at ${file} did not load`));
      document.body.appendChild(el);
    })), Promise.resolve());
  }).catch((err) => {
    console.error('base lesson: the lesson\'s code did not load', err);
    const host2 = document.getElementById('base-lesson-host');
    if (host2) {
      const notice = document.createElement('div');
      notice.className = 'notice notice-error';
      notice.textContent = 'This lesson\'s interactive parts could not be loaded.';
      host2.appendChild(notice);
    }
  });
}

/**
 * Listeners a lesson's own code registered, waiting to be called.
 *
 * A lesson is asked to wrap its work in `DOMContentLoaded`, and that event fired
 * before the lesson arrived — the page loaded, signed the user in, then fetched
 * the lesson. The handler therefore has to be called by hand.
 *
 * It cannot be reached by dispatching the event, and the reason is worth stating
 * because the symptom is so unlike its cause. The lesson's handler is on
 * `document`, so an event has to reach `document` to initialise it. So does this
 * page's: `App.mount` registers on `DOMContentLoaded` while the document is still
 * loading. A dispatched event reaches both, the page runs again, and the lesson is
 * fetched and mounted a second time — replacing the markup under the learner and
 * discarding whatever they had done on it. A control lights up, holds for a
 * moment, and snaps back, once per cycle, with nothing in the console. It reads as
 * a flaky page rather than as the page rebuilding itself mid-click.
 *
 * So the lesson's handler is recorded as it registers, and only that one is called.
 * The wrapper goes on before the lesson's script is even requested, because a
 * listener registered while the script is being evaluated is the only kind there
 * is to catch.
 *
 * @type {Array<{target: EventTarget, type: string, handler: Function}>}
 */
let pendingLessonHandlers = [];

/**
 * Note every listener a lesson's code adds, and stop the page's own from being
 * counted. Installed once, before the lesson loads, and left in place: it only
 * records, and it records into a list that is emptied each time a lesson runs.
 */
function watchForLessonListeners() {
  if (watchForLessonListeners.installed) return;
  watchForLessonListeners.installed = true;
  [document, window].forEach((target) => {
    const original = target.addEventListener;
    target.addEventListener = function recording(type, handler, options) {
      pendingLessonHandlers.push({ target, type, handler });
      return original.call(this, type, handler, options);
    };
  });
}

App.mount(async () => {
  const user = await App.currentUser({ require: true });
  if (!user) return;
  App.header(user, 'dashboard');

  const root = document.getElementById('root');
  const track = App.query('track');
  const grade = App.query('grade');
  const level = Number(App.query('level'));
  const enrollmentId = App.query('enrollment') ? Number(App.query('enrollment')) : null;

  if (!track || !grade || !Number.isInteger(level)) {
    root.innerHTML = '<div class="notice notice-error">No lesson named here. '
      + '<a class="notice-link" href="/dashboard">Back to dashboard</a>.</div>';
    return;
  }

  let lesson;
  try {
    lesson = await App.api.get(`/api/lessons/${track}/${grade}/${level}`);
  } catch (err) {
    // A level whose page or game could not be served (not written yet, or its
    // write failed) is still a level: offer the standard session for it, as the
    // waiting screen does, rather than leaving only the way back to the dashboard,
    // whose button leads straight back here.
    // notice-link: 44 px tall on a touch screen (style.css section 31); they are the only ways on from here.
    const standard = enrollmentId
      ? ` <a class="notice-link" href="/session?enrollment=${enrollmentId}&ordinary=1">Do the standard session for this level instead</a>, or`
      : '';
    root.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}${standard} `
      + '<a class="notice-link" href="/dashboard">back to dashboard</a>.</div>';
    return;
  }

  // A level built from blocks has its own page (public/js/block-level.js): it is
  // a plan to lay out, not a page to mount.
  const backLink = enrollmentId
    ? `<a class="btn btn-ghost btn-sm" href="/path?enrollment=${enrollmentId}">${window.icon('arrow-left')}Back to your path</a>`
    : '';
  // The block level is not ready and nothing is writing it: the standard session
  // teaches the level, its lesson first and then the checks.
  if (lesson && lesson.ordinary && lesson.url) {
    window.location.replace(lesson.url);
    return;
  }
  if (lesson && lesson.writing && window.BlockLevel) {
    window.BlockLevel.waiting({
      root,
      retention: lesson.block_kind === 'retention',
      back: backLink,
      enrollmentId,
      fallbackUrl: lesson.fallback_url || null,
      onReady: async () => {
        const again = await App.api.get(`/api/lessons/${track}/${grade}/${level}`);
        if (again.writing) return false;
        window.location.reload();
        return true;
      },
    });
    return;
  }
  if (lesson && lesson.basis === 'blocks' && window.BlockLevel) {
    await window.BlockLevel.mount({ root, lesson, track, grade, level, enrollmentId, back: backLink });
    return;
  }

  const meta = lesson.meta || {};
  const m = meta;
  // What this level is. The page must not decide what its own button means — a
  // generated page for a Master quiz that could mark itself passed by being read
  // would be a way to skip a checkpoint — so the shell asks the server what kind of
  // level this is and the button does the right thing for it.
  const levelKind = lesson.kind || null;
  const isTailored = lesson.basis === 'edited';
  // A game is its own claim: the engine is code, and the model wrote the
  // questions inside it. Saying "written by a model" about the whole page would
  // credit the model with the game and the code with nothing.
  const isGame = lesson.basis === 'game';
  // A model-written page or a remade game: run in the sandboxed frame (the server
  // sends a frame URL and no HTML). Mario and Moto keep their own engine frame.
  const sandboxed = !!lesson.sandboxed && !!lesson.frame;
  const frameGame = isGame && !!lesson.frame && !sandboxed;

  // What every game engine on a game level is handed, in one place.
  //
  // Two things a game cannot own for itself: where its questions left off, and
  // where "next level" goes. The question cursor lives here rather than inside
  // each engine so that losing, answering wrong, or pressing Play again always
  // continues at the next unseen question — an engine that reset its own index
  // on a restart handed the learner the same questions again. The position is
  // kept per level in localStorage, so even coming back to the page tomorrow
  // picks up where the game left off; when the pool is finally spent the cursor
  // wraps and says so, because a game with no questions left is unplayable.
  if (isGame) {
    const engineId = m.engine_id || 'game';
    const cursorKey = `polymath.game.cursor.${track}.${grade}.${level}.${engineId}`;
    let at = 0;
    try { at = Math.max(0, Number(localStorage.getItem(cursorKey)) || 0); } catch (err) { /* no storage: the cursor starts fresh each load */ }
    window.PolymathGame = {
      engineId,
      level,
      enrollment: enrollmentId,
      // The server decides what is next: the level the learner stands on, never level + 1.
      nextLevelUrl: enrollmentId
        ? `/session?enrollment=${enrollmentId}`
        : null,
      // One id per page load, so this play's answers can be read together.
      play: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      // The question on screen now, which is what the chat assist helps with.
      current: null,
      answered: {},
      cursor: {
        at,
        /** The next question's place in the pool, taken the moment it is asked. */
        next(total) {
          const size = Math.max(1, Number(total) || 1);
          const index = this.at % size;
          const wrapped = this.at > 0 && index === 0;
          window.PolymathGame.current = index;
          this.at += 1;
          try { localStorage.setItem(cursorKey, String(this.at)); } catch (err) { /* the in-memory cursor still holds for this page */ }
          return { index, wrapped };
        },
        /** A sandboxed game keeps its own cursor and reports each step here. */
        sync(next, index) {
          window.PolymathGame.current = index;
          this.at = next;
          try { localStorage.setItem(cursorKey, String(this.at)); } catch (err) { /* in memory only */ }
        },
      },
    };
  }

  // A line about where this came from, above the lesson. A generated page looks
  // like every other page on the site, and a learner deserves to know which is
  // which — and the owner, who is the one asking for these, needs to see the
  // level and the model that wrote it at a glance.
  //
  // The wording turns on whether the page was written for this learner or is the
  // shared one, because that is a different claim. Everything else that looks like
  // it was made for you on this site is the app adapting to your answers; this page
  // was written from what you said and what has been observed, and saying "the same
  // for everyone" about it would be false.
  const provenance = m.model ? `
    <div class="card card-tight" style="margin-bottom:14px">
      <div class="small muted">
        <strong>${isGame ? 'Game' : isTailored ? 'Your lesson' : 'Base lesson'}${m.level ? ` for level ${m.level}` : ''}</strong>
        ${m.topic ? ` — ${App.escapeHtml(m.topic)}` : ''}
        ${m.lesson_sequence ? ` &middot; lesson ${m.lesson_sequence} of ${m.lesson_count}` : ''}
        ${m.generalization ? `<br>${App.escapeHtml(m.generalization)}` : ''}
        <br>
        <span class="tiny">${isGame ? 'Questions written by ' : 'Written by '}${App.escapeHtml(m.model || 'a model')}`
        + `${m.generated_at ? ` on ${App.escapeHtml(new Date(m.generated_at).toLocaleDateString())}` : ''}`
        + `${isGame
    ? `. Game engine: ${App.escapeHtml(m.engine_id || 'a game')}. The same questions for everyone on this course.`
    : isTailored
      ? '. Rewritten for you from how you\'ve been doing and what you have said about other levels.'
      : '. The same for everyone on this course.'}</span>
      </div>
    </div>` : '';

  // Back to the path, so the lesson sits inside the course rather than replacing it.
  const back = enrollmentId
    ? `<a class="btn btn-ghost btn-sm" href="/path?enrollment=${enrollmentId}">
        ${window.icon('arrow-left')}Back to your path</a>`
    : '';

  root.innerHTML = `
    <div class="row-between" style="margin-bottom:14px; align-items:flex-start">
      <div>
        <h1 style="margin:0 0 2px">${App.escapeHtml(m.topic || 'Lesson')}</h1>
        <div class="tiny muted">
          ${App.escapeHtml(m.subject || '')}${m.grade_band ? ` &middot; ${App.escapeHtml(m.grade_band)}` : ''}
          ${m.age && m.age.text ? ` &middot; ${App.escapeHtml(m.age.text)}` : ''}
        </div>
      </div>
      ${back}
    </div>
    ${provenance}
    <div id="base-lesson-host"></div>
    <div id="base-lesson-finish" style="margin-top:24px"></div>
  `;

  // The lesson goes in after the shell is written, and not as part of it.
  //
  // The obvious way to inject it — appending the model's HTML to the innerHTML of
  // the string above — is why this page sat dead. A `<script>` written into
  // `innerHTML` never executes: the HTML parser puts it in the document as text
  // rather than running it, so the page rendered its markup and styling and not
  // one line of its behaviour. Every control on the lesson was inert, and the
  // Finish button did nothing, and all of it looked perfectly fine on screen.
  //
  // So it is inserted as markup, and the script that markup carries is run
  // explicitly. The style block is moved into the document head, because a `<style>`
  // left inside the host still applies — but hoisting it keeps the page's own
  // rules ahead of it in the cascade and makes the lesson's styling visible in
  // devtools where it can be checked for leaking.
  let sandbox = null;
  let frameReport = [];
  let mounted;
  if (sandboxed) {
    const at = isGame && window.PolymathGame ? window.PolymathGame.cursor.at : 0;
    sandbox = mountSandboxFrame(document.getElementById('base-lesson-host'),
      isGame ? `${lesson.frame}?at=${encodeURIComponent(at)}` : lesson.frame,
      { title: isGame ? `${m.engine_id || 'Game'} game` : (m.topic || 'Lesson'), game: isGame });
    mounted = sandbox.ready;
  } else {
    mounted = frameGame
      ? mountGameFrame(document.getElementById('base-lesson-host'), lesson.frame, m.engine_id)
      : mountLesson(document.getElementById('base-lesson-host'), lesson.html, track, grade, level);
  }

  // What the learner does on the page — its own controls and checks — for their
  // record. A game's answers are recorded one by one instead; its page only
  // reports that it was left, so the game's read is queued either way. A sandboxed
  // page is watched inside its frame, which sends its report here.
  const pageHost = document.getElementById('base-lesson-host');
  const pageName = isTailored ? 'their tailored lesson page' : 'the lesson page';
  const pageReport = window.LevelCapture && !isGame
    ? (sandboxed
      ? () => frameReport.map((p) => ({ ...p, block: pageName }))
      : window.LevelCapture.watch([pageHost], { name: () => pageName }))
    : () => [];
  // Chat assist on a game: about the question on screen. Before it is answered
  // it guides without giving the answer; after, it explains. A new question
  // starts a new conversation.
  if (isGame && window.AssistChat) {
    const slot = document.createElement('div');
    slot.style.marginTop = '12px';
    pageHost.insertAdjacentElement('afterend', slot);
    let onQuestion = null;
    let from = 0;
    window.AssistChat.attach(slot, {
      label: 'Ask for help with this question',
      placeholder: 'What are you stuck on in this question?',
      send: async (messages) => {
        const g = window.PolymathGame || {};
        if (g.current === null || g.current === undefined) return 'Start the game, and when a question is on screen I can help with it.';
        if (g.current !== onQuestion) {
          onQuestion = g.current;
          from = Math.max(0, messages.length - 1);
        }
        const r = await App.api.post(`/api/lessons/${track}/${grade}/${level}/assist`, {
          target: { type: 'game', question_index: g.current }, messages: messages.slice(from),
        });
        return r.reply;
      },
    });
  }

  // Chat assist on a creator-made lesson page, about the page itself.
  if (!isGame && window.AssistChat) {
    const slot = document.createElement('div');
    slot.style.marginTop = '12px';
    pageHost.insertAdjacentElement('afterend', slot);
    window.AssistChat.attach(slot, {
      label: 'Ask for help with this lesson',
      send: async (messages) => {
        const r = await App.api.post(`/api/lessons/${track}/${grade}/${level}/assist`, { target: { type: 'page' }, messages });
        return r.reply;
      },
    });
  }

  const pageLeaving = window.LevelCapture
    ? window.LevelCapture.sendOnLeave(`/api/lessons/${track}/${grade}/${level}/log`,
      () => ({ source: isGame ? 'game' : 'page', blocks: pageReport() }))
    : { cancel() {} };

  // ── Finish Lesson ──────────────────────────────────────────────────────────
  //
  // The page is model-written, so the one thing it is trusted to do is call a
  // function this file defines. The function is not exposed with the enrollment id
  // baked in: the id comes from the URL this page was opened with, checked against
  // the enrollment the server holds, and the server re-checks that the level is one
  // the learner may finish. Nothing the page says about the level is believed.
  const openedAt = Date.now();
  // How often the learner scrolled back up over what they had read: evidence
  // for the learning scorecard, sent with the finish.
  const scrollBacks = (() => {
    let furthest = window.scrollY;
    let back = false;
    let count = 0;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (y > furthest) furthest = y;
      const gap = Math.max(300, window.innerHeight / 3);
      if (!back && furthest - y > gap) { back = true; count += 1; } else if (back && furthest - y < 80) back = false;
    }, { passive: true });
    return () => count;
  })();
  window.polymathFinishLesson = async function finishLesson(levelArg) {
    const at = Number(levelArg) || level;
    const host = document.getElementById('base-lesson-finish');
    if (!enrollmentId) {
      host.innerHTML = `<div class="notice notice-warn">
        This lesson is not on a course you are enrolled in, so there is nothing to finish.
        ${back ? 'You can still read it.' : ''}</div>`;
      return;
    }

    // Only a lesson is finished by reading it.
    //
    // Every page ends with the same control, because a page cannot know what kind
    // of level it is — and should not, because that is exactly the authority a
    // generated page must not hold. A Master quiz is passed by answering it, and a
    // practice level is not finished at all. So for anything that is not a lesson
    // this button leads into the session for the level rather than claiming it is
    // done. The server refuses the finish route for those kinds anyway; doing it
    // here means the learner gets a way forward instead of an error.
    if (levelKind && levelKind !== 'lesson') {
      // A game level is played above and settled by the game's own end state —
      // the card below says where the learner stands, and leading into a session
      // here would be a door back to the page they are already on.
      if (isGame) { renderGameCard(); return; }
      const isCheckpoint = ['master', 'grand', 'graduation', 'essay'].includes(levelKind);
      host.innerHTML = `
        <div class="card">
          <div class="card-title">${window.icon(App.levelIcon(levelKind))}
            ${isCheckpoint ? `This level is a ${App.escapeHtml(App.levelName(levelKind))}` : 'This level is practice'}</div>
          <p class="small muted" style="margin:0 0 10px">
            ${isCheckpoint
    ? 'Reading the page does not pass it. Answer the questions to clear it.'
    : 'Reading the page does not settle it. Working through the questions does.'}
          </p>
          <div class="row-wrap">
            <a class="btn btn-primary" href="/session?enrollment=${enrollmentId}&level=${at}">
              ${window.icon('arrow-right')}${isCheckpoint ? `Take the ${App.escapeHtml(App.levelName(levelKind))}` : `Work at level ${at}`}</a>
            <a class="btn" href="/path?enrollment=${enrollmentId}">
              ${window.icon('layers')}Your path</a>
          </div>
          <div id="base-lesson-feedback" style="margin-top:12px"></div>
        </div>`;
      const feedbackHost = document.getElementById('base-lesson-feedback');
      if (feedbackHost && window.Feedback) {
        feedbackHost.appendChild(window.Feedback.button(feedbackHost, {
          track, grade, level: at,
        }, { ghost: true }));
      }
      return;
    }

    host.innerHTML = '<div class="small muted">Finishing…</div>';
    try {
      const done = await App.api.post(
        `/api/lessons/${track}/${grade}/${at}/finish`,
        // How long the page was open, and what they did on it: evidence for the
        // learning scorecard and the after-level read.
        { enrollment_id: enrollmentId, read_ms: Date.now() - openedAt, scroll_backs: scrollBacks(), interactions: pageReport() },
      );
      pageLeaving.cancel();
      const moved = done.advanced;
      host.innerHTML = `
        <div class="card">
          <div class="card-title">${window.icon('check-circle')}Lesson finished</div>
          <p class="small muted" style="margin:0 0 10px">
            ${App.escapeHtml(m.topic || 'Level ' + at)} is done.
            ${moved
    ? `You are now on level ${done.level}.`
    : `You are still on level ${done.level} — this level needs more work before it settles.`}
          </p>
          <div class="row-wrap">
            <a class="btn btn-primary" href="/session?enrollment=${enrollmentId}">
              ${window.icon('arrow-right')}${moved
    ? `Continue to level ${done.level}`
    : `Work at level ${done.level}`}</a>
            <a class="btn" href="/path?enrollment=${enrollmentId}">
              ${window.icon('layers')}Your path</a>
          </div>
          <div id="base-lesson-feedback" style="margin-top:12px"></div>
        </div>`;

      // "Give Input" beside the button that moves the learner on — the same control
      // the adaptive session offers at the end of a level. It sits inside the finish
      // card rather than next to the lesson's own button, because that card is
      // reached whichever way the lesson ended: the model's button, or the shell's
      // fallback when the model did not supply one.
      const feedbackHost = document.getElementById('base-lesson-feedback');
      if (feedbackHost && window.Feedback) {
        feedbackHost.appendChild(window.Feedback.button(feedbackHost, {
          track, grade, level: at,
        }, { ghost: true }));
      }
      // The lesson's own "STRUCTURE SECURED" screen and this card are both on the
      // page at once otherwise, and two endings is worse than either.
      const own = document.getElementById('base-lesson-host');
      if (own) own.style.opacity = '0.45';
    } catch (err) {
      host.innerHTML = `<div class="notice notice-error">${App.escapeHtml(err.message)}</div>`;
    }
  };

  // ── a game level ──────────────────────────────────────────────────────────
  //
  // The engine reports what it did through events, and those answers are the
  // level's work — the same evidence a practice sitting collects — so they are
  // recorded as they happen and the level is settled when the game ends. The
  // page never decides whether it passed: it reports, and the server's mastery
  // gate decides.
  const game = { correct: 0, wrong: 0, used: 0, settled: false, result: '' };

  // The sandboxed frame's messages (frameMessage checks source, origin and shape).
  // Its height follows its content, up to this page's viewport, past which the
  // frame scrolls inside: a lesson's sticky bars and fixed panels then stay where
  // the page put them.
  if (sandbox && sandbox.frame) {
    let contentHeight = 0;
    const fit = () => {
      if (!contentHeight) return;
      const cap = Math.max(isGame ? 520 : 360, window.innerHeight - 88);
      sandbox.frame.style.height = `${Math.min(contentHeight, cap)}px`;
    };
    window.addEventListener('resize', fit);
    window.addEventListener('message', (event) => {
      const msg = frameMessage(event, sandbox.frame);
      if (!msg) return;
      if (msg.name === 'size') { contentHeight = msg.height; fit(); return; }
      if (msg.name === 'ready') { sandbox.frame.polymathReady({ hasFinish: msg.hasFinish }); return; }
      if (msg.name === 'navigate') { window.location.assign(msg.href); return; }
      if (msg.name === 'capture') { if (!isGame) frameReport = msg.report; return; }
      if (msg.name === 'finish') { if (!isGame) window.polymathFinishLesson(msg.level || level); return; }
      if (!isGame) return;
      if (msg.name === 'question') {
        if (window.PolymathGame && window.PolymathGame.cursor.sync) window.PolymathGame.cursor.sync(msg.at, msg.questionIndex);
        return;
      }
      // answer, win, lose, draw: the same events an inline engine dispatched.
      window.dispatchEvent(new CustomEvent(`game:${msg.name}`, { detail: msg }));
    });
  }

  function renderGameCard() {
    const host = document.getElementById('base-lesson-finish');
    if (!host) return;
    const resultLine = game.result === 'win' ? 'You win!'
      : game.result === 'lose' ? 'The bot wins this one.'
        : game.result === 'draw' ? 'Draw game.' : '';
    host.innerHTML = `
      <div class="card">
        <div class="card-title">${window.icon(isGame ? 'target' : 'book-open')}
          ${game.settled ? App.escapeHtml(resultLine || 'Game over') : 'This level is a game'}</div>
        <p class="small muted" style="margin:0 0 10px">
          ${game.settled
        ? `You answered ${game.correct} of ${game.used} correctly. `
        : 'Play it above — every answer counts toward this level, exactly like the questions in a practice session.'}
          ${game.settled && game.outcome ? game.outcome : ''}
        </p>
        <div class="row-wrap">
          ${game.settled
        ? `<a class="btn btn-primary" href="${window.location.pathname}${window.location.search}">
             ${window.icon('refresh')}Play again</a>`
          : ''}
          ${game.settled && game.advanced
        ? `<a class="btn btn-primary" href="/session?enrollment=${enrollmentId}">
             ${window.icon('arrow-right')}Continue to level ${game.level}</a>`
        : game.settled && game.standing !== level
          ? `<a class="btn" href="/session?enrollment=${enrollmentId}">
             ${window.icon('arrow-right')}Next level</a>`
          : ''}
          <a class="btn" href="/path?enrollment=${enrollmentId}">
            ${window.icon('layers')}Your path</a>
        </div>
        <div id="base-lesson-feedback" style="margin-top:12px"></div>
      </div>`;
    const feedbackHost = document.getElementById('base-lesson-feedback');
    if (feedbackHost && window.Feedback && game.settled) {
      feedbackHost.appendChild(window.Feedback.button(feedbackHost, {
        track, grade, level,
      }, { ghost: true }));
    }
  }

  if (isGame) {
    if (frameGame) {
      window.addEventListener('message', (event) => {
        const frame = document.querySelector('.course-game-frame');
        if (!isValidGameFrameMessage(event, frame, m.engine_id)) return;
        const data = event.data || {};
        if (data.name === 'question') {
          if (window.PolymathGame) window.PolymathGame.current = Number(data.questionIndex);
          return;
        }
        if (!['answer', 'win', 'lose', 'draw'].includes(data.name)) return;
        window.dispatchEvent(new CustomEvent(`game:${data.name}`, { detail: data }));
      });
    }
    window.addEventListener('game:answer', (event) => {
      const d = event.detail || {};
      game.used++;
      if (d.correct) game.correct++; else game.wrong++;
      if (window.PolymathGame && d.questionId) window.PolymathGame.answered[d.questionId] = true;
      App.api.post(`/api/lessons/${track}/${grade}/${level}/game-answer`, {
        play: window.PolymathGame ? window.PolymathGame.play : '',
        question_id: d.questionId,
        question_index: d.questionIndex,
        correct: !!d.correct,
        ms: d.ms,
      }).catch(() => { /* the game goes on; the final post still settles the level */ });
    });
    const settle = async (event) => {
      if (game.settled) return;
      game.settled = true;
      game.result = String((event.detail || {}).result || event.type.split(':')[1] || '');
      try {
        const done = await App.api.post(`/api/lessons/${track}/${grade}/${level}/game-finish`, {
          play: window.PolymathGame ? window.PolymathGame.play : '',
          result: game.result,
          correct: game.correct,
          wrong: game.wrong,
          questions_used: game.used,
        });
        game.advanced = !!done.advanced;
        game.level = done.level;
        game.standing = done.level;
        const blockers = (done.progress && done.progress.blockers) || [];
        game.outcome = done.advanced
          ? `Level ${level} is cleared — you are on level ${done.level}.`
          : done.settled === false
            ? `This level is ${level < (done.standing || done.level) ? 'behind' : 'ahead of'} where you are `
              + `(you are on level ${done.standing || done.level}), so playing it counts as practice.`
            : `Level ${level} is not cleared yet${blockers.length ? `: ${blockers.join(', ')}` : ''}. Play again to settle it.`;
      } catch (err) {
        game.outcome = 'The result could not be recorded just now.';
      }
      renderGameCard();
    };
    window.addEventListener('game:win', settle);
    window.addEventListener('game:lose', settle);
    window.addEventListener('game:draw', settle);
  }

  // The model's own button calls the function above. If it does not — because the
  // model wrote a button with no handler, or renamed it — the learner would be
  // stranded, so the button is added here as well, clearly marked as this page's
  // rather than the lesson's.
  //
  // It waits for `mountLesson` rather than for a fixed delay. A timer was the
  // obvious thing here and it is a race: on a slow connection the lesson's own
  // button may not exist yet, this one is added, and then the lesson's appears
  // underneath it — two buttons ending the same page. The mount resolves when the
  // lesson's code has run, which is exactly the moment at which the question of
  // whether the lesson provided its own button has an answer.
  mounted.then((ready) => {
    const host = document.getElementById('base-lesson-finish');
    if (!host) return;
    // A game has no Finish to click: playing it is the level's work, and its own
    // end state reaches the card below. The shell's fallback button exists for
    // pages that end by being read.
    if (isGame) { renderGameCard(); return; }
    // A sandboxed page says whether it has its own Finish button (this page cannot
    // look inside the frame).
    const lessonHasItsOwn = sandboxed
      ? !!(ready && ready.hasFinish)
      : Array.from(document.querySelectorAll('#base-lesson-host button')).some((b) => /finish/i.test(b.textContent || ''));
    if (lessonHasItsOwn) return;
    if (!enrollmentId) {
      host.innerHTML = '<div class="small muted">This lesson is not on a course you are '
        + 'enrolled in, so there is nothing to finish.</div>';
      return;
    }
    const button = App.el('button', {
      class: 'btn btn-primary btn-lg',
      type: 'button',
      onclick: () => window.polymathFinishLesson(level),
    }, `${window.icon('check-circle')}Finish Lesson`);
    button.style.cssText = 'box-shadow:0 4px 0 var(--accent,#7a5af5);';
    host.innerHTML = '<div class="row" style="justify-content:center; padding:20px 0"></div>';
    host.firstChild.appendChild(button);
  }, 600);
});
