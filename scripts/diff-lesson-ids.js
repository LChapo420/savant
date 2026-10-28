// Where the lesson's script builds the Section 03 engine and the Section 05
// highlighting, and what it expects to already exist when it does.
const fs = require('fs');

const html = fs.readFileSync('content/base-lessons/english/proficient/level-105.html', 'utf8');
const js = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];

function show(label, re, limit = 3) {
  const lines = js.split('\n');
  console.log(`\n=== ${label} ===`);
  let shown = 0;
  for (let i = 0; i < lines.length && shown < limit; i++) {
    if (re.test(lines[i])) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 5);
      console.log(lines.slice(start, end)
        .map((l, n) => `${String(start + n + 1).padStart(4)}: ${l.trim()}`).join('\n'));
      console.log('   ---');
      shown += 1;
    }
  }
  if (!shown) console.log('(not found)');
}

show('where .node elements are created', /\.node/);
show('where .frag is created', /\.frag/);
show('the detonate button wiring', /detonateBtn/);
show('the mode button wiring', /data-mode/);
show('the hypothesis wiring', /\.hypo/);
