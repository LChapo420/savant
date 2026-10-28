# Evidence article: brief for section writers (2026-10-25)

The owner asked for one article that backs every mechanism and feature in Savant. Each one needs **at least 3 different credible sources**, and the article needs **over 200 sources** in total. Anything that several credible sources show would improve learning and is not yet built should be proposed so it can be implemented.

## Rules
- **Repo:** `C:\coding\claudecommittdIq\folderThing\iq-max-repo-2-claude-adoring-mayer-woc9sq`. Run node with `NODE_PATH=..\node_modules`.
- **Don't break anything:**
  - Make no commits.
  - Never touch `.env`, `data/db.json` or `data/parallel`.
  - Never stop the app on 6767.
  - Edit with the Edit or Write tools. Never use PowerShell `Get-Content`/`Set-Content` round trips, which corrupt UTF-8.
- **Write, don't build:** sections only write docs. Code changes come later, after review, so put improvement ideas in the proposals list.

## What counts as a source
- **Credible sources:** peer-reviewed papers, meta-analyses, official standards (CCSS, CEFR, FIBA, WCAG), or textbooks from academic publishers. Blogs, vendor marketing and AI-generated text never count.
- **Verify every source:** check the DOI resolves through doi.org or Crossref (`https://api.crossref.org/works/<doi>`), and that the title, first author and year match. For a standard, give its official URL.
- **Quote every claim:** give a verbatim quote under 25 words from the abstract or full text that supports the claim as written. Never overstate an effect, population or direction. If you can't get a quote, say "title-level only".
- **Reuse what's already verified before searching:**
  - `curriculum-build/scorecard-sources.json` (509)
  - `curriculum-build/retention-sources.json` (84 own plus 66 shared)
  - `curriculum-build/SCORECARD-CLAIM-CHECK-2026-10-25.md` (claim checks)
  - `curriculum-build/RETENTION-ENFORCER-EVIDENCE.md`
  - `curriculum-build/GRADE-FIT-STANDARDS.md`, if present
  - `curriculum-build/FACT-REVERIFY-2026-10-25.md`, if present

  Their entries are already DOI-verified. Re-verify a source only if you use it for a new claim.

## What to write
- **Find the mechanisms:** look through the code files in your area. A mechanism is any rule, threshold, ordering, timing, gate, adaptation or UI behaviour that affects learning.
- **For each mechanism:**
  1. Name it and give `file:line`.
  2. Say what it does, in plain words, with its numbers.
  3. Give the evidence: at least 3 sources, each with id, DOI or URL, a verbatim quote, and the population or setting it studied.
  4. Give a verdict, one of these:
     - **strong:** several converging studies or a meta-analysis;
     - **moderate**;
     - **mixed**: say what conflicts;
     - **design choice**: a reasoned value, with no study for the exact number. Still give 3 sources for the general principle.
  5. Say whether the code matches the evidence. If it doesn't, describe the gap.
- **Proposals list:** improvements supported by at least 3 credible sources that are not built yet. For each, give the sources, the expected effect, the risk, and the exact files it would touch.
- **New sources:** list them in a JSON file next to your section with the fields `id, doi, url, title, first_author, year, venue, verified:true, quote, used_for`.

## Output
- `curriculum-build/evidence-article/<NN>-<area>.md`
- `curriculum-build/evidence-article/<NN>-<area>-sources.json`, for new sources only

## Final report
Keep it short:
- mechanisms found;
- mechanisms with 3 or more sources;
- how many are strong, moderate, mixed or design choice;
- new sources verified;
- the proposals.

Be fast and token-efficient: batch your Crossref and OpenAlex lookups, and don't re-read big files.
