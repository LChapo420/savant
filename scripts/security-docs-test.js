// Checks that the security programme and retention schedule documents match the code they describe.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let failed = 0;
function check(name, ok) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }

const sec = read('docs/SECURITY-PROGRAMME.md');
const ret = read('docs/RETENTION-SCHEDULE.md');
const server = read('server.js');
const secMw = read('middleware/security.js');
const consent = read('routes/consent.js');
const policy = read('public/privacy.html');
const upload = require('../services/upload-retention');

check('bcrypt hashing used', /bcryptjs/.test(read('routes/profile.js')) && /bcrypt/i.test(sec));
check('session cookie flags match the doc', /httpOnly: true/.test(server) && /sameSite: 'lax'/.test(server) && /secure: isProduction/.test(server) && /30 \* 24 \* 3600 \* 1000/.test(server) && /30 days/.test(sec));
check('CSP and headers named in the doc exist', ["script-src 'self'", "frame-ancestors 'none'", "object-src 'none'", 'nosniff', 'DENY', 'Strict-Transport-Security'].every((s) => secMw.includes(s)) && /frame-ancestors 'none'/.test(sec));
check('same-origin check exists', /enforceSameOrigin/.test(secMw) && /enforceSameOrigin/.test(sec));
check('child retention days match the doc', /Number\(process\.env\.CONSENT_PENDING_DAYS \|\| 14\)/.test(consent) && /Number\(process\.env\.CONSENT_REVOKED_DAYS \|\| 30\)/.test(consent) && /14 days/.test(ret) && /30 days/.test(ret));
check('upload retention default is 7 and the doc says 7', upload.retentionDays() === 7 && /7 days/.test(ret));
check('policy retention table agrees (14, 30, 7 days)', /Deleted after 14 days/.test(policy) && /deleted after 30 days/.test(policy) && /after 7 days/.test(policy));
check('sign-in is rate limited and policy says no sale', /router\.post\('\/login', limit\('login'/.test(read('routes/auth.js')) && /never sell/.test(policy) && /never sold and never used for advertising/.test(ret));
check('every code path named in the docs exists', [...(sec + ret).matchAll(/`((?:services|routes|middleware)\/[\w\-./]+?\.js)`/g)].every((m) => fs.existsSync(path.join(root, m[1]))));
check('backups and review dates are left to the owner, not invented', /OWNER:/.test(sec) && /no schedule is written yet/.test(ret) && /\(none yet\)/.test(sec));
check('docs claim no certification, test or lawyer review', !/certified|SOC ?2|ISO 27001|passed (a|an) (audit|penetration test)/i.test(sec + ret) && /No independent security test/.test(sec));
process.exit(failed ? 1 : 0);
