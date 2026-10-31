/**
 * Writes site/evidence.html: the PUBLIC evidence summary. Only Savant's main
 * pillars, each with a short plain-language summary and a few landmark sources.
 * It deliberately leaves out the mechanism-level detail (thresholds, schedules,
 * formulas) so the research behind the design stays ours.
 *
 * The full article (every mechanism, every source) stays private in
 * curriculum-build/EVIDENCE-ARTICLE.md. Never publish it or its detail here.
 *
 * Sources here must come from the article's verified reference list.
 *
 *   node site/tools/build-evidence-page.js
 */
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');
const OUT = path.join(SITE, 'evidence.html');

const S = {
  weiss1984: ['Weiss DJ, Kingsbury GG (1984). Application of computerized adaptive testing to educational problems. Journal of Educational Measurement.', 'https://doi.org/10.1111/j.1745-3984.1984.tb01040.x'],
  kalyuga2003: ['Kalyuga S, Ayres P, Chandler P, Sweller J (2003). The expertise reversal effect. Educational Psychologist.', 'https://doi.org/10.1207/s15326985ep3801_4'],
  kulik1990: ['Kulik CLC, Kulik JA, Bangert-Drowns RL (1990). Effectiveness of mastery learning programs: a meta-analysis. Review of Educational Research.', 'https://doi.org/10.3102/00346543060002265'],
  bloom1984: ['Bloom BS (1984). The 2 sigma problem: the search for methods of group instruction as effective as one-to-one tutoring. Educational Researcher.', 'https://doi.org/10.3102/0013189x013006004'],
  roediger2006: ['Roediger HL, Karpicke JD (2006). Test-enhanced learning: taking memory tests improves long-term retention. Psychological Science.', 'https://doi.org/10.1111/j.1467-9280.2006.01693.x'],
  karpicke2008: ['Karpicke JD, Roediger HL (2008). The critical importance of retrieval for learning. Science.', 'https://doi.org/10.1126/science.1152408'],
  rowland2014: ['Rowland CA (2014). The effect of testing versus restudy on retention: a meta-analytic review of the testing effect. Psychological Bulletin.', 'https://doi.org/10.1037/a0037559'],
  adesope2017: ['Adesope OO, Trevisan DA, Sundararajan N (2017). Rethinking the use of tests: a meta-analysis of practice testing. Review of Educational Research.', 'https://doi.org/10.3102/0034654316689306'],
  cepeda2006: ['Cepeda NJ, Pashler H, Vul E, Wixted JT, Rohrer D (2006). Distributed practice in verbal recall tasks: a review and quantitative synthesis. Psychological Bulletin.', 'https://doi.org/10.1037/0033-2909.132.3.354'],
  cepeda2008: ['Cepeda NJ, Vul E, Rohrer D, Wixted JT, Pashler H (2008). Spacing effects in learning: a temporal ridgeline of optimal retention. Psychological Science.', 'https://doi.org/10.1111/j.1467-9280.2008.02209.x'],
  latimier2021: ['Latimier A, Peyre H, Ramus F (2020). A meta-analytic review of the benefit of spacing out retrieval practice episodes on retention. Educational Psychology Review.', 'https://doi.org/10.1007/s10648-020-09572-8'],
  lindsey2014: ['Lindsey RV, Shroyer JD, Pashler H, Mozer MC (2014). Improving students’ long-term knowledge retention through personalized review. Psychological Science.', 'https://doi.org/10.1177/0956797613504302'],
  rohrer2015: ['Rohrer D, Dedrick RF, Stershic S (2015). Interleaved practice improves mathematics learning. Journal of Educational Psychology.', 'https://doi.org/10.1037/edu0000001'],
  brunmair2019: ['Brunmair M, Richter T (2019). Similarity matters: a meta-analysis of interleaved learning and its moderators. Psychological Bulletin.', 'https://doi.org/10.1037/bul0000209'],
  sweller1985: ['Sweller J, Cooper GA (1985). The use of worked examples as a substitute for problem solving in learning algebra. Cognition and Instruction.', 'https://doi.org/10.1207/s1532690xci0201_3'],
  hattie2007: ['Hattie J, Timperley H (2007). The power of feedback. Review of Educational Research.', 'https://doi.org/10.3102/003465430298487'],
  shute2008: ['Shute VJ (2008). Focus on formative feedback. Review of Educational Research.', 'https://doi.org/10.3102/0034654307313795'],
  vanlehn2011: ['VanLehn K (2011). The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems. Educational Psychologist.', 'https://doi.org/10.1080/00461520.2011.611369'],
  kulik2016: ['Kulik JA, Fletcher JD (2016). Effectiveness of intelligent tutoring systems: a meta-analytic review. Review of Educational Research.', 'https://doi.org/10.3102/0034654315581420'],
  pashler2008: ['Pashler H, McDaniel M, Rohrer D, Bjork R (2008). Learning styles: concepts and evidence. Psychological Science in the Public Interest.', 'https://doi.org/10.1111/j.1539-6053.2009.01038.x'],
  wouters2013: ['Wouters P, van Nimwegen C, van Oostendorp H, van der Spek ED (2013). A meta-analysis of the cognitive and motivational effects of serious games. Journal of Educational Psychology.', 'https://doi.org/10.1037/a0031311'],
  clark2016: ['Clark DB, Tanner-Smith EE, Killingsworth SS (2016). Digital games, design, and learning: a systematic review and meta-analysis. Review of Educational Research.', 'https://doi.org/10.3102/0034654315582065'],
  sailer2020: ['Sailer M, Homner L (2019). The gamification of learning: a meta-analysis. Educational Psychology Review.', 'https://doi.org/10.1007/s10648-019-09498-w'],
  deci1999: ['Deci EL, Koestner R, Ryan RM (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. Psychological Bulletin.', 'https://doi.org/10.1037/0033-2909.125.6.627'],
};

const PILLARS = [
  { title: 'It finds your level before it teaches',
    text: 'A short adaptive placement measures what you already know, so you start where you are. Re-teaching what someone has mastered wastes their time and can even get in the way of learning.',
    refs: ['weiss1984', 'kalyuga2003'] },
  { title: 'You master each step before moving on',
    text: 'Topics are proven before the next ones build on them, and gaps are repaired as they appear. Mastery learning and one-to-one tutoring are among the most effective approaches ever measured.',
    refs: ['kulik1990', 'bloom1984'] },
  { title: 'You learn by remembering, not rereading',
    text: 'Lessons and practice ask you to recall answers, with feedback, instead of reading them again. Retrieving knowledge makes it last far longer than restudying it.',
    refs: ['roediger2006', 'karpicke2008', 'rowland2014', 'adesope2017'] },
  { title: 'Review is timed to your memory',
    text: 'Savant tracks each skill and schedules it to come back for review on a timetable set for you, sooner when it starts to slip. Spacing practice out is one of the most reliable findings in learning research.',
    refs: ['cepeda2006', 'cepeda2008', 'latimier2021', 'lindsey2014'] },
  { title: 'Practice mixes topics together',
    text: 'Once a topic has been taught, practice mixes it with earlier ones, so you learn to tell problems apart and choose the right method.',
    refs: ['rohrer2015', 'brunmair2019'] },
  { title: 'Clear explanations and useful feedback',
    text: 'New ideas start with worked examples, and every answer explains why it is right or wrong.',
    refs: ['sweller1985', 'hattie2007', 'shute2008'] },
  { title: 'It adapts to how you are actually doing',
    text: 'Savant shapes each lesson from your own answers and interests, like a personal tutor. It does not sort people into "learning styles", because research does not support teaching to them.',
    refs: ['vanlehn2011', 'kulik2016', 'pashler2008'] },
  { title: 'Games where they help, in moderation',
    text: 'Learning games appear where they support practice, not as a reward that replaces the reason to learn. Research finds games help, with mixed results for points and badges, so Savant uses them with care.',
    refs: ['wouters2013', 'clark2016', 'sailer2020', 'deci1999'] },
];

// Number sources in order of first use.
const order = [];
for (const p of PILLARS) for (const r of p.refs) if (!order.includes(r)) order.push(r);
for (const r of order) if (!S[r]) throw new Error(`unknown source ${r}`);
const num = (r) => order.indexOf(r) + 1;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const privacy = fs.readFileSync(path.join(SITE, 'privacy.html'), 'utf8').replace(/\r\n/g, '\n');
const head = privacy.slice(0, privacy.indexOf('<main'))
  .replace(/<title>[^<]*<\/title>/, '<title>The evidence behind Savant | Savant</title>')
  .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="The research behind Savant\'s main ideas: placement, mastery, retrieval, spaced review, mixed practice, feedback, personal tutoring and games, with the studies that back them.">');
const foot = privacy.slice(privacy.indexOf('</main>') + '</main>'.length).replace(' aria-current="page"', '');

const body = `<main id="main" class="wrap">
  <article class="doc evidence">
    <h1>The evidence behind Savant</h1>
    <p class="lede">Savant's main ideas draw on learning research. Here they are in plain words, with some of the best-known studies behind each one. This is published research that informs Savant, not results from Savant itself.</p>
    <p class="ev-behind"><strong>This is only a small part of our research.</strong> Behind this page is a fuller review of the mechanisms in Savant, with many more sources than are shown here. That fuller review stays private until Savant launches.</p>

    <section class="ev-how" id="how-it-works" aria-labelledby="how-it-works-title">
      <h2 id="how-it-works-title">How it works</h2>
      <p>Savant does not teach everyone the same lesson. It learns the learner, then rebuilds the material around them. At a high level:</p>
      <ol class="steps">
        <li>
          <span class="step-n" aria-hidden="true">1</span>
          <h3>A model of the learner</h3>
          <p>Savant measures where you are and keeps learning from your answers: how you study, think, learn and remember, plus what you like and dislike.</p>
        </li>
        <li>
          <span class="step-n" aria-hidden="true">2</span>
          <h3>A personal learning spec</h3>
          <p>That model is turned into a spec for you: where to start, what to skip, which mistakes to fix first, which examples to use and what pace to keep.</p>
        </li>
        <li>
          <span class="step-n" aria-hidden="true">3</span>
          <h3>Material rebuilt, then checked</h3>
          <p>Lessons, levels and tests are rebuilt to your spec, and each claim goes through an accuracy check against sources before you see it.</p>
        </li>
        <li>
          <span class="step-n" aria-hidden="true">4</span>
          <h3>Review timed to memory</h3>
          <p>Each skill is scheduled to come back when you are likely to start forgetting it, sooner if it is slipping, later if it is solid.</p>
        </li>
      </ol>
      <p class="ev-private">This is the idea at a high level, not the full method.</p>
    </section>

    <h2 class="ev-h-pillars" id="research">The research behind it</h2>

    <ol class="ev-pillars">
${PILLARS.map((p) => `      <li class="ev-pillar">
        <h2>${esc(p.title)}</h2>
        <p>${esc(p.text)}</p>
        <p class="ev-cite">${p.refs.map((r) => `<a class="ref" href="#src-${num(r)}">[${num(r)}]</a>`).join(' ')}</p>
      </li>`).join('\n')}
    </ol>

    <p class="ev-limit"><strong>What research can and cannot show.</strong> Research tells us which methods work. Whether Savant puts them together in the best way for each person is something we measure with real learners, which is what the beta is for.</p>

    <h2 id="sources">Sources</h2>
    <ol class="ev-sources">
${order.map((r) => `      <li id="src-${num(r)}">${esc(S[r][0])} <a href="${esc(S[r][1])}" rel="noopener" target="_blank">Read it</a></li>`).join('\n')}
    </ol>
  </article>
</main>`;

fs.writeFileSync(OUT, head + body + foot);
console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${PILLARS.length} pillars, ${order.length} sources`);
