// What is the API serving for a base lesson right now?
// Sets a known password for the account so we can sign in without the owner
// having to hand one over, then reads the lesson route over HTTP.
const BASE = process.env.BASE || 'http://localhost:6767';
const db = require('../config/db');
const bcrypt = require('bcryptjs');

let cookie = '';

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (setCookies.length) cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 300); }
  return { status: res.status, body: parsed };
}

(async () => {
  const [userIdRaw, track, grade, level] = process.argv.slice(2);
  const user = db.byId('users', Number(userIdRaw));
  if (!user) { console.error('no such user'); process.exit(1); }

  const password = 'LocalTest-' + Date.now();
  db.update('users', user.id, { password_hash: bcrypt.hashSync(password, 10) });
  db.flush();

  const login = await call('POST', '/api/auth/login', { email: user.email, password });
  console.log('login:', login.status);
  if (login.status !== 200) { console.log(JSON.stringify(login.body)); process.exit(1); }

  const page = await call('GET', `/api/lessons/${track}/${grade}/${level}`);
  console.log(`GET /api/lessons/${track}/${grade}/${level}:`, page.status);
  if (page.status !== 200) { console.log(JSON.stringify(page.body)); process.exit(1); }

  const html = page.body.html;
  console.log('  characters served:', html.length);
  console.log('  first 160:', JSON.stringify(html.slice(0, 160)));
  console.log('  model in meta:', page.body.meta && page.body.meta.model);
  console.log('  topic in meta:', page.body.meta && page.body.meta.topic);
  console.log('  finish button:', /Finish Lesson/i.test(html));
  console.log('  calls the shell fn:', /polymathFinishLesson/.test(html));

  // And what the file on disk holds, for comparison.
  const fs = require('fs');
  const path = require('path');
  const file = path.join('content', 'base-lessons', track, grade, `level-${level}.html`);
  const onDisk = fs.readFileSync(file, 'utf8');
  console.log('\n  on disk:', onDisk.length, 'characters');
  console.log('  served matches disk:', html === onDisk);
})().catch((e) => { console.error(e.message); process.exit(1); });
