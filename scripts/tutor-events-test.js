/**
 * Tests and other dates on the learner's calendar (services/tutor-events.js, routes/events.js, the dock routes; docs/TUTOR-EVENTS.md):
 *
 *   node scripts/tutor-events-test.js
 *
 * Throwaway db, ai.talk mocked to count calls: the dates are read in code, so the suggestion, the yes and the calendar need no model.
 */
process.env.TUTOR_FULL = '0';
const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = path.join(os.tmpdir(), `tutor-events-test-${process.pid}.json`);
try { fs.unlinkSync(process.env.DB_FILE); } catch { /* none there */ }
delete process.env.TUTOR_EVENTS;

const express = require('express');
const db = require('../config/db');
const ai = require('../services/ai');
let modelCalls = 0;
ai.talk = async () => { modelCalls++; return 'Sounds good, what part feels shakiest?'; };

const ev = require('../services/tutor-events');

let failures = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ok   ${label}`); return; }
  failures++;
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
}

// ---- the parser: 2026-11-08 is a Sunday ----
const T = '2026-11-08';
const one = (s, country = 'US') => ev.detect(s, { today: T, country });
const dates = (s, country) => one(s, country).map((e) => e.date);

(async () => {
  console.log('parser: words');
  check('today', dates('I have a math test today')[0] === '2026-11-08');
  check('tomorrow', dates('math test tomorrow')[0] === '2026-11-09');
  check('day after tomorrow', dates('math quiz the day after tomorrow')[0] === '2026-11-10');
  check('bare weekday is the next one', dates('math test Thursday')[0] === '2026-11-12' && dates('quiz on friday')[0] === '2026-11-13');
  check('bare weekday said on that day asks', (() => { const r = one('test on Sunday')[0]; return r.date === null && /today|next Sunday/i.test(r.ask) && r.candidates.length === 2; })());
  check('this Friday', dates('chem test this Friday')[0] === '2026-11-13');
  check('this weekday on its own day is today', ev.detect('quiz this Wednesday', { today: '2026-11-11' })[0].date === '2026-11-11');
  check('next Tuesday is the Tuesday of next week', dates('essay due next Tuesday')[0] === '2026-11-10' && ev.detect('essay due next Tuesday', { today: '2026-11-11' })[0].date === '2026-11-17');
  check('in 3 days / in two weeks', dates('bio test in 3 days')[0] === '2026-11-11' && dates('bio test in two weeks')[0] === '2026-11-22');
  check('next week asks which day', (() => { const r = one('math test next week')[0]; return r.date === null && /Which day/.test(r.ask); })());
  check('next month asks too', one('exam next month')[0].date === null);

  console.log('parser: calendar dates');
  check('Nov 12 / november 12th', dates('test Nov 12')[0] === '2026-11-12' && dates('test on november 12th')[0] === '2026-11-12');
  check('12 November / 12th of nov', dates('test 12 November')[0] === '2026-11-12' && dates('test on the 12th of nov')[0] === '2026-11-12');
  check('a date long past rolls to next year, a recent one asks', dates('final exam is on Jan 15')[0] === '2027-01-15' && one('test on Oct 20')[0].date === null && /passed/.test(one('test on Oct 20')[0].ask));
  check('explicit past year asks', one('test on Nov 12 2025')[0].date === null && /passed/.test(one('test on Nov 12 2025')[0].ask));
  check('Feb 30 is not a date', one('test on Feb 30')[0].date === null && /does not exist/.test(one('test on Feb 30')[0].ask));
  check('the 15th is the next 15th', dates('quiz on the 15th')[0] === '2026-11-15' && ev.detect('quiz on the 5th', { today: T })[0].date === '2026-12-05');
  check('ISO date', dates('test 2026-12-01')[0] === '2026-12-01');
  check('more than a year away asks', one('test in 500 days')[0].date === null);
  check('11/12 in the US is Nov 12', dates('bio test 11/12', 'US')[0] === '2026-11-12');
  check('11/12 in the UK is 11 Dec', dates('bio test 11/12', 'GB')[0] === '2026-12-11');
  check('13/11 is unambiguous anywhere', dates('bio test 13/11', 'US')[0] === '2026-11-13' && dates('bio test 11/13', 'GB')[0] === '2026-11-13');
  check('11/12 with no known country asks, with both readings', (() => { const r = one('bio test 11/12', null)[0]; return r.date === null && /Nov/.test(r.ask) && /Dec/.test(r.ask) && r.candidates.length === 2; })());
  check('a plain 11/11 needs no question', dates('bio test 11/11', null)[0] === '2026-11-11');
  check('a time', one('chem quiz tomorrow at 3pm')[0].time === '15:00' && one('quiz tomorrow at 9:30 am')[0].time === '09:30' && one('quiz tomorrow at 14:05')[0].time === '14:05' && one('quiz tomorrow')[0].time === null);

  console.log('parser: titles, kinds, several, no event');
  check('titles and kinds', (() => { const r = one('I have a math test on Thursday')[0]; return r.title === 'Math test' && r.kind === 'test'; })());
  check('quiz / exam / due kinds', one('chemistry quiz tomorrow')[0].kind === 'quiz' && one('history midterm Nov 12')[0].kind === 'exam' && one('english essay is due Friday')[0].kind === 'due' && one('english essay is due Friday')[0].title === 'English essay due');
  check('something that is not a test', one('I have a piano recital on Saturday')[0].kind === 'other');
  check('several in one message', (() => { const r = one('Math test Thursday and English quiz Friday'); return r.length === 2 && r[0].date === '2026-11-12' && r[1].date === '2026-11-13' && r[1].title === 'English quiz'; })());
  check('several across sentences', one('I have a chem exam on Nov 20. Also a history quiz next Monday; bio test in 10 days').length === 3);
  check('the same one said twice is one', one('math test Thursday. math test Thursday').length === 1);
  check('a date with no event is nothing', one('I will study on Thursday').length === 0 && one('see you tomorrow').length === 0);
  check('an event with no date is nothing (no nagging)', one('I have a math test').length === 0);
  check('a past event being talked about is nothing', one('how did my math test go yesterday').length === 0 && one('I failed my test last Friday').length === 0);
  check('junk input is safe', ev.detect('', { today: T }).length === 0 && ev.detect(null, { today: T }).length === 0 && ev.detect('test tomorrow', {}).length === 0 && ev.detect('x'.repeat(100000) + ' test tomorrow', { today: T }).length <= 5);
  check('yes and no phrases', ['yes', 'Yeah!', 'add it', 'yes please', 'sure', 'go ahead', 'okay.'].every(ev.isYes) && ['not now', 'no', 'No thanks', 'never mind'].every(ev.isNo) && !ev.isYes('yes but what is a fraction') && !ev.isNo('no idea what 3/4 is'));

  console.log('storage and routes');
  const u = db.insert('users', { email: 'ev@example.test', display_name: 'Eva', password_hash: 'x', age_check: { country: 'US' }, retention_tz: 'UTC', account_type: 'adult' });
  const other = db.insert('users', { email: 'ev2@example.test', display_name: 'Other', password_hash: 'x', age_check: { country: 'US' }, retention_tz: 'UTC' });
  const child = db.insert('users', { email: 'kid@example.test', display_name: 'Kid', password_hash: 'x', account_type: 'child', age_check: { country: 'US', age_at_check: 10 }, retention_tz: 'UTC' });
  const enr = db.insert('enrollments', { user_id: u.id, track_id: 'math', grade_id: 'grade-6' });
  const enrKid = db.insert('enrollments', { user_id: child.id, track_id: 'math', grade_id: 'grade-6' });
  const today = ev.todayOf(u);
  const plus = (n) => ev.addDays(today, n);
  const dayName = (iso) => ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${iso}T00:00:00Z`).getUTCDay()];

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = db.byId('users', Number(req.headers['x-user'])) || null; next(); });
  app.use('/api', require('../routes/events'));
  app.use('/api', require('../routes/tutor'));
  app.use('/api', require('../routes/retention-goals'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const { port } = server.address();
  const call = (method, url, body, uid) => new Promise((ok, fail) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: '127.0.0.1', agent: false, port, path: url, method, headers: { 'content-type': 'application/json', 'x-user': String(uid || ''), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { json = text; } ok({ status: res.statusCode, json, text }); });
    });
    req.on('error', fail);
    if (data) req.write(data);
    req.end();
  });
  const rowsOf = (uid) => db.find('tutor_events', (r) => r.user_id === uid);

  check('signed out is refused', (await call('GET', '/api/events')).status === 401 || (await call('GET', '/api/events')).status === 403);
  let r = await call('POST', '/api/events', { title: 'Math test', date: plus(3), kind: 'test', enrollment_id: enr.id }, u.id);
  const first = r.json.event;
  check('add by hand', r.status === 201 && first && first.source === 'manual' && first.enrollment_id === enr.id, r.json);
  r = await call('POST', '/api/events', { title: 'Math test', date: plus(3), kind: 'test' }, u.id);
  check('the same event is not added twice', r.status === 200 && r.json.existing === true && rowsOf(u.id).length === 1);
  check('bad input refused', (await call('POST', '/api/events', { title: '', date: plus(1) }, u.id)).status === 400
    && (await call('POST', '/api/events', { title: 'x', date: '2026-02-30' }, u.id)).status === 400
    && (await call('POST', '/api/events', { title: 'x', date: plus(1), kind: 'party' }, u.id)).status === 400
    && (await call('POST', '/api/events', { title: 'x', date: plus(1), time: '25:00' }, u.id)).status === 400);
  r = await call('POST', '/api/events', { title: '<b>Hi</b>', date: plus(2), enrollment_id: enrKid.id }, u.id);
  check('markup is stripped and another learner\'s enrollment is not linked', r.status === 201 && !/[<>]/.test(r.json.event.title) && r.json.event.enrollment_id === null, r.json);
  r = await call('POST', '/api/events', { title: 'Old', date: plus(-3), source: 'tutor' }, u.id);
  check('the tutor source refuses a past date; by hand a past one is allowed', r.status === 400 && (await call('POST', '/api/events', { title: 'Old', date: plus(-3) }, u.id)).status === 201);
  r = await call('GET', '/api/events', null, u.id);
  check('list is soonest first, with today and subjects', r.status === 200 && r.json.events.length === 3 && r.json.events[0].date <= r.json.events[1].date && r.json.today === today && r.json.enrollments.length === 1, r.json);
  r = await call('GET', `/api/events?from=${plus(1)}&to=${plus(2)}`, null, u.id);
  check('list by range', r.json.events.length === 1);
  r = await call('PUT', `/api/events/${first.id}`, { date: plus(4), title: 'Math unit test' }, u.id);
  check('edit', r.status === 200 && r.json.event.date === plus(4) && r.json.event.title === 'Math unit test' && r.json.event.kind === 'test', r.json);
  check('another learner cannot read, edit or delete it', (await call('GET', '/api/events', null, other.id)).json.events.length === 0
    && (await call('PUT', `/api/events/${first.id}`, { title: 'Mine' }, other.id)).status === 404 && (await call('DELETE', `/api/events/${first.id}`, null, other.id)).status === 404 && rowsOf(u.id).some((x) => x.id === first.id));
  r = await call('DELETE', `/api/events/${first.id}`, null, u.id);
  check('delete', r.status === 200 && !rowsOf(u.id).some((x) => x.id === first.id));
  let limited = 0;
  for (let i = 0; i < 125; i++) { const x = await call('POST', '/api/events', { title: `Bulk ${i}`, date: plus(5 + (i % 30)) }, other.id); if (x.status === 429) limited++; }
  check('writes are rate-limited', limited > 0);
  db.remove('tutor_events', (x) => x.user_id === other.id);

  console.log('the tutor chat: card flow');
  db.remove('tutor_events', (x) => x.user_id === u.id);
  const dock = (text, uid = u.id, mode = 'text', hist = []) => call('POST', '/api/tutor/dock', { messages: [...hist, { role: 'user', content: text }], page: { path: '/dashboard' }, input_mode: mode }, uid);
  const thu = ev.addDays(today, 3);
  const wd = dayName(thu);
  let before = modelCalls;
  r = await dock(`I have a math test on ${wd}`);
  const sg = r.json.events && r.json.events.suggestions && r.json.events.suggestions[0];
  check('a message with an event and a date carries a suggestion card with the reply', r.status === 200 && r.json.reply && sg && sg.title === 'Math test' && sg.date === thu && sg.question === `Add Math test, ${ev.niceDate(thu)}?` && sg.enrollment_id === enr.id, r.json);
  check('the tutor reply is the normal reply; the card is separate data', modelCalls === before + 1 && !/calendar/i.test(r.json.reply));
  check('nothing is written before Add', rowsOf(u.id).length === 0);
  check('the card offers the subject\'s review goal as a second, separate choice', sg.goal_offer && sg.goal_offer.test_date === thu && /Reviews will aim at/.test(sg.goal_offer.text) && !db.byId('enrollments', enr.id).retention_goal);
  r = await call('POST', '/api/events', { title: 'Math test (edited)', date: ev.addDays(today, 4), kind: 'test', enrollment_id: sg.enrollment_id, source: 'tutor', suggestion_id: sg.id }, u.id);
  check('Add writes it, with the edits, as a tutor event', r.status === 201 && r.json.event.title === 'Math test (edited)' && r.json.event.source === 'tutor' && rowsOf(u.id).length === 1, r.json);
  check('the goal is still untouched until the learner agrees', !db.byId('enrollments', enr.id).retention_goal);
  r = await call('GET', `/api/events/goal-preview?enrollment_id=${enr.id}&date=${ev.addDays(today, 4)}`, null, u.id);
  check('goal preview says what changes', r.status === 200 && /Reviews will aim at/.test(r.json.text), r.json);
  r = await call('PUT', '/api/retention-goals', { kind: 'enrollment', id: enr.id, horizon: 'date', test_date: ev.addDays(today, 4) }, u.id);
  check('the second choice sets the retention goal through the existing route', r.status === 200 && db.byId('enrollments', enr.id).retention_goal.test_date === ev.addDays(today, 4), r.json);
  check('goal preview refuses another learner\'s enrollment', (await call('GET', `/api/events/goal-preview?enrollment_id=${enr.id}&date=${thu}`, null, other.id)).status === 404);
  db.remove('tutor_events', (x) => x.user_id === u.id);
  db.update('enrollments', enr.id, { retention_goal: null });

  console.log('the chat: yes, no, questions, several, voice');
  r = await dock(`quiz in chemistry on ${wd}`);
  const sg2 = r.json.events.suggestions[0];
  before = modelCalls;
  r = await dock('yes', u.id, 'text', [{ role: 'user', content: `quiz in chemistry on ${wd}` }, { role: 'assistant', content: 'ok' }]);
  check('a typed yes adds the pending suggestion with no model call', r.status === 200 && r.json.added && r.json.added[0].date === thu && modelCalls === before && rowsOf(u.id).length === 1 && rowsOf(u.id)[0].source === 'tutor', r.json);
  r = await dock('yes');
  check('a second yes adds nothing (nothing pending)', rowsOf(u.id).length === 1 && !(r.json.added));
  db.remove('tutor_events', (x) => x.user_id === u.id);

  await dock(`math test ${wd}`);
  before = modelCalls;
  r = await dock('add it');
  check('"add it" works, and offers the review goal as a question', r.json.added && /aim Mathematics reviews at that date/.test(r.json.reply) && r.json.goal_offer && !db.byId('enrollments', enr.id).retention_goal, r.json);
  r = await dock('yes');
  check('a yes to the goal question sets the goal', r.json.goal_set && db.byId('enrollments', enr.id).retention_goal && db.byId('enrollments', enr.id).retention_goal.test_date === thu, r.json);
  db.update('enrollments', enr.id, { retention_goal: null });
  db.remove('tutor_events', (x) => x.user_id === u.id);

  await dock(`math test ${wd}`);
  await dock('add it');
  r = await dock('no thanks');
  check('no to the goal question leaves the goal alone', r.json.dismissed && !db.byId('enrollments', enr.id).retention_goal);
  db.remove('tutor_events', (x) => x.user_id === u.id);

  await dock(`math test ${wd}`);
  r = await dock('not now');
  check('"not now" writes nothing and clears the offer', r.json.dismissed && rowsOf(u.id).length === 0 && (await dock('yes')).json.added === undefined);

  r = await dock('math test next week');
  const asked = r.json.events;
  check('"next week" gives a card with no date and a question', asked.suggestions[0].date === null && /Which day/.test(asked.ask[0]));
  r = await dock('yes');
  check('a yes with no day set asks which day, writes nothing', /Which day/.test(r.json.reply) && rowsOf(u.id).length === 0);
  r = await dock(wd);
  check('the day, said next, fills the card', r.json.events && r.json.events.suggestions[0].date === thu && rowsOf(u.id).length === 0, r.json);
  r = await dock('yes');
  check('and then a yes adds it', r.json.added && r.json.added[0].date === thu);
  db.remove('tutor_events', (x) => x.user_id === u.id);

  r = await dock(`test on ${ev.addDays(today, -2)}`);
  check('a past date is asked about, never added', r.json.events.suggestions[0].date === null && /passed/.test(r.json.events.ask[0]));
  r = await dock('yes');
  check('...and a yes does not add it', rowsOf(u.id).length === 0);

  r = await dock(`Math test ${wd} and English quiz ${dayName(ev.addDays(today, 5))}`);
  check('two events, two cards', r.json.events.suggestions.length === 2);
  r = await dock('yes');
  check('one yes adds both', r.json.added && r.json.added.length === 2 && rowsOf(u.id).length === 2);
  db.remove('tutor_events', (x) => x.user_id === u.id);

  r = await dock(`math test ${wd}`, u.id, 'voice');
  check('in a voice turn the reply itself asks "Want me to add it to your calendar?"', /Want me to add it to your calendar\?$/.test(r.json.reply), r.json.reply);
  r = await dock('yes', u.id, 'voice');
  check('and a spoken yes adds it', r.json.added && rowsOf(u.id).length === 1);
  db.remove('tutor_events', (x) => x.user_id === u.id);

  r = await dock('how did my math test go');
  check('a question about a past test creates no card', !r.json.events);
  r = await dock('I want to hurt myself, I have a math test tomorrow');
  check('a safety reply carries no card', !r.json.events);
  check('an offer waits only 30 minutes', (() => { ev.setPending(u.id, { stage: 'add', items: [{ id: 'x', title: 'T', date: plus(1), kind: 'test' }] }); ev.getPending(u.id); const real = Date.now; Date.now = () => real() + 31 * 60 * 1000; const gone = ev.getPending(u.id) === null; Date.now = real; return gone; })());

  console.log('consent: nothing leaves the server');
  before = modelCalls;
  r = await call('POST', '/api/tutor/dock', { messages: [{ role: 'user', content: `science quiz on ${wd}` }], page: { path: '/dashboard' }, input_mode: 'text' }, child.id);
  check('a child without a parent\'s outside-AI yes gets the card (code only)', r.status === 200 && r.json.events && r.json.events.suggestions[0].date === thu, r.json);
  before = modelCalls;
  r = await dock('yes', child.id, 'text', [{ role: 'user', content: `science quiz on ${wd}` }, { role: 'assistant', content: 'ok' }]);
  check('and a yes adds it with no model call at all', r.json.added && modelCalls === before, r.json);
  check('the event is stored for the child', rowsOf(child.id).length === 1);
  check('the parser and the answer never import a provider', !/require\('\.\/(ai|providers)/.test(fs.readFileSync(path.join(__dirname, '..', 'services', 'tutor-events.js'), 'utf8')));

  console.log('context, switch, account');
  db.remove('tutor_events', (x) => x.user_id === u.id);
  ev.add(u.id, { title: 'Chemistry quiz', date: plus(3), kind: 'quiz' }, { source: 'tutor' });
  ev.add(u.id, { title: 'Far away test', date: plus(60), kind: 'test' });
  ev.add(u.id, { title: 'Yesterday', date: plus(-1), kind: 'test' });
  const lines = ev.contextLines(u.id, today);
  check('the next 30 days only, with days away', lines.length === 1 && /Chemistry quiz/.test(lines[0]) && /in 3 days/.test(lines[0]), lines);
  const tctx = require('../services/tutor-context');
  const built = tctx.build(u.id, { path: '/dashboard' }, 'full');
  check('the tutor\'s context carries them, inside its size budget', /Their calendar, next 30 days: Chemistry quiz/.test(built.text) && built.used <= tctx.DOCK_MAX, built.text.slice(0, 200));
  for (let i = 0; i < 30; i++) ev.add(u.id, { title: `A long event title number ${i} for the budget`, date: plus(1 + (i % 25)), kind: 'other' });
  check('and stays inside the budget with many events', ev.contextLines(u.id, today).length <= 6 && tctx.build(u.id, { path: '/dashboard' }, 'full').used <= tctx.DOCK_MAX);

  process.env.TUTOR_EVENTS = '0';
  check('TUTOR_EVENTS=0: routes 404, no card, no context', (await call('GET', '/api/events', null, u.id)).status === 404 && !(await dock(`math test ${wd}`)).json.events && ev.contextLines(u.id, today).length === 0 && !/Their calendar/.test(tctx.build(u.id, { path: '/dashboard' }, 'full').text));
  delete process.env.TUTOR_EVENTS;

  const consent = require('../routes/consent');
  check('events are on the delete and export lists', consent.collectionNames().includes('tutor_events') && /'tutor_events'/.test(fs.readFileSync(path.join(__dirname, '..', 'routes', 'profile.js'), 'utf8')));
  const del = require('../services/account-deletion');
  const out = del.deleteAccount(db.byId('users', u.id));
  check('deleting the account removes the events', rowsOf(u.id).length === 0 && out.tutor_events > 0, out);
  check('and not other learners\' events', rowsOf(child.id).length === 1);
  check('files are wired', /calendar-events\.js/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'calendar.html'), 'utf8')) && /eventsUi/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tutor-dock.js'), 'utf8')));
  check('the calendar script leaves the enforcer calendar files alone', !/calendar-events/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'calendar.js'), 'utf8')));

  server.close();
  try { fs.unlinkSync(process.env.DB_FILE); } catch { /* fine */ }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
