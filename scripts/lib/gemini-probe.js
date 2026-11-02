// One tiny call to the Gemini free tier: prints the HTTP status (200 = the quota is back). node scripts/lib/gemini-probe.js
require('dotenv').config({ path: 'C:/coding/claudecommittdIq/folderThing/.env' });
(async () => {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'say ok' }] }], generationConfig: { maxOutputTokens: 5 } }) });
  console.log(r.status);
})();
