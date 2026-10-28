# Spanish section plan

The plan for the Duolingo-style Spanish section, copied on 2026-10-20 from `C:\coding\duolingo clone\replica`.
Paths inside these files that start with `replica/` refer to that folder.

| File | What it is |
| --- | --- |
| `architecture.md` | Stack, where the code lives, API, build order (milestones 1-8) |
| `recon.md` | Screen-by-screen map of Duolingo (screen ids S01...) |
| `features.csv` | Feature list with must/should/could priority |
| `schema.sql` | SQLite schema for content and learner state (`es_*` tables) |
| `level-types.md` | Every level type in `data/Spanish_Fluency_Path.csv` and the page that plays it |
| `design/` | Components spec, contrast checker and report, CSS tokens (`config/spanish/tokens.json` is the source) |

Left in the replica folder: the Duolingo reference screenshots (`replica/screens/`, Duolingo's images) and the
lab screenshots (`replica/lab-screens/`, rebuild with `node scripts/spanish/lab-screenshots.mjs <outDir>`).

## Where the build stands (2026-10-20)
- Built: the lab (`/spanish/lab`) with every level type playable on sample content, voice (Gemini TTS, MiMo
  ASR), AI conversation, writing and recording feedback, the design page. Code: `routes/spanish/`,
  `services/spanish/`, `public/spanish/`, `config/spanish/`, `scripts/spanish/`.
- Not built: milestone 1 onward. No `data/spanish.sqlite`, no path, onboarding, sessions, XP or streaks yet.
