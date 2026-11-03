/**
 * Synthetic fixtures for the upload-format matrix (scripts/materials-formats-test.js, scripts/uploads-proof.js).
 *
 * One authored document per topic (Markdown below) with PLANTED key points: each has an author-intended emphasis level
 * (1 taught, nothing stressed it ... 5 stressed by several signals). Every renderer here writes the same document in a
 * different format, so extraction can be scored against the same planted points. Nothing is a real learner's data; the
 * text is original, general-knowledge prose. Renderers are hand-built (jszip, a small PDF writer, a small OLE writer, sharp for
 * pictures), so the fixtures do not depend on Word, LibreOffice or Google.
 *
 * A caveat that the docs repeat: the files are written by this code, not by Word or Google Docs, so a format's real-world
 * quirks are only covered where a fixture says so.
 */
const JSZip = require('jszip');
const sharp = require('sharp');

// ── The authored documents ────────────────────────────────────────────────────────────────────────────
const TIDES_MD = `# Ocean Tides

## What you will learn

- Explain what causes the two daily tidal bulges.
- Describe the difference between spring tides and neap tides.
- Calculate the tidal range from high and low water heights.

## Why the ocean rises and falls

Water in the ocean is pulled by gravity, and the pull is stronger on the side of Earth that faces the Moon.

> Tides are caused mainly by the gravitational pull of the Moon, with a smaller contribution from the Sun.

Expect an exam question on this.

**A tidal bulge on the far side of Earth forms because Earth is pulled away from the water there.**

Because Earth turns beneath these two bulges, the water level at a coast rises and falls twice a day.

> Most coasts have two high tides and two low tides every lunar day of about 24 hours and 50 minutes.

Sailors use tide tables to plan when to enter shallow harbours. Salt marshes depend on the regular flooding and draining caused by the tides. The Mediterranean Sea has very small tides because it is almost enclosed.

## Words for the water level

**Flood tide** is the rising water and **ebb tide** is the falling water.

**Slack water is the short time at high or low tide when the water is neither rising nor falling.**

## Spring tides and neap tides

> Spring tides happen at new moon and full moon, when the Sun, Earth and Moon line up.

This is the part that examiners always test.

> Neap tides happen at the first and third quarter moons, when the Sun and Moon pull at right angles.

## Measuring tidal range

**The tidal range is the difference in height between high water and the next low water.**

For example, with a high water of 4.5 m and a low water of 1.2 m, the range is 4.5 m minus 1.2 m, which is 3.3 m.

**Tidal range is largest in narrow funnel-shaped bays such as the Bay of Fundy**, where it can pass fifteen metres.

## Practice

Exercise 1: The high water height is 4.5 m and the low water height is 1.2 m. What is the tidal range?

Exercise 2: Why is the tidal range so large in the Bay of Fundy?

Exercise 3: What do we call the short time at high or low tide when the water neither rises nor falls?

## Summary

- Tides are caused mainly by the Moon's pull, with a smaller contribution from the Sun.
- Spring tides come at new moon and full moon, when the Sun, Earth and Moon line up.
- Neap tides come at the first and third quarter moons, when the Sun and Moon pull at right angles.
- Most coasts have two high tides and two low tides every lunar day.
`;

const TIDES_KPS = [
  { id: 'k1', level: 5, text: 'Tides are caused mainly by the gravitational pull of the Moon, with a smaller contribution from the Sun.' },
  { id: 'k3', level: 5, text: 'Spring tides happen at new moon and full moon, when the Sun, Earth and Moon line up.' },
  { id: 'k2', level: 4, text: 'Most coasts have two high tides and two low tides every lunar day of about 24 hours and 50 minutes.' },
  { id: 'k4', level: 4, text: 'Neap tides happen at the first and third quarter moons, when the Sun and Moon pull at right angles.' },
  { id: 'k5', level: 3, text: 'The tidal range is the difference in height between high water and the next low water.' },
  { id: 'k6', level: 3, text: 'Tidal range is largest in narrow funnel-shaped bays such as the Bay of Fundy, where it can pass fifteen metres.' },
  { id: 'k12', level: 3, text: 'Slack water is the short time at high or low tide when the water is neither rising nor falling.' },
  { id: 'k7', level: 2, text: 'A tidal bulge on the far side of Earth forms because Earth is pulled away from the water there.' },
  { id: 'k8', level: 2, text: 'Flood tide is the rising water and ebb tide is the falling water.' },
  { id: 'k9', level: 1, text: 'Sailors use tide tables to plan when to enter shallow harbours.' },
  { id: 'k10', level: 1, text: 'Salt marshes depend on the regular flooding and draining caused by the tides.' },
  { id: 'k11', level: 1, text: 'The Mediterranean Sea has very small tides because it is almost enclosed.' },
];

// A second document in a different voice, written after the extractor, never tuned against: the held-out set.
const VACCINE_MD = `# How Vaccines Train the Immune System

## Learning goals

- Describe how a vaccine prepares the body for a real infection.
- Explain why some vaccines need booster doses.

## Antigens and antibodies

An antigen is a molecule that the immune system recognises as foreign. Antibodies are proteins that attach to one specific antigen and mark it for destruction.

> **Key idea:** A vaccine shows the immune system a harmless version of an antigen so that it can respond faster to the real one.

Don't forget that the first meeting with an antigen is slow, while later meetings are much faster.

Memory cells stay in the body for years and let the immune system answer a repeated infection within days.

## Kinds of vaccine

Live attenuated vaccines contain a weakened form of the germ. Inactivated vaccines contain a germ that has been killed. Messenger RNA vaccines carry instructions that let our own cells build a harmless piece of the germ.

**Inactivated vaccines usually need booster doses because they produce a weaker memory response.**

Make sure you can explain why boosters are needed. This will be tested.

## Herd protection

When most people in a community are immune, the germ struggles to find new hosts, and even unvaccinated people are less likely to meet it.

> **Important:** Herd protection depends on a high share of the community being immune, not on any single person.

Babies too young to be vaccinated are protected mainly by the immunity of the people around them.

## Check your understanding

Question 1: Why does a second dose of an inactivated vaccine strengthen the response?

Question 2: What is the job of an antibody?

Question 3: Why are babies too young to be vaccinated still protected in a community with high immunity?

## To sum up

- A vaccine shows the immune system a harmless version of an antigen so that it can respond faster to the real one.
- Inactivated vaccines usually need booster doses.
- Herd protection depends on a high share of the community being immune.
`;

const VACCINE_KPS = [
  { id: 'h1', level: 5, text: 'A vaccine shows the immune system a harmless version of an antigen so that it can respond faster to the real one.' },
  { id: 'h2', level: 5, text: 'Inactivated vaccines usually need booster doses because they produce a weaker memory response.' },
  { id: 'h3', level: 4, text: 'Herd protection depends on a high share of the community being immune, not on any single person.' },
  { id: 'h4', level: 3, text: 'Antibodies are proteins that attach to one specific antigen and mark it for destruction.' },
  { id: 'h5', level: 3, text: "Don't forget that the first meeting with an antigen is slow, while later meetings are much faster." },
  { id: 'h6', level: 3, text: 'Babies too young to be vaccinated are protected mainly by the immunity of the people around them.' },
  { id: 'h7', level: 2, text: 'An antigen is a molecule that the immune system recognises as foreign.' },
  { id: 'h8', level: 1, text: 'Memory cells stay in the body for years and let the immune system answer a repeated infection within days.' },
  { id: 'h9', level: 1, text: 'Live attenuated vaccines contain a weakened form of the germ.' },
  { id: 'h10', level: 1, text: 'Messenger RNA vaccines carry instructions that let our own cells build a harmless piece of the germ.' },
];

// The tides lecture as it would be spoken: the same ideas, with spoken emphasis. Levels are the lecturer's intent.
const LECTURE = [
  { say: 'Welcome back. Today we are talking about ocean tides, and I want to get the big ideas straight.' },
  { say: 'Tides are caused mainly by the gravitational pull of the Moon, with a smaller contribution from the Sun.', kp: { id: 's1', level: 5 } },
  { say: 'I will say that again, because it is the single most important idea today.' },
  { say: 'Tides are caused mainly by the gravitational pull of the Moon, with a smaller contribution from the Sun.' },
  { say: 'This will be on the exam, so write it down.' },
  { say: 'Most coasts have two high tides and two low tides every lunar day of about twenty four hours and fifty minutes.', kp: { id: 's2', level: 3 } },
  { say: 'Remember that, because it explains why the times shift every day.' },
  { say: 'Next, spring tides happen at new moon and full moon, when the Sun, Earth and Moon line up.', kp: { id: 's3', level: 4 } },
  { say: 'Pay attention to this one, it comes up in every problem set.' },
  { say: 'Neap tides happen at the first and third quarter moons, when the Sun and Moon pull at right angles.', kp: { id: 's4', level: 3 } },
  { say: 'Make sure you can tell spring tides from neap tides.' },
  { say: 'Now a definition. The tidal range is the difference in height between high water and the next low water.', kp: { id: 's5', level: 2 } },
  { say: 'Note that tidal range is largest in narrow funnel shaped bays such as the Bay of Fundy.', kp: { id: 's6', level: 2 } },
  { say: 'Sailors use tide tables to plan when to enter shallow harbours.', kp: { id: 's7', level: 1 } },
  { say: 'Salt marshes depend on the regular flooding and draining caused by the tides.', kp: { id: 's8', level: 1 } },
  { say: 'The Mediterranean Sea has very small tides because it is almost enclosed.', kp: { id: 's9', level: 1 } },
  { say: 'That is all for today. Think about spring tides and neap tides before next time.' },
];
const LECTURE_KPS = LECTURE.filter((l) => l.kp).map((l) => ({ id: l.kp.id, level: l.kp.level, text: l.say.replace(/^(Next, |Note that |Now a definition\. )/, '').replace(/^(\w)/, (c) => c.toUpperCase()) }));

const DOCS = {
  tides: { id: 'tides', title: 'Ocean Tides', md: TIDES_MD, kps: TIDES_KPS },
  vaccines: { id: 'vaccines', title: 'How Vaccines Train the Immune System', md: VACCINE_MD, kps: VACCINE_KPS, heldOut: true },
};

// ── Markdown to blocks ─────────────────────────────────────────────────────────────────────────────────
function runsOf(line) {
  const out = [];
  let last = 0;
  for (const m of line.matchAll(/\*\*([^*]+)\*\*/g)) {
    if (m.index > last) out.push({ t: line.slice(last, m.index), b: false });
    out.push({ t: m[1], b: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ t: line.slice(last), b: false });
  return out;
}
/** [{ k: 'h'|'p'|'box'|'li', l, runs }] */
function blocksOf(md) {
  const out = [];
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) out.push({ k: 'h', l: m[1].length, runs: [{ t: m[2], b: false }] });
    else if (/^>\s?/.test(line)) out.push({ k: 'box', runs: runsOf(line.replace(/^>\s?/, '')) });
    else if (/^[-*]\s+/.test(line)) out.push({ k: 'li', runs: runsOf(line.replace(/^[-*]\s+/, '')) });
    else out.push({ k: 'p', runs: runsOf(line) });
  }
  return out;
}
const plainRuns = (b) => b.runs.map((r) => r.t).join('');
const stripMd = (md) => md.replace(/\*\*([^*]+)\*\*/g, '$1');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Plain text families ─────────────────────────────────────────────────────────────────────────────────
const md = (doc) => Buffer.from(doc.md, 'utf8');
const txt = (doc) => Buffer.from(blocksOf(doc.md).map((b) => (b.k === 'h' ? `\n${plainRuns(b).toUpperCase()}\n` : b.k === 'li' ? `- ${plainRuns(b)}` : plainRuns(b))).join('\n'), 'utf8');
const csv = (doc) => Buffer.from(`statement,section\n${blocksOf(doc.md).filter((b) => b.k !== 'h').map((b) => `"${plainRuns(b).replace(/"/g, '""')}",notes`).join('\n')}\n`, 'utf8');

function htmlBody(doc) {
  const inline = (b) => b.runs.map((r) => (r.b ? `<strong>${esc(r.t)}</strong>` : esc(r.t))).join('');
  const out = []; let list = false;
  for (const b of blocksOf(doc.md)) {
    if (b.k !== 'li' && list) { out.push('</ul>'); list = false; }
    if (b.k === 'h') out.push(`<h${b.l}>${esc(plainRuns(b))}</h${b.l}>`);
    else if (b.k === 'box') out.push(`<blockquote><p>${inline(b)}</p></blockquote>`);
    else if (b.k === 'li') { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(b)}</li>`); } else out.push(`<p>${inline(b)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}
const html = (doc) => Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>body{font:16px serif}</style><script>var x = "ignore me";</script></head><body><nav>Home | About | Contact us today</nav>\n${htmlBody(doc)}\n</body></html>`, 'utf8');

function tex(doc) {
  const inline = (b) => b.runs.map((r) => (r.b ? `\\textbf{${r.t}}` : r.t)).join('').replace(/%/g, '\\%');
  const out = ['\\documentclass{article}', '\\usepackage{amsmath}', `\\title{${doc.title}}`, '\\begin{document}', '\\maketitle', '% a comment that must not appear'];
  let list = false;
  for (const b of blocksOf(doc.md).slice(1)) {
    if (b.k !== 'li' && list) { out.push('\\end{itemize}'); list = false; }
    if (b.k === 'h') out.push(`\\${b.l === 2 ? 'section' : 'subsection'}{${plainRuns(b)}}`);
    else if (b.k === 'box') out.push(`\\begin{keypoint}${inline(b)}\\end{keypoint}`);
    else if (b.k === 'li') { if (!list) { out.push('\\begin{itemize}'); list = true; } out.push(`\\item ${inline(b)}`); } else out.push('', inline(b));
  }
  if (list) out.push('\\end{itemize}');
  out.push('\\end{document}');
  return Buffer.from(out.join('\n'), 'utf8');
}

function ipynb(doc) {
  const cells = []; let cur = [];
  const flush = () => { if (cur.length) cells.push({ cell_type: 'markdown', metadata: {}, source: cur.join('\n').split(/(?<=\n)/) }); cur = []; };
  for (const line of doc.md.split('\n')) { if (/^## /.test(line)) flush(); cur.push(line); }
  flush();
  cells.splice(1, 0, { cell_type: 'code', metadata: {}, execution_count: 1, outputs: [{ output_type: 'stream', name: 'stdout', text: ['3.3\n'] }], source: ['high = 4.5\n', 'low = 1.2\n', 'print(round(high - low, 1))'] });
  return Buffer.from(JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells }), 'utf8');
}

function srt(script, vtt) {
  let t = 0; const out = [];
  const stamp = (s) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60; const p = (n) => String(n).padStart(2, '0'); return `${p(h)}:${p(m)}:${p(Math.floor(r))}${vtt ? '.' : ','}${String(Math.round((r % 1) * 1000)).padStart(3, '0')}`; };
  script.forEach((l, i) => {
    const dur = Math.max(3, l.say.split(' ').length / 2.6);
    // Long cues are split in two, the way real captions are.
    const words = l.say.split(' '); const cut = Math.ceil(words.length / 2);
    const parts = words.length > 12 ? [words.slice(0, cut).join(' '), words.slice(cut).join(' ')] : [l.say];
    parts.forEach((p, j) => {
      const d = dur / parts.length;
      out.push(`${vtt ? '' : `${out.length + 1}\n`}${stamp(t)} --> ${stamp(t + d)}${vtt ? ' align:start' : ''}\n${vtt && j === 0 && i === 1 ? '<c>' : ''}${p}${vtt && j === 0 && i === 1 ? '</c>' : ''}`);
      t += d;
    });
    t += 3 + (i % 3) * 6; // pauses, so the 30 second merge has something to do
  });
  return Buffer.from(`${vtt ? 'WEBVTT\n\n' : ''}${out.join('\n\n')}\n`, 'utf8');
}

// ── Zip based documents ──────────────────────────────────────────────────────────────────────────────────
const zipBuf = async (files, opts = {}) => {
  const z = new JSZip();
  // `mimetype` must come first and be stored for OpenDocument and EPUB.
  for (const [name, data] of files) z.file(name, data, name === 'mimetype' ? { compression: 'STORE' } : {});
  return z.generateAsync({ type: 'nodebuffer', compression: opts.store ? 'STORE' : 'DEFLATE' });
};

async function docx(doc) {
  const p = (b) => {
    const style = b.k === 'h' ? `<w:pStyle w:val="Heading${b.l}"/>` : b.k === 'box' ? '<w:pStyle w:val="KeyPoint"/>' : '';
    const prefix = b.k === 'li' ? '• ' : '';
    const runs = b.runs.map((r, i) => `<w:r>${r.b ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc((i === 0 ? prefix : '') + r.t)}</w:t></w:r>`).join('');
    return `<w:p>${style ? `<w:pPr>${style}</w:pPr>` : ''}${runs}</w:p>`;
  };
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${[['Heading1', 'heading 1'], ['Heading2', 'heading 2'], ['Heading3', 'heading 3'], ['KeyPoint', 'Key Point']].map(([id, name]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`).join('')}</w:styles>`;
  return zipBuf([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['word/styles.xml', styles],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${blocksOf(doc.md).map(p).join('')}</w:body></w:document>`],
  ]);
}

async function odt(doc) {
  const body = blocksOf(doc.md).map((b) => {
    const inner = b.runs.map((r) => (r.b ? `<text:span text:style-name="T1">${esc(r.t)}</text:span>` : esc(r.t))).join('');
    if (b.k === 'h') return `<text:h text:style-name="Heading_20_${b.l}" text:outline-level="${b.l}">${inner}</text:h>`;
    if (b.k === 'box') return `<text:p text:style-name="Quotations">${inner}</text:p>`;
    return `<text:p text:style-name="Standard">${b.k === 'li' ? '• ' : ''}${inner}</text:p>`;
  }).join('');
  return zipBuf([
    ['mimetype', 'application/vnd.oasis.opendocument.text'],
    ['META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'],
    ['content.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"><office:automatic-styles><style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`],
  ]);
}

/** Slides: one per level-2 section (the title slide first); a box becomes a "KEY POINT:" bullet, and spoken cues go in the notes. */
function slidesOf(doc) {
  const slides = []; let cur = null;
  for (const b of blocksOf(doc.md)) {
    if (b.k === 'h') { cur = { title: plainRuns(b), items: [], notes: [] }; slides.push(cur); continue; }
    if (!cur) continue;
    const text = plainRuns(b);
    const isCue = /^(Expect an exam question|This is the part that examiners|Make sure you can explain why boosters)/.test(text);
    if (isCue) { cur.notes.push(text); continue; }
    cur.items.push({ runs: b.k === 'box' ? [{ t: 'KEY POINT: ', b: true }, ...b.runs.map((r) => ({ ...r, b: false }))] : b.runs, text: b.k === 'box' ? `KEY POINT: ${text}` : text });
  }
  return slides;
}

async function pptx(doc) {
  const slides = slidesOf(doc);
  const para = (runs) => `<a:p>${runs.map((r) => `<a:r><a:rPr lang="en-US"${r.b ? ' b="1"' : ''}/><a:t>${esc(r.t)}</a:t></a:r>`).join('')}</a:p>`;
  const sp = (paras) => `<p:sp><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>`;
  const wrap = (inner) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>${inner}</p:spTree></p:cSld></p:sld>`;
  const files = [['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>']];
  slides.forEach((s, i) => {
    files.push([`ppt/slides/slide${i + 1}.xml`, wrap(sp(para([{ t: s.title, b: false }])) + sp(s.items.map((it) => para(it.runs)).join(''))) ]);
    if (s.notes.length) files.push([`ppt/notesSlides/notesSlide${i + 1}.xml`, wrap(sp(s.notes.map((n) => para([{ t: n, b: false }])).join('')) + sp(para([{ t: String(i + 1), b: false }])))]);
  });
  return zipBuf(files);
}

async function odp(doc) {
  const slides = slidesOf(doc);
  const pg = slides.map((s, i) => `<draw:page draw:name="page${i + 1}"><draw:frame presentation:class="title"><draw:text-box><text:p>${esc(s.title)}</text:p></draw:text-box></draw:frame><draw:frame presentation:class="outline"><draw:text-box>${s.items.map((it) => `<text:p>${it.runs.map((r) => (r.b ? `<text:span text:style-name="T1">${esc(r.t)}</text:span>` : esc(r.t))).join('')}</text:p>`).join('')}</draw:text-box></draw:frame>${s.notes.length ? `<presentation:notes><draw:frame><draw:text-box>${s.notes.map((n) => `<text:p>${esc(n)}</text:p>`).join('')}</draw:text-box></draw:frame></presentation:notes>` : ''}</draw:page>`).join('');
  return zipBuf([
    ['mimetype', 'application/vnd.oasis.opendocument.presentation'],
    ['content.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"><office:automatic-styles><style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles><office:body><office:presentation>${pg}</office:presentation></office:body></office:document-content>`],
  ]);
}

async function ods(doc) {
  const rows = blocksOf(doc.md).filter((b) => b.k !== 'h').map((b) => `<table:table-row><table:table-cell office:value-type="string"><text:p>${esc(plainRuns(b))}</text:p></table:table-cell><table:table-cell office:value-type="string"><text:p>notes</text:p></table:table-cell></table:table-row>`).join('');
  return zipBuf([
    ['mimetype', 'application/vnd.oasis.opendocument.spreadsheet'],
    ['content.xml', `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"><office:body><office:spreadsheet><table:table table:name="Study notes">${rows}</table:table></office:spreadsheet></office:body></office:document-content>`],
  ]);
}

async function xlsx(doc) {
  const items = blocksOf(doc.md).filter((b) => b.k !== 'h').map((b) => plainRuns(b));
  const strings = [...items, 'notes', 'Study notes'];
  const rows = items.map((_, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="s"><v>${i}</v></c><c r="B${i + 1}" t="s"><v>${items.length}</v></c></row>`).join('');
  return zipBuf([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Study notes" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`],
  ]);
}

async function epub(doc) {
  const chapters = []; let cur = null;
  for (const b of blocksOf(doc.md)) { if (b.k === 'h' && b.l <= 2 && (b.l === 1 || cur === null || chapters.length < 2 || true)) { if (b.l === 1 || chapters.length === 0) { cur = [b]; chapters.push(cur); continue; } } cur.push(b); }
  const inline = (b) => b.runs.map((r) => (r.b ? `<strong>${esc(r.t)}</strong>` : esc(r.t))).join('');
  const x = (bs) => bs.map((b) => (b.k === 'h' ? `<h${b.l}>${esc(plainRuns(b))}</h${b.l}>` : b.k === 'box' ? `<blockquote><p>${inline(b)}</p></blockquote>` : b.k === 'li' ? `<p>- ${inline(b)}</p>` : `<p>${inline(b)}</p>`)).join('');
  const half = Math.ceil(chapters[0].length / 2);
  const parts = [chapters[0].slice(0, half), chapters[0].slice(half)];
  return zipBuf([
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ['OEBPS/content.opf', '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'],
    ...parts.map((bs, i) => [`OEBPS/ch${i + 1}.xhtml`, `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>c${i + 1}</title></head><body>${x(bs)}</body></html>`]),
  ]);
}

function rtf(doc) {
  const e = (s) => s.replace(/\\/g, '\\\\').replace(/[{}]/g, (c) => `\\${c}`).replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0)}?`);
  const body = blocksOf(doc.md).map((b) => (b.k === 'h' ? `{\\b\\fs${b.l === 1 ? 36 : 28} ${e(plainRuns(b))}}\\par` : `${b.runs.map((r) => (r.b ? `{\\b ${e(r.t)}}` : e(r.t))).join('')}\\par`)).join('\n');
  return Buffer.from(`{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}\\f0\\fs22 ${body}}`, 'latin1');
}

// ── Legacy .doc: a minimal OLE compound file with a real piece table ────────────────────────────────────────
function doc97(doc) {
  const text = blocksOf(doc.md).map((b) => plainRuns(b)).join('\r') + '\r';
  const ascii = Buffer.from(text.replace(/[^\x00-\xff]/g, '?'), 'latin1');
  const TEXT_AT = 0x800;
  const wdLen = Math.max(4096, Math.ceil((TEXT_AT + ascii.length) / 512) * 512);
  const wd = Buffer.alloc(wdLen);
  wd.writeUInt16LE(0xa5ec, 0); wd.writeUInt16LE(0x00c1, 2); wd.writeUInt16LE(0x0200, 10);
  wd.writeUInt32LE(ascii.length, 76);
  wd.writeUInt32LE(0, 0x1a2); wd.writeUInt32LE(16 + 1, 0x1a6);
  ascii.copy(wd, TEXT_AT);
  const tbl = Buffer.alloc(4096);
  tbl[0] = 0x02; tbl.writeUInt32LE(16, 1);
  tbl.writeUInt32LE(0, 5); tbl.writeUInt32LE(ascii.length, 9);
  tbl.writeUInt16LE(0, 13); tbl.writeUInt32LE(((TEXT_AT * 2) | 0x40000000) >>> 0, 15); tbl.writeUInt16LE(0, 19);
  wd.writeUInt32LE(0, 0x1a2);
  // The Clx is at the start of the table stream: Pcdt prefix (1 byte) + lcb (4) + PlcPcd (16).
  wd.writeUInt32LE(21, 0x1a6);
  const wdSecs = wdLen / 512; const tSecs = tbl.length / 512;
  const nSectors = 2 + wdSecs + tSecs; // FAT, directory, streams
  const fat = Buffer.alloc(512, 0xff);
  fat.writeUInt32LE(0xfffffffd, 0); fat.writeUInt32LE(0xfffffffe, 4);
  const chain = (from, n) => { for (let i = 0; i < n; i++) fat.writeUInt32LE(i === n - 1 ? 0xfffffffe : from + i + 1, (from + i) * 4); };
  chain(2, wdSecs); chain(2 + wdSecs, tSecs);
  if (nSectors > 128) throw new Error('fixture too large for one FAT sector');
  const hdr = Buffer.alloc(512, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(hdr, 0);
  hdr.writeUInt16LE(0x3e, 24); hdr.writeUInt16LE(3, 26); hdr.writeUInt16LE(0xfffe, 28); hdr.writeUInt16LE(9, 30); hdr.writeUInt16LE(6, 32);
  hdr.writeUInt32LE(1, 44); hdr.writeUInt32LE(1, 48); hdr.writeUInt32LE(4096, 56); hdr.writeUInt32LE(0xfffffffe, 60); hdr.writeUInt32LE(0xfffffffe, 68);
  for (let i = 0; i < 109; i++) hdr.writeUInt32LE(i === 0 ? 0 : 0xffffffff, 76 + i * 4);
  const dirEntry = (name, type, start, size, left, right, child) => {
    const e = Buffer.alloc(128, 0);
    const n = Buffer.from(`${name}\0`, 'utf16le'); n.copy(e, 0);
    e.writeUInt16LE(n.length, 64); e[66] = type; e[67] = 1;
    e.writeUInt32LE(left, 68); e.writeUInt32LE(right, 72); e.writeUInt32LE(child, 76);
    e.writeUInt32LE(start, 116); e.writeUInt32LE(size, 120);
    return e;
  };
  const NO = 0xffffffff;
  const dir = Buffer.concat([dirEntry('Root Entry', 5, 0xfffffffe, 0, NO, NO, 1), dirEntry('WordDocument', 2, 2, wdLen, NO, 2, NO), dirEntry('1Table', 2, 2 + wdSecs, tbl.length, NO, NO, NO), Buffer.alloc(128, 0)]);
  return Buffer.concat([hdr, fat, dir, wd, tbl]);
}

// ── PDF (text and scanned) ──────────────────────────────────────────────────────────────────────────────────
const wrap = (s, n) => { const out = []; let line = ''; for (const w of s.split(' ')) { if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; };
const winAnsi = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/•/g, '-').replace(/[^\x20-\xff]/g, '?');
const pdfEsc = (s) => winAnsi(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Typeset lines: [{ runs: [{ t, b }], size, gap }] (box -> "KEY POINT:" label; bullets with a dash). */
function typeset(doc) {
  const lines = [];
  for (const b of blocksOf(doc.md)) {
    if (b.k === 'h') { lines.push({ runs: [{ t: plainRuns(b), b: true }], size: b.l === 1 ? 22 : 15, gap: b.l === 1 ? 10 : 14 }); continue; }
    const runs = b.k === 'box' ? [{ t: 'KEY POINT: ', b: true }, ...b.runs.map((r) => ({ t: r.t, b: false }))] : b.k === 'li' ? [{ t: '- ', b: false }, ...b.runs] : b.runs;
    // Word-wrap on the plain text, then re-cut the runs to the wrapped lines.
    const plain = runs.map((r) => r.t).join('');
    const rows = wrap(plain, 92);
    let at = 0;
    rows.forEach((row, i) => {
      const start = plain.indexOf(row, at); const end = start + row.length; at = end;
      const cut = []; let pos = 0;
      for (const r of runs) { const s = Math.max(start, pos); const e = Math.min(end, pos + r.t.length); if (e > s) cut.push({ t: r.t.slice(s - pos, e - pos), b: r.b }); pos += r.t.length; }
      lines.push({ runs: cut.length ? cut : [{ t: row, b: false }], size: 11, gap: i === 0 ? 7 : 0 });
    });
  }
  return lines;
}

function pdfText(doc) {
  const lines = typeset(doc);
  const pages = []; let y = 740; let cur = [];
  for (const ln of lines) {
    const lead = ln.size + 4 + ln.gap;
    if (y - lead < 60) { pages.push(cur); cur = []; y = 740; }
    y -= lead; cur.push({ ...ln, y });
  }
  pages.push(cur);
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(`<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pages.forEach((pg, i) => {
    const stream = pg.map((ln) => `BT 60 ${ln.y} Td ${ln.runs.map((r) => `/${r.b ? 'F2' : 'F1'} ${ln.size} Tf (${pdfEsc(r.t)}) Tj`).join(' ')} ET`).join('\n');
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  });
  return assemblePdf(objs);
}

function assemblePdf(objs) {
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')]; const offsets = []; let pos = parts[0].length;
  objs.forEach((o, i) => { const b = Buffer.isBuffer(o) ? o : Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1'); offsets.push(pos); parts.push(b); pos += b.length; });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
}

// ── Pictures ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Lines of text as an SVG page. opts: { font, size, w, bg, ink, lineGap }
 */
function textSvg(lines, o = {}) {
  const size = o.size || 34; const gap = o.lineGap || Math.round(size * 1.5); const w = o.w || 1500; const h = (lines.length + 1.5) * gap;
  const body = lines.map((l, i) => `<text x="50" y="${gap * (i + 1)}" font-family="${o.font || 'Arial'}" font-size="${size}" font-weight="${l.b ? 'bold' : 'normal'}" fill="${o.ink || '#111'}">${esc(l.t || l)}</text>`).join('');
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.ceil(h)}"><rect width="100%" height="100%" fill="${o.bg || '#fff'}"/>${body}</svg>`, w, h: Math.ceil(h) };
}
/** The note card: the bullets of a document that carry its main points, one line each (wrapped to fit). */
function noteLines(doc, ids, width = 62) {
  const wanted = doc.kps.filter((k) => ids.includes(k.id));
  return wanted.flatMap((k, i) => wrap(`${i + 1}. ${k.text}`, width).map((t, j) => (j ? `    ${t}` : t)));
}
async function picture(doc, type, o = {}) {
  const ids = o.ids || doc.kps.filter((k) => k.level >= 3).map((k) => k.id);
  const { svg } = textSvg(noteLines(doc, ids, o.width || 62), { font: o.font, size: o.size || 34, bg: o.bg, ink: o.ink });
  let img = sharp(Buffer.from(svg), { density: 96 });
  if (o.photo) {
    // A phone photo of a page: a slight tilt, shading, blur and noise.
    const base = await img.png().toBuffer();
    const m = await sharp(base).metadata();
    img = sharp(base).rotate(o.photo.angle || 1.5, { background: '#d9d6cf' }).modulate({ brightness: 0.92 }).blur(o.photo.blur || 0.8)
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.28"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`), blend: 'over' }]);
  }
  if (o.maxWidth) img = img.resize({ width: o.maxWidth });
  if (type === 'png') return img.png().toBuffer();
  if (type === 'jpeg') return img.jpeg({ quality: o.quality || 82 }).toBuffer();
  if (type === 'webp') return img.webp({ quality: 80 }).toBuffer();
  if (type === 'gif') return img.gif().toBuffer();
  if (type === 'tiff') return img.tiff().toBuffer();
  if (type === 'bmp') {
    const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const row = Math.ceil((info.width * 3) / 4) * 4; const out = Buffer.alloc(54 + row * info.height);
    out.write('BM', 0); out.writeUInt32LE(out.length, 2); out.writeUInt32LE(54, 10); out.writeUInt32LE(40, 14); out.writeInt32LE(info.width, 18); out.writeInt32LE(info.height, 22);
    out.writeUInt16LE(1, 26); out.writeUInt16LE(24, 28); out.writeUInt32LE(row * info.height, 34);
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const s = (y * info.width + x) * info.channels; const d = 54 + (info.height - 1 - y) * row + x * 3; out[d] = data[s + 2]; out[d + 1] = data[s + 1]; out[d + 2] = data[s]; }
    return out;
  }
  throw new Error(`no such picture type ${type}`);
}

/** A PDF made only of page pictures (a scan): JPEG pages, no text layer. */
async function pdfScanned(doc, o = {}) {
  const lines = typeset(doc).map((l) => ({ t: l.runs.map((r) => r.t).join(''), b: l.runs.every((r) => r.b), size: l.size }));
  const per = 36; const chunks = [];
  for (let i = 0; i < lines.length; i += per) chunks.push(lines.slice(i, i + per));
  const pages = o.pages ? chunks.slice(0, o.pages) : chunks;
  const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  for (let i = 0; i < pages.length; i++) {
    const { svg } = textSvg(pages[i], { size: 36, w: 1275, lineGap: 52, font: 'Arial' });
    const jpg = await sharp(Buffer.from(svg), { density: 96 }).resize({ width: 1275, height: 1650, fit: 'contain', background: '#fff' }).greyscale().jpeg({ quality: 80 }).toBuffer();
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${5 + i * 3 - 1 + 0} 0 R >> >> /Contents ${4 + i * 3} 0 R >>`);
    // Object order per page: page, contents, image (page = 3+3i, contents = 4+3i, image = 5+3i).
    objs[objs.length - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 ${5 + i * 3} 0 R >> >> /Contents ${4 + i * 3} 0 R >>`;
    const stream = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const head = Buffer.from(`${objs.length + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width 1275 /Height 1650 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, 'latin1');
    objs.push(Buffer.concat([head, jpg, Buffer.from('\nendstream\nendobj\n', 'latin1')]));
  }
  return assemblePdf(objs);
}

/** A ZIP of mixed files: Markdown, a Word file, a CSV, a picture of notes, and one file type nothing reads. */
async function zipMixed(doc) {
  return zipBuf([
    ['notes/lesson.md', md(doc)],
    ['notes/lesson.docx', await docx(doc)],
    ['data/table.csv', csv(doc)],
    ['photos/card.png', await picture(doc, 'png', { ids: doc.kps.filter((k) => k.level >= 4).map((k) => k.id) })],
    ['misc/program.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00])],
    ['__MACOSX/._lesson.md', Buffer.from('junk')],
  ]);
}

const TEXT_FORMATS = { md, txt, csv, html, tex, ipynb, rtf, doc: doc97, pdf: pdfText };
const ZIP_FORMATS = { docx, odt, pptx, odp, ods, xlsx, epub };

/** Build one format of one document: resolves a Buffer. */
async function build(format, doc) {
  if (TEXT_FORMATS[format]) return TEXT_FORMATS[format](doc);
  if (ZIP_FORMATS[format]) return ZIP_FORMATS[format](doc);
  if (format === 'srt') return srt(LECTURE, false);
  if (format === 'vtt') return srt(LECTURE, true);
  if (format === 'zip') return zipMixed(doc);
  if (format === 'pdf-scan') return pdfScanned(doc, { pages: 2 });
  throw new Error(`no such format ${format}`);
}

const FORMAT_LIST = ['md', 'txt', 'csv', 'html', 'tex', 'ipynb', 'rtf', 'doc', 'pdf', 'docx', 'odt', 'pptx', 'odp', 'ods', 'xlsx', 'epub'];

module.exports = { DOCS, TIDES_KPS, VACCINE_KPS, LECTURE, LECTURE_KPS, build, picture, pdfScanned, zipMixed, srt, FORMAT_LIST, blocksOf, stripMd, wrap, textSvg, typeset };
