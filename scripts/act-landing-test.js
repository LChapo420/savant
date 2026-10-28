/* The /act landing page: every claim on it is true of the code, it stays light,
 * and "Start free" carries ACT through sign-up into onboarding. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed++; };

const html = read('public/act.html');
const text = html.replace(/<[^>]*>/g, ' ');

console.log('page');
check('served at /act by the static handler (extensions: html)', fs.existsSync(path.join(__dirname, '..', 'public/act.html')));
check('title, description and viewport', /<title>[^<]+<\/title>/.test(html) && /name="description"/.test(html) && /name="viewport"/.test(html));
check('two Start free buttons into register with ACT', (html.match(/href="\/register\?track=act">Start free/g) || []).length === 2);
check('no third-party scripts or styles', !/(src|href)="https?:\/\/[^"]*\.(js|css)"/.test(html) && !/<script[^>]*src="https?:/.test(html));
check('page size under 12 KB', Buffer.byteLength(html) < 12 * 1024);
check('loads only the shared scripts and its own', [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).join() === '/js/style-boot.js,/js/icons.js,/js/app.js,/js/act-landing.js');
check('no invented numbers: no score gains, user counts or testimonials', !/(\+\s?\d+\s*points?|\d+\s*(students|users) (have|raised|improved)|testimonial|"[^"]*said)/i.test(text));
check('says there are no results yet', /no results yet/i.test(text));
check('does not promise a score prediction or timing as a feature', !/(predict(s|ed)? your|timed sections?|scaled estimate)/i.test(text.replace(/does not[^.]*\./gi, '').replace(/not yet[^.]*\./gi, '')));

console.log('claims match the code');
const { TRACKS } = require('../config/curriculum');
const act = TRACKS.find((t) => t.id === 'act');
check('ACT has 16 grades, as the page says', act.grades.length === 16 && /16 ACT grades/.test(text));
const adaptive = read('services/adaptive-placement.js');
check('placement length on the page (20 to 90 minutes) matches WHOLE_MINUTES', /from about 20 to about 90 minutes/.test(text) && /WHOLE_MINUTES = \{ quick: 20, balanced: 45, accurate: 90 \}/.test(adaptive));
const exists = (p) => fs.existsSync(path.join(__dirname, '..', p));
check('daily review session exists', exists('services/review-session.js'));
check('ACT scores page and route exist', exists('public/act-scores.html') && exists('routes/act.js'));
check('ACT study page exists', exists('public/act-study.html'));
check('privacy page exists and states no selling or ads', /never sell personal data|never sell your data/i.test(read('public/privacy.html')) || /do not sell personal data/i.test(read('public/privacy.html')));
const scores = require('../services/act-scores');
const cleaned = scores.cleanScore({ kind: 'practice', taken_on: '2026-10-01', english: 20, math: 20, reading: 20, science: 36 });
check('Science stays out of the composite, as the page says', /Science is shown but is not counted/.test(text) && !cleaned.error && cleaned.value.composite === 20);
check('75% pass mark matches config', /75%/.test(text) && /0\.75|75/.test(read('config/curriculum.js')));
check('under-13 rule on the page matches the privacy page', /13 in the United States/.test(text) && /13 in the United States/.test(read('public/privacy.html')));

console.log('sign-up flow');
const auth = read('public/js/auth.js');
check('auth.js takes a plain track id only', /\^\[a-z0-9_-\]\{1,40\}\$/.test(auth));
check('track survives the style quiz and survey chain', /style-quiz\?next=\$\{encodeURIComponent\(onboarding\)\}/.test(auth) && /encodeURIComponent\(`\/survey\?next=/.test(auth));
const chain = /encodeURIComponent\(`\/survey\?next=\$\{encodeURIComponent\(onboarding\)\}`\)/.test(auth);
check('nested next is encoded twice', chain);
const landing = read('public/js/act-landing.js');
check('signed-in learners go straight to onboarding with ACT', /\/onboarding\?track=act/.test(landing));
const onboarding = read('public/js/onboarding.js');
check('onboarding brings the wanted subject card into view', /wantedTrack && !wantedGrade/.test(onboarding) && /scrollIntoView/.test(onboarding));

console.log('served');
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
const server = app.listen(0, '127.0.0.1', () => {
  const get = (p) => new Promise((resolve) => http.get({ host: '127.0.0.1', port: server.address().port, path: p }, (res) => {
    let body = ''; res.on('data', (d) => { body += d; }); res.on('end', () => resolve({ status: res.statusCode, body, type: res.headers['content-type'] }));
  }));
  Promise.all([get('/act'), get('/js/act-landing.js')]).then(([page, js]) => {
    check('/act answers 200 with HTML, no sign-in needed', page.status === 200 && /text\/html/.test(page.type) && /ACT prep that starts at your level/.test(page.body));
    check('its script is served', js.status === 200);
  }).finally(() => {
    server.close();
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
  });
});
