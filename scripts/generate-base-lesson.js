/**
 * Generate a base lesson page for one level, and save it.
 *
 * The model is `deepseek/deepseek-v4.1-flash`, named on the call and pinned to one
 * upstream with no substitution. There is no fallback route and no backup model,
 * deliberately: a lesson page is attributed to the model that wrote it, the file
 * beside it records that model, and the page a learner is shown says which one it
 * was. A page quietly written by a different set of weights is not a worse page,
 * it is a false attribution — so a refusal is retried and a substitution is not
 * available.
 *
 * One call, not several. An earlier version split the page across nine calls —
 * style, one per section, then behaviour — because the previous model returned
 * nothing when asked for a whole page and a shape at once. That split is not
 * needed here and costs a great deal of wall clock: this route answers a
 * 16,000-token request with tens of thousands of characters of content, so the
 * page is asked for whole and the output contract is enforced here instead of by
 * splitting the work up.
 *
 * The prompt is the creator's own, with the configuration block filled from the
 * curriculum — see `lib/lesson-prompt-template.js` for the prompt and
 * `lib/lesson-prompt.js` for where each field is read.
 *
 *   node scripts/generate-base-lesson.js english/proficient/105
 *   node scripts/generate-base-lesson.js --all [track]
 */
const fs = require('fs');
const path = require('path');

const { lessonConfig } = require('./lib/lesson-prompt');
const { buildPrompt } = require('./lib/lesson-prompt-template');

const ROOT = path.join(__dirname, '..');

// Loaded only when this file is the entry point. It is also required as a
// library, by scripts/self-test.js, and a library must not decide what its
// process's environment is: loading `.env` here unconditionally handed the
// providers credentials *after* they had already read their configuration, so
// they were pointed at the default endpoint and answered 401 to everything —
// in a process whose whole design is that it runs with no keys at all. The
// providers read `process.env` once, at load, so the order is the contract.
if (require.main === module) {
  require(path.join(ROOT, 'node_modules', 'dotenv')).config({ path: path.join(ROOT, '.env') });
}

const MODEL = process.env.OPENROUTER_LESSON_MODEL || 'deepseek/deepseek-v4.1-flash';
const OUT_DIR = path.join(ROOT, 'content', 'base-lessons');

/** The id the page's root element must carry, so the shell can scope and verify it. */
const ROOT_ID = 'base-lesson-body';

/**
 * How long to keep retrying, and how long to wait between tries.
 *
 * A pinned upstream that is saturated is a refusal, not a slower answer, and the
 * pin means there is nowhere else to go. So it is retried rather than handed
 * elsewhere, with the patience per call and an hour as the ceiling. An empty
 * answer is treated exactly like a 429: a model reasoning about a whole page can
 * spend its budget designing it and never write it, which returns a 200 carrying
 * no content at all. Waiting and asking again lands it; treating it as fatal
 * throws away the patience on a call that would have worked on the second try.
 */
const PATIENCE_MS = Number(process.env.LESSON_PATIENCE_MS || 60 * 60 * 1000);
const GAP_MS = Number(process.env.LESSON_RETRY_GAP_MS || 20000);

/**
 * The whole page, in one call.
 *
 * A lesson page is a long authored document — the creator's template asks for six
 * full instructional sections, an interactive simulator and a rubric — so the
 * budget is set by what a complete page costs rather than by a short answer's
 * needs.
 *
 * The size is measured, not guessed. This route is a reasoning model: for a
 * 600-word answer it emitted roughly 3,700 characters of content and 166,000
 * characters of thinking, so thinking is about forty times the size of the answer
 * it produces. At 32,000 tokens that left room for roughly half a page, and the
 * first run came back cut off mid-attribute in Section 05 with no script block
 * and no Finish button at all — a 200 that looked like an answer and was not one.
 * So the ceiling is set above the whole page rather than at it, and the page is
 * checked afterwards rather than trusted (see `inspect`).
 *
 * Note the obvious lever is the wrong one. The route takes a `reasoning.effort`
 * setting, and "low" is not faster here: measured against the same prompt, "low"
 * produced 272,000 characters of thinking in 79 seconds where the default
 * produced 166,000 in 50. The label is not the behaviour, so the endpoint default
 * is left alone.
 *
 * `max_completion_tokens` for this model is 943,718, so this is well inside it.
 */
const MAX_TOKENS = Number(process.env.LESSON_MAX_TOKENS || 90000);

const openrouter = require(path.join(ROOT, 'services', 'providers', 'openrouter'));

/**
 * Ask the model for one page, retried until it answers with content.
 *
 * @param {string} prompt
 * @param {(chars: number) => void} [onProgress]
 * @returns {Promise<string>}
 */
async function ask(prompt, onProgress) {
  const deadline = Date.now() + PATIENCE_MS;
  for (let attempt = 1; ; attempt++) {
    try {
      let last = 0;
      const res = await openrouter.chatStream({
        role: 'deep',
        // The prompt already says what to return; a system message restating it
        // buys nothing and is one more thing the model has to agree with.
        messages: [{ role: 'user', content: prompt }],
        maxTokens: MAX_TOKENS,
        // Named on the call, so there is no lane to be taken from and no chain to
        // fall through. The provider pin and the reasoning settings travel with the
        // model id in MODEL_PROFILES, so nothing about the request is spelled out
        // twice.
        model: MODEL,
        onDelta: (text) => {
          if (onProgress && text.length - last >= 6000) {
            last = text.length;
            onProgress(text.length);
          }
        },
      });
      // Content, not merely a reply: a 200 that carried nothing but reasoning is a
      // refusal wearing the same clothes as an answer.
      if (res && res.text && res.text.trim()) {
        // And content that stops partway is also a refusal. This one is harder to
        // see than an empty answer, because a truncated page still opens and still
        // looks like a page — it is simply missing its last sections, its script
        // and its button, and the learner is the one who finds out.
        const cut = truncated(res.text);
        if (!cut) return res.text;
        if (Date.now() > deadline) throw new Error(`the page was cut off repeatedly: ${cut}`);
        const wait = Math.min(GAP_MS * attempt, 90000);
        console.log(`      the page stopped partway (${cut});`
          + ` waiting ${Math.round(wait / 1000)}s and writing it again`);
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (Date.now() > deadline) throw new Error('the model returned nothing');
      const wait = Math.min(GAP_MS * attempt, 90000);
      console.log(`      it reasoned and stopped without answering (${attempt});`
        + ` waiting ${Math.round(wait / 1000)}s and asking again`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, wait));
    } catch (err) {
      // 429 is the saturated pin and is worth waiting out. 400 means the request
      // itself is wrong — the provider string, the token budget — and retrying it
      // unchanged would burn an hour to arrive in the same place.
      if (err.status !== 429 && err.status !== 400) throw err;
      if (err.status === 400) throw new Error(`${err.message} — the request is wrong, not busy`);
      if (Date.now() > deadline) throw err;
      const wait = Math.min(GAP_MS * attempt, 90000);
      console.log(`      the pinned provider is busy; waiting ${Math.round(wait / 1000)}s`
        + ` and asking again (attempt ${attempt + 1})`);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/**
 * Is this page whole, or did it stop because the budget ran out?
 *
 * A page cut off by the token ceiling is not a short page. It is a page that
 * looks finished — it has a title, a style block and a closing tag in the right
 * place — and is missing everything after wherever the budget ran dry. The first
 * run this was written for ended mid-attribute in Section 05: 96 opening tags
 * against 91 closing ones, no script, no Finish button, and a response that read
 * as a successful page all the way through.
 *
 * So an unclosed tag is treated as a refusal and the call is made again, with
 * room to finish. This is checked before the answer is returned rather than after
 * the file is written, because a truncated page is worth nothing and a re-run is
 * worth a great deal.
 *
 * @param {string} html
 * @returns {string|null} what was cut, or null when the page looks whole
 */
function truncated(html) {
  const s = String(html || '');
  if (!s) return 'the model returned nothing';
  // Every container the page is built from, counted. A mismatch in either
  // direction means the document was cut rather than finished, and the direction
  // tells you which: more opens means it stopped mid-page.
  const open = (s.match(/<(div|section|article)\b[^>]*>/gi) || []).length;
  const close = (s.match(/<\/(div|section|article)>/gi) || []).length;
  if (open !== close) {
    return `it stopped partway through — ${open} opening tags against ${close} closing`
      + ' ones, so the page is cut off rather than finished';
  }
  // A page whose budget ran out mid-attribute leaves an unterminated tag at the
  // very end, which the counts above can miss when the cut lands in text.
  if (/<[a-z]+[^>]*$/i.test(s.trim())) {
    return 'it ends inside an unfinished tag, so the page was cut off mid-markup';
  }
  if (!/<\/div>|<\/section>|<\/article>\s*$/i.test(s.trim())) {
    return 'it does not end on a closing element, so the page was cut off';
  }
  return null;
}

/**
 * Pull the fragment out of whatever came back.
 *
 * A model asked for HTML will usually give HTML. It will also, sometimes, wrap it
 * in a fence, prefix it with a sentence, hand over a whole document it was told
 * not to, or add a sign-off on the way out — and each of those leaves something
 * visible that is not the lesson.
 *
 * @param {string} text
 * @returns {string}
 */
function extractHtml(text) {
  let out = String(text || '').trim();
  const fence = out.match(/```(?:html|xml)?\s*\n?([\s\S]*?)\n?```/i);
  if (fence) out = fence[1].trim();
  // A whole document the model produced anyway. Cut at the first tag inside <body>.
  const body = out.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) out = body[1];
  else if (/<!DOCTYPE|<html[\s>]|<head[\s>]/i.test(out)) {
    out = out.slice(out.search(/<(style|script|section|div|h1|h2|main|aside)/i));
  }
  // A prose lead-in, which is a sentence before the first tag.
  const first = out.search(/<(style|script|div|section|main|aside|header|nav|h1|h2|p|ul|ol)/i);
  if (first > 0) out = out.slice(first).trim();
  // And a sign-off after the last tag. Cut at the last closing bracket, so the
  // words the model added do not render above the page.
  const lastClose = out.lastIndexOf('>');
  if (lastClose > 0 && lastClose < out.length - 1 && !/[<]/.test(out.slice(lastClose + 1))) {
    out = out.slice(0, lastClose + 1).trim();
  }
  return out;
}

/**
 * What is wrong with a generated page, or null when nothing is.
 *
 * The page is served into a live document below the app's own header, so the things
 * that break it are checked rather than assumed. Each message says what is wrong,
 * because it is what the next person reads when a generated page needs regenerating.
 *
 * @param {string} html
 * @returns {string|null}
 */
function inspect(html) {
  if (!html || html.length < 400) return 'the page is too short to be a lesson';
  if (/<!DOCTYPE/i.test(html) || /<html[\s>]/i.test(html) || /<head[\s>]/i.test(html)) {
    return 'it is a whole document, not a fragment — <!DOCTYPE, <html> or <head> came back';
  }
  if (/<(script|link)[^>]+(src|href)\s*=/i.test(html)) {
    return 'it loads an external file, which will not work offline';
  }
  if (!/<style[\s>]/i.test(html)) return 'it has no <style> block, so it would render unstyled';
  if (!/<script[\s>]/i.test(html)) return 'it has no <script> block, so nothing would be interactive';
  if (!new RegExp(`id\\s*=\\s*["']${ROOT_ID}["']`).test(html)
    && !new RegExp(`class\\s*=\\s*["'][^"']*\\b${ROOT_ID}\\b`).test(html)) {
    return `nothing is marked with id="${ROOT_ID}", so the page's CSS applies to nothing`;
  }
  // A page has to *offer* the button, not merely mention it: a page whose only
  // occurrence is inside the script calls a function nothing can reach, which is a
  // learner stranded on a page with no way off it. So the check is on the markup —
  // a button, or a link, that a person can see and press.
  //
  // The label is matched anywhere inside the element, not only at its start. These
  // pages put a glyph before the words — "✓ FINISH LESSON" and "✅ FINISH LESSON"
  // are both real output — and an earlier version of this check insisted on
  // whitespace or a nested tag immediately after the opening tag, so it reported
  // two perfectly good pages as having no way off. That is the worst kind of false
  // positive: it sends you regenerating a page that was already correct, and it
  // did, twice, before the buttons were read properly.
  const visibleButton = /<(button|a)\b[^>]*>(?:(?!<\/\1\b)[\s\S])*?Finish Lesson/i.test(html);
  if (!visibleButton) return 'it has no Finish Lesson button, so there is no way off the page';
  if (!/@media|prefers-reduced-motion/i.test(html)) {
    return 'it has no width or motion handling, so it would not work on a phone';
  }
  // Every rule scoped under the root, which is what keeps the page's styling off the
  // app's own header. One unscoped rule is enough to break that.
  //
  // A rule is judged by what it *reaches*, and what decides that is the **leftmost
  // compound** of the selector — the first thing it is anchored to. `.l189-panel > *`
  // styles the children of the lesson's own container and nothing else, because
  // `.l189-panel` exists nowhere but this lesson. `body`, `*` and a bare `h1` reach
  // every page, because those exist everywhere.
  //
  // Judging the whole selector instead of its first compound is wrong in the
  // direction that costs most: it flagged `.l189-panel > *` as reaching the page
  // around the lesson, which it cannot. A check that rejects correct output is a
  // check that sends you regenerating pages that were already right.
  //
  // The classes below are the app's own. A rule on one of them reaches the app's
  // chrome even when written as a single class, so they are refused anywhere in the
  // selector, not only at the front.
  const appClasses = /\.(site-header|wrap|page|root|card|btn|chip|badge|notice|row|spacer|loading|small|tiny|muted)\b/i;
  for (const block of html.match(/<style[\s\S]*?<\/style>/gi) || []) {
    // The tags come off first, then the comments and at-rule preludes, which carry
    // no selector. The tags matter: `match` returns the block *including* `<style>`,
    // and that tag contains `>` — which the selector walker below splits on. So
    // every first selector arrived prefixed with `<style`, its leftmost compound
    // came out as the literal text `<style`, and a rule anchored to a lesson class
    // was judged as a bare element selector. That is how `.l189-panel > *` came to
    // be refused: not the rule, the tag in front of it.
    const clean = block
      .replace(/<\/?style[^>]*>/gi, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0;
    let selector = '';
    for (const ch of clean) {
      if (ch === '{') {
        depth += 1;
        if (depth === 1) {
          // The last of a comma-separated list, because one unscoped selector in a
          // list of scoped ones is still an unscoped selector.
          const s = selector.trim().split(/[,\n]/).pop().trim();
          // A keyframe step is not a selector, and a nested selector inside a
          // scoped rule is already covered by its parent.
          const isStep = /^(\d+%|from|to)\b/.test(s);
          const isAt = s.startsWith('@');
          if (!isStep && !isAt && s && !s.includes(ROOT_ID)) {
            const left = s.split(/[\s>+~]+/)[0] || '';
            // A leftmost compound with no class and no id is a bare element or the
            // universal selector: `body`, `*`, `h1`, `div`. It is anchored to
            // nothing the lesson owns, so it reaches the page around it.
            const bare = !/[.#]/.test(left);
            if (bare || appClasses.test(s)) {
              return `a CSS rule would reach the page around the lesson: "${s}"`;
            }
          }
        }
        selector = '';
      } else if (ch === '}') {
        depth = Math.max(0, depth - 1);
        selector = '';
      } else if (depth === 0) {
        selector += ch;
      }
    }
  }

  // A control that is inert until a precondition is met is normal and correct: the
  // page disables it in its markup and enables it from its own code when the learner
  // has done what it waits for. Four of the ten pages generated in one batch did
  // exactly that, and an earlier version of this check refused all four — the
  // buttons were flagged as unusable while the pages were enabling them a moment
  // later. Rejecting correct output is the failure mode to avoid here, because it
  // costs a regeneration and teaches you to distrust the check.
  //
  // So the question asked is narrower: does this page ever enable anything at all?
  // A page that ships controls disabled and never sets `disabled = false` anywhere
  // has disabled them and forgotten about them, which is the dead control this
  // exists to catch. A page that manages its own disabled state is left alone.
  const disabled = [];
  for (const tag of html.match(/<button\b[^>]*>/gi) || []) {
    if (/\sdisabled(\s|=|\/|>)/i.test(tag)) {
      const id = (/\bid\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
      disabled.push(id ? `#${id}` : tag.slice(0, 60));
    }
  }
  if (disabled.length) {
    const script = (html.match(/<script[^>]*>([\s\S]*?)<\/script>/i) || ['', ''])[1];
    const enablesSomething = /\.disabled\s*=\s*false/.test(script);
    if (!enablesSomething) {
      return `${disabled.length} control(s) ship disabled and the page never sets`
        + ` disabled = false anywhere, so they can never be used: ${disabled.join(', ')}`;
    }
  }
  return null;
}

/** Where a level's page is written. */
function fileFor(trackId, gradeId, level) {
  return path.join(OUT_DIR, String(trackId), String(gradeId), `level-${Number(level)}.html`);
}

/**
 * Generate and save one lesson.
 *
 * @param {string} trackId
 * @param {string} gradeId
 * @param {number} level
 * @param {object} [opts] `{ quiet }`
 * @returns {Promise<{file: string, config: object, problem: string|null}>}
 */
async function generateLesson(trackId, gradeId, level, opts = {}) {
  const { prompt, config } = buildPrompt(trackId, gradeId, level);
  const say = opts.quiet ? () => {} : (m) => console.log(m);
  const started = Date.now();

  say(`\n${trackId}/${gradeId} level ${level}`);
  say(`  ${config.topic}`);
  say(`  ${config.generalization}`);
  say(`  lesson ${config.sequence} of ${config.lessonCount}, ${config.age.text}`
    + ` — game engine variant ${config.variant}`);
  say(`  one call to ${MODEL}, pinned with no fallback`);

  const raw = extractHtml(await ask(prompt, (n) => say(`      ${n.toLocaleString()} characters`)));
  const seconds = Math.round((Date.now() - started) / 1000);
  const problem = inspect(raw);

  say(`\n  1 call in ${Math.floor(seconds / 60)}m ${seconds % 60}s`
    + ` — ${raw.length.toLocaleString()} characters`);
  if (problem) say(`  PROBLEM: ${problem}`);
  else say('  the contract is satisfied');

  const file = fileFor(trackId, gradeId, level);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, raw, 'utf8');
  say(`  wrote ${path.relative(ROOT, file)}`);

  // A note beside the page, so what it was built from travels with it. A page with
  // no record of its level, its sequence number and its model cannot be told apart
  // from a page built for a different lesson later.
  fs.writeFileSync(`${file}.meta.json`, `${JSON.stringify({
    track_id: trackId,
    grade_id: gradeId,
    level,
    subject: config.subject,
    topic: config.topic,
    generalization: config.generalization,
    grade_band: config.gradeBand,
    age: config.age,
    lesson_sequence: config.sequence,
    lesson_count: config.lessonCount,
    variant: config.variant,
    previous_lesson: config.previous,
    future_lessons: config.future,
    model: MODEL,
    generated_at: new Date().toISOString(),
    seconds,
    problem,
  }, null, 2)}\n`, 'utf8');

  return { file, config, problem };
}

// ── the command line ─────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const target = args.find((a) => !a.startsWith('--'));

  (async () => {
    if (all) {
      const trackId = target || 'english';
      const track = require(path.join(ROOT, 'config', 'curriculum')).getTrack(trackId);
      if (!track) {
        console.log(`no track "${trackId}"`);
        process.exit(1);
      }
      // One lesson per grade: the first lesson of each, which is where a new prompt
      // shape shows its seams first.
      let failed = 0;
      let done = 0;
      for (const grade of track.grades) {
        const index = require(path.join(ROOT, 'config', 'level-layout')).statedIndex(grade);
        if (!index) continue;
        const first = [...index.byLevel.values()]
          .filter((l) => l.kind === 'lesson')
          .sort((a, b) => a.level - b.level)[0];
        if (!first) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          const r = await generateLesson(trackId, grade.id, first.level, { quiet: true });
          done += 1;
          console.log(`  ${r.problem ? 'PROBLEM' : 'ok      '} ${trackId}/${grade.id} level ${first.level}`
            + `  ${r.config.topic}  (lesson ${r.config.sequence}, ${r.problem || 'clean'})`);
          if (r.problem) failed++;
        } catch (err) {
          console.log(`  FAILED   ${trackId}/${grade.id}: ${err.message}`);
          failed++;
        }
      }
      console.log(`\n${done - failed} of ${done} grades generated cleanly`);
      process.exit(failed ? 1 : 0);
    }

    if (!target || !/^\w+\/\w+\/\d+$/.test(target)) {
      console.log('usage: node scripts/generate-base-lesson.js <track>/<grade>/<level>');
      console.log('       node scripts/generate-base-lesson.js --all [track]');
      process.exit(1);
    }
    const [t, g, l] = target.split('/');
    const r = await generateLesson(t, g, Number(l));
    process.exit(r.problem ? 1 : 0);
  })().catch((err) => {
    console.error(`\n${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  generateLesson, ask, extractHtml, inspect, truncated, fileFor, MODEL, OUT_DIR, ROOT_ID,
  lessonConfig,
};
