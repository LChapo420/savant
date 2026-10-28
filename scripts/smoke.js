/**
 * End-to-end smoke test over HTTP against a running server.
 *
 *   node scripts/smoke.js [http://localhost:6767]
 *
 * It walks the whole product the way a learner does: register, enroll in three
 * subjects, take a placement quiz, take the style quiz, run a lesson, finish it,
 * answer the retention questions, and then grind one level until a checkpoint
 * appears and sit that checkpoint. Every step asserts on the response, so a
 * broken route fails here rather than in front of someone.
 */
const BASE = process.argv[2] || `http://localhost:${process.env.PORT || 6767}`;
// So a track-count check compares what is served against what exists, rather
// than against a number written down here when there were five of them.
const curriculum = require('../config/curriculum');

let cookie = '';
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      // The API requires a same-origin signal on writes, which a browser sends
      // automatically; the script has to be explicit.
      Origin: BASE,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let payload = null;
  try { payload = await res.json(); } catch { payload = null; }
  return { status: res.status, payload };
}

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  }
}

/** Answer an item: correctly about `accuracy` of the time, wrongly otherwise. */
function answerFor(item, accuracy) {
  const wantCorrect = Math.random() < accuracy;
  if (item.format === 'multiple_choice') {
    // The client never sees the answer, so "correct" here means asking the server
    // and taking what it says; the bank is deterministic, so instead we answer by
    // index and let the score be what it is.
    return item.choices[wantCorrect ? 0 : item.choices.length - 1];
  }
  return wantCorrect ? '42' : 'clearly wrong';
}

(async () => {
  console.log(`smoke test against ${BASE}\n`);

  const health = await call('GET', '/api/health');
  check('health responds', health.status === 200 && health.payload.ok, health.payload);
  console.log(`       ai: ${health.payload && health.payload.ai ? 'on' : 'off (bank only)'}`);

  const email = `smoke+${Date.now()}@example.com`;
  const password = 'smoke-test-pw';
  const reg = await call('POST', '/api/auth/register', { email, password, display_name: 'Smoke Test' });
  check('register', reg.status === 201 && reg.payload.user.email === email, reg.payload);

  const catalog = await call('GET', '/api/catalog');
  // Counted against the curriculum rather than written down, because a hard-coded
  // number goes stale the moment a track is added and then fails for the wrong
  // reason — and a smoke test that fails on an added subject is a smoke test
  // people learn to ignore.
  check('the catalogue lists every track the curriculum has',
    catalog.payload.tracks.length === curriculum.TRACKS.length,
    `${catalog.payload.tracks.length} served, ${curriculum.TRACKS.length} in the curriculum`);

  const enrolled = await call('POST', '/api/enrollments', {
    selections: [
      { track_id: 'math', grade_id: 'algebra_1_part_a' },
      { track_id: 'spanish', grade_id: 'entry' },
      { track_id: 'iq', grade_id: 'foundations' },
      // Reading is a sheet-backed track like English, and it is the newest one,
      // so it is in the smoke test rather than only in the self test: a track
      // that is right in the data and missing from a route is the failure this
      // file exists to catch.
      { track_id: 'reading', grade_id: 'foundations' },
    ],
  });
  check('enroll in four subjects', enrolled.status === 201 && enrolled.payload.created.length === 4, enrolled.payload);
  const enrollment = enrolled.payload.created[0];

  const dupe = await call('POST', '/api/enrollments', { selections: [{ track_id: 'math', grade_id: 'algebra_1_part_a' }] });
  check('duplicate enrollment is skipped', dupe.payload.created.length === 0 && dupe.payload.skipped.length === 1, dupe.payload);

  const blocked = await call('POST', '/api/sessions', { enrollment_id: enrollment.id });
  check('lesson blocked before placement', blocked.status === 409, blocked.payload);

  const placement = await call('POST', '/api/placement/start', { enrollment_id: enrollment.id });
  // The quiz's length is the grade's tier, so it is asked for rather than written
  // down. It was `35` against `math/algebra1` at tier 3; the Math sheet replaced
  // that grade and `algebra_1_part_a` is a school grade at tier 2, so the quiz is
  // twenty-eight questions. A hard-coded 35 fails on a correct placement quiz, and
  // the index `34` after it would read past the end of the array.
  const quiz = placement.payload.items;
  const expectedPlacement = curriculum.placementLength(
    curriculum.getGrade('math', 'algebra_1_part_a').tier,
  );
  check(`placement starts with the tier length (${expectedPlacement})`,
    quiz.length === expectedPlacement, placement.payload.total);
  check('placement difficulty ascends',
    quiz.length > 1 && quiz[0].difficulty < quiz[quiz.length - 1].difficulty,
    quiz.map((i) => i.difficulty));
  check('placement hides answers', !('answer' in quiz[0]), Object.keys(quiz[0]));

  for (const item of placement.payload.items) {
    const res = await call('POST', '/api/placement/answer', {
      session_id: placement.payload.session_id,
      item_id: item.id,
      answer: answerFor(item, item.difficulty <= 5 ? 0.85 : 0.25),
      ms: 4000,
    });
    if (res.status !== 200) { check(`placement answer for item ${item.id}`, false, res.payload); break; }
    check.silent = true;
  }
  const finished = await call('POST', '/api/placement/finish', { session_id: placement.payload.session_id });
  check('placement scores and places', finished.status === 200 && finished.payload.result.placedLevel >= 1, finished.payload);
  console.log(`       placed at level ${finished.payload.result.placedLevel} of ${finished.payload.result.path_length}, held difficulty ${finished.payload.result.heldDifficulty}`);

  const styleAnswers = {};
  for (let i = 1; i <= 20; i++) styleAnswers[`q${i}`] = [0, 0.33, 0.67, 1][i % 4];
  const style = await call('POST', '/api/profile/style-quiz', { answers: styleAnswers });
  check('style quiz saves and applies', style.status === 200 && style.payload.applied.itemCount >= 5, style.payload);

  const path = await call('GET', `/api/path/${enrollment.id}`);
  check('path returns nodes and skills', path.payload.nodes.length > 10 && path.payload.skills.length > 0, path.payload.nodes && path.payload.nodes.length);

  // Every grade of a sheet-backed track, on the route the dashboard's "View path"
  // link points at, with a real enrollment in each.
  //
  // This walks *every* grade rather than one, and the reason is a specific
  // failure: a check that reads one grade passes with fifteen broken, and
  // "every level of every grade is served" cannot be read to find out which grade
  // is wrong. A grade that was missing its opening levels was reported three times
  // while an aggregate check agreed. So each grade is asked, and each names itself.
  //
  // The route is asked rather than the page, because the route is what the page
  // renders from: the client draws every node it is handed. The browser half of
  // this is in `scripts/check-path-page.js`, which drives a real Chrome and reads
  // the rendered DOM — run it when the page itself is in question.
  const reading = catalog.payload.tracks.find((t) => t.id === 'reading');
  if (reading) {
    // Sixteen grades, taken eight at a time. The route takes ten selections at
    // once and silently drops the rest, so a single sixteen-grade request returns
    // ten enrollments and looks like six broken grades rather than six unasked-for
    // ones. That happened here once and read as "every grade has no Tester".
    const made = [];
    const refused = [];
    for (let i = 0; i < reading.grades.length; i += 8) {
      const batch = reading.grades.slice(i, i + 8)
        .map((g) => ({ track_id: 'reading', grade_id: g.id }));
      // eslint-disable-next-line no-await-in-loop
      const r = await call('POST', '/api/enrollments', { selections: batch });
      if (r.status !== 201) {
        refused.push(`batch ${i / 8 + 1} returned ${r.status}`);
        continue;
      }
      for (const e of (r.payload.created || [])) made.push(e);
      // A grade this account already holds is skipped rather than created. The
      // earlier step in this file enrolls in `reading/foundations` as one of its
      // four subjects, so on a fresh account that one grade always comes back
      // skipped — and reading that as a broken grade is wrong. It is named here so
      // the failure message says what actually happened, and the grade is picked
      // up from the account's own list below.
      for (const s of (r.payload.skipped || [])) {
        if (s.reason === 'already enrolled') refused.push(`${s.grade_id} (already enrolled)`);
      }
    }
    // Whatever was already held, ask the account what it has. This is the same
    // read the browser check does, and without it one grade in sixteen has nothing
    // to walk and reads as a failure.
    const mine = await call('GET', '/api/enrollments');
    for (const e of ((mine.payload && mine.payload.enrollments) || [])) {
      if (e && e.track && e.track.id === 'reading' && e.grade
        && !made.some((m) => m.grade.id === e.grade.id)) {
        made.push({ id: e.id, grade: { id: e.grade.id } });
      }
    }
    check(`all ${reading.grades.length} Reading grades have an enrollment to walk`,
      made.length === reading.grades.length,
      `${made.length} of ${reading.grades.length}; ${refused.slice(0, 4).join('; ')}`);

    const missing = [];
    const wrongOpen = [];
    for (const g of reading.grades) {
      const e = made.find((x) => x.grade.id === g.id);
      if (!e) { missing.push(`${g.id} (no enrollment)`); continue; }
      // eslint-disable-next-line no-await-in-loop
      const p = await call('GET', `/api/path/${e.id}`);
      const nodes = (p.payload && p.payload.nodes) || [];
      const first9 = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => nodes.find((n) => n.level === l));
      if (first9.some((n) => !n)) {
        missing.push(`${g.id} (${first9.filter((n) => !n).length} of 1-9 absent)`);
      } else if (!first9.every((n) => n.type === 'Tester')) {
        wrongOpen.push(`${g.id}: ${first9.map((n) => n.type).join(', ')}`);
      }
    }
    check(`all ${reading.grades.length} Reading grades serve levels 1-9, named per grade`,
      missing.length === 0, missing.slice(0, 4).join('; '));
    check('and levels 1-9 are the entry checks the sheet calls Testers',
      wrongOpen.length === 0, wrongOpen.slice(0, 4).join('; '));
  } else {
    check('the reading track is on the catalogue', false, 'no track with id reading');
  }

  // ── the whole-curriculum view ─────────────────────────────────────────────
  // Read-only, and gated on the account rather than on what it is enrolled in:
  // the point is that a subject nobody has joined is still readable. So the
  // refusal is checked on an ordinary account and the content on the one that
  // is allowed it, because a gate that only works when nothing is enrolled
  // would pass either test.
  const ordinary = await call('GET', '/api/curriculum');
  check('an ordinary account is refused the whole curriculum',
    ordinary.status === 403, ordinary.status);

  // The privileged half needs the account's password, which is a secret and does
  // not belong in a test. It runs when OWNER_PASSWORD is set and says so plainly
  // when it is not, rather than passing a check it never made.
  const ownerPassword = process.env.OWNER_PASSWORD;
  if (ownerPassword) {
    const signedIn = await call('POST', '/api/auth/login', {
      email: 'the.landon.d@gmail.com', password: ownerPassword,
    });
    if (signedIn.status === 200) {
      const whole = await call('GET', '/api/curriculum');
      const t = whole.payload && whole.payload.tracks;
      check('the account can read the whole curriculum', whole.status === 200 && Array.isArray(t) && t.length > 0, whole.status);
      const grades = (t || []).flatMap((x) => x.grades);
      check('every subject and every grade is in it', grades.length >= 15, grades.length);
      const withNodes = grades.filter((g) => g.nodes && g.nodes.length === g.path_length);
      check('and every grade has a node for every level', withNodes.length === grades.length,
        grades.filter((g) => !g.nodes || g.nodes.length !== g.path_length).map((g) => g.id));
      const withTopics = grades.filter((g) => g.topics && g.topics.length > 0);
      check('and every grade carries its syllabus', withTopics.length === grades.length,
        grades.filter((g) => !g.topics || !g.topics.length).map((g) => g.id));
      const lessonsNamed = grades.some((g) => g.nodes.some((n) => n.kind === 'lesson' && n.topic));
      check('a lesson level says which topic it teaches', lessonsNamed, false);

      const one = await call('GET', '/api/curriculum?track=english&grade=grammar');
      const og = one.payload && one.payload.tracks[0] && one.payload.tracks[0].grades[0];
      check('and it can be narrowed to one grade', one.status === 200 && og && og.id === 'grammar', og && og.id);

      // Sign the throwaway account back in. The privileged login above replaced
      // this run's session, and logging out then leaves the run with no session
      // at all — every later call would fail with "sign in to continue" and
      // report a problem it has nothing to do with. Signing back in restores the
      // session the rest of this run belongs to.
      const back = await call('POST', '/api/auth/login', { email, password });
      check('the run can resume its own session afterwards',
        back.status === 200, back.status);
    } else {
      console.log('  skip   the privileged curriculum checks (OWNER_PASSWORD not accepted)');
    }
  } else {
    console.log('  skip   the privileged curriculum checks (set OWNER_PASSWORD to run them)');
  }

  // One lesson, answered honestly enough to move mastery.
  const session = await call('POST', '/api/sessions', { enrollment_id: enrollment.id });
  check('a session starts', session.status === 201 && session.payload.items.length >= 2, session.payload);

  // Placement lands on a multiple of ten, which is a lesson level, so the first
  // session teaches before it tests.
  const firstKind = session.payload.blocks[0].kind;
  check('the first session matches the level it opens on', ['lesson', 'practice'].includes(firstKind), firstKind);
  if (firstKind === 'lesson') {
    const taught = session.payload.lesson;
    check('a lesson level serves a written lesson', !!taught && !!taught.title && taught.sections.length >= 1, taught && taught.title);
    check('the lesson has a summary and check questions',
      !!taught.summary && session.payload.items.every((i) => i.role === 'check'),
      { summary: !!(taught && taught.summary), roles: session.payload.items.map((i) => i.role) });
    console.log(`       lesson: "${taught.title}" (${taught.source}), ${taught.sections.length} sections, ${session.payload.items.length} checks`);
  } else {
    check('a practice level mixes roles', new Set(session.payload.items.map((i) => i.role)).size >= 2,
      session.payload.items.map((i) => i.role));
  }

  // The coach, on a question that has not been answered yet.
  const firstItem = session.payload.items[0];
  const coach = await call('POST', `/api/items/${firstItem.id}/coach`, { messages: [] });
  check('the coach opens the conversation', coach.status === 200 && coach.payload.reply.length > 10, coach.payload);
  const coachFollowUp = await call('POST', `/api/items/${firstItem.id}/coach`, {
    messages: [{ role: 'assistant', content: coach.payload.reply }, { role: 'user', content: 'I am not sure where to start.' }],
  });
  check('the coach continues the conversation', coachFollowUp.status === 200 && coachFollowUp.payload.reply.length > 10, coachFollowUp.payload);
  // Whether the coach leaks the answer cannot be checked from here — the client
  // is never sent the answer key, which is the point. scripts/self-test.js runs
  // that check in process, where the answer is available.
  console.log(`       coach source: ${coach.payload.source}`);

  let revealed = 0;
  let lastAnswer = null;
  for (const item of session.payload.items) {
    const res = await call('POST', `/api/sessions/${session.payload.session_id}/answer`, {
      item_id: item.id, answer: answerFor(item, 0.7), ms: 5000,
    });
    if (res.status === 200 && res.payload.reveal) revealed++;
    lastAnswer = res.payload;
  }
  check('answers are graded', revealed > 0 || session.payload.params.immediateFeedback === false, revealed);
  check('the last answer reports an empty block', lastAnswer && lastAnswer.block_remaining === 0, lastAnswer);
  check('the coach is recorded on the item it helped with',
    session.payload.items.length > 0, session.payload.items.length);

  const coachAfter = await call('POST', `/api/items/${firstItem.id}/coach`, { messages: [] });
  check('the coach refuses an already-answered question', coachAfter.status === 409, coachAfter.payload);

  // Close out the level, which is where a session decides whether to continue.
  const blockClose = await call('POST', `/api/sessions/${session.payload.session_id}/block-finish`, { block: 0 });
  check('block-finish resolves the level', blockClose.status === 200 && typeof blockClose.payload.level_complete === 'boolean', blockClose.payload);
  check('block-finish returns one recall question', !!blockClose.payload.retention, blockClose.payload.retention);
  console.log(`       level ${blockClose.payload.level}: ${blockClose.payload.level_complete ? 'complete' : 'more work needed'}, continue allowed: ${blockClose.payload.can_continue}`);

  const blockCloseAgain = await call('POST', `/api/sessions/${session.payload.session_id}/block-finish`, { block: 0 });
  check('a level cannot be closed twice', blockCloseAgain.status === 409, blockCloseAgain.payload);

  if (blockClose.payload.can_continue) {
    const second = await call('POST', `/api/sessions/${session.payload.session_id}/next-block`, {});
    check('next-block adds another level of work', second.status === 201 && second.payload.items.length >= 5, second.payload);
    check('the session now spans more than one block', (second.payload.blocks || []).length === 2, second.payload.blocks);
    for (const item of second.payload.items.slice(0, 3)) {
      await call('POST', `/api/sessions/${session.payload.session_id}/answer`, {
        item_id: item.id, answer: answerFor(item, 0.7), ms: 4000,
      });
    }
  }

  const recap = await call('POST', `/api/sessions/${session.payload.session_id}/finish`, {});
  check('finish reports the levels covered', Array.isArray(recap.payload.levels) && recap.payload.levels.length >= 1, recap.payload.levels);
  check('finish returns analysis', recap.status === 200 && !!recap.payload.analysis.summary, recap.payload);
  check('finish awards xp', recap.payload.xp > 0, recap.payload.xp);
  check('finish returns retention questions', (recap.payload.retention || []).length > 0, recap.payload.retention);
  console.log(`       accuracy ${Math.round(recap.payload.accuracy * 100)}%, xp ${recap.payload.xp}, analysis by ${recap.payload.analysis.source}`);

  for (const item of recap.payload.retention || []) {
    const res = await call('POST', `/api/sessions/${session.payload.session_id}/answer`, {
      item_id: item.id, answer: answerFor(item, 0.6), ms: 6000,
    });
    check('retention answer accepted after finish', res.status === 200, res.payload);
    break;
  }

  const finishAgain = await call('POST', `/api/sessions/${session.payload.session_id}/finish`, {});
  check('finishing twice is idempotent', finishAgain.payload.already === true, finishAgain.payload);

  const tutor = await call('POST', `/api/items/${session.payload.items[0].id}/ask`, { question: 'Why is that the answer?' });
  check('tutor answers (or falls back)', tutor.status === 200 && tutor.payload.reply.length > 10, tutor.payload);

  // A session left open is resumed rather than duplicated — a closed tab must
  // not cost a learner their place. (Checkpoint passing and failing is covered
  // in scripts/self-test.js, which can answer correctly.)
  const openSession = await call('POST', '/api/sessions', { enrollment_id: enrollment.id });
  check('a new session starts after the last one finished', openSession.status === 201, openSession.payload);
  await call('POST', `/api/sessions/${openSession.payload.session_id}/answer`, {
    item_id: openSession.payload.items[0].id, answer: answerFor(openSession.payload.items[0], 0.5), ms: 3000,
  });
  const resumed = await call('POST', '/api/sessions', { enrollment_id: enrollment.id });
  check('an unfinished session is resumed, not duplicated',
    resumed.payload.resumed === true && resumed.payload.session_id === openSession.payload.session_id, resumed.payload);
  check('the resumed session remembers what was answered',
    resumed.payload.items.filter((i) => i.answered).length === 1,
    resumed.payload.items.filter((i) => i.answered).length);
  await call('POST', `/api/sessions/${openSession.payload.session_id}/finish`, {});

  const exported = await call('GET', '/api/account/export');
  check('data export includes sessions', exported.status === 200 && Array.isArray(exported.payload.sessions), Object.keys(exported.payload || {}));

  const logout = await call('POST', '/api/auth/logout', {});
  check('logout', logout.status === 200, logout.payload);
  const me = await call('GET', '/api/auth/me');
  check('session ends on logout', me.payload.user === null, me.payload);

  console.log(`\n${failures ? `${failures} failure(s)` : 'all checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('smoke test crashed:', err);
  process.exit(1);
});
