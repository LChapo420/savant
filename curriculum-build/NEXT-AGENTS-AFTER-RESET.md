# Agents to launch at the 00:40 UTC usage reset (owner's requests, 2026-10-23)

Launch all three as Opus, high effort, in the background. The NVIDIA lineup agent may still be running:
it owns `services/providers/index.js`, `services/ai.js`, `services/fact-cascade.js` and
`services/grading.js`, so the others must not edit those files.

## 1. Local and free "optimal system" (research, install, benchmark)

**Owner's words:** "run any local app or model or thing that will make our free system faster and
stronger so we're least likely to need to use the anthropic key, and do as much research and think as
hard as you can to make the most optimal system that takes advantage of my laptop for local stuff and
all the free APIs we have so that we can build a majority of this site to a perfect MVP with no false
information, and a system that optimizes everything to each user perfectly across every single subject."

The owner approves downloads and installs for this.

**Hardware**
- Ryzen 9 6900HS (8 cores, 16 threads)
- 31 GB RAM; the owner allows 20 GB
- RTX 3050 Laptop GPU with 4 GB VRAM
- 554 GB free on C:

**Already installed**
- Ollama, with its server running on 127.0.0.1:11434
- llama.cpp `llama-server`, Docker, Python 3.11 and ffmpeg
- The local fact checkers in `tools/fact-checkers` (`fact-venv`, torch cu126): FactCG, MiniCheck,
  Granite Guardian and HalluGuard

**Local models**
- qwen3.8:27b (17 GB), qwen-fast (17 GB), qwen2.5-coder:32b (19 GB)
- Llama-3.1-8B, Qwen3.8-27B "abliterated" and gpt-oss "derestricted". Do not use the abliterated or
  derestricted models for anything learners see; this is a kids' education app.

**Free APIs**
- NVIDIA build (key `NVIDIA_API_KEY` in `folderThing/.env`): nemotron-3.5-lightning, nemotron-3-ultra,
  glm-5.3-flash, glm-5.3, deepseek-v4.1-flash
- Jev on OpenRouter, $0.13 left in total, through its ledger
- Anthropic key as the last resort

**Do**
1. **Research** (with sources) the best local stack for this hardware:
   - which small and medium models (Qwen3.x 4B/8B, Phi, Gemma and so on, quantised) fit the 4 GB GPU
     plus RAM offload, and their speed
   - a local embedding model and reranker
   - **offline fact sources**: a Kiwix Wikipedia ZIM, Wikidata or Wiktionary, used for retrieval
     instead of Claude web search when building fact pools, which is a big cost lever (check licences)
   - optionally a free self-hosted metasearch such as SearXNG; check search engines' terms
   - local speculative or batched decoding, and caching
2. **Install** the chosen models and tools. Use official sources only: the Ollama library, llama.cpp,
   Hugging Face official org repos. State each download's name, source and size in the report.
3. **Build `services/providers/ollama.js`** (local provider: OpenAI-compatible or Ollama API, structured
   JSON, timeouts, GPU/RAM limits) and `scripts/local-model-eval.js`. Benchmark the local candidates
   against the NVIDIA models on the same labelled tasks as `scripts/model-lineup-eval.js`, once it
   exists; coordinate with it rather than duplicating.
4. **Write `curriculum-build/OPTIMAL-FREE-SYSTEM.md`:** the full architecture.
   - Which tier (local, NVIDIA, Jev, Claude) does each task in the app and the build pipeline, and why.
   - Retrieval-grounded fact checking against offline sources.
   - Verification layers so nothing false ships.
   - Caching and sharing verified lessons.
   - How per-user optimisation across all subjects uses this stack.
   - Expected Anthropic-key use before and after.
   - **Do not edit** `providers/index.js`, `ai.js`, `fact-cascade.js` or `grading.js`. Give exact
     integration steps instead; the lead integrates after the lineup agent finishes.

**Rules:** no paid calls (NVIDIA is free; Jev only through its ledger; no Anthropic); back up before
editing; never touch `data/db.json`; no commits; shell text in script files; never print keys.

## 2. Mechanics research for basketball, piano and chess (legal, from public sources only)

**Owner's words:** reverse engineer the good mechanics of HomeCourt, Simply Piano, chess apps and
similar to build a perfect education system for basketball, piano and chess, running locally and free
instead of calling APIs for tracking, sound or chess.

**Rules:** do NOT decompile, download, extract or copy any app's code, ML models, assets or content.
That would be a copyright and terms violation. Use only public sources: app store listings, official
help docs and blogs, demo videos, published papers and patents (to understand, not copy), and reviews.
Then design original implementations with open, free, local tech.

**Do**
1. **Write a mechanics and feature matrix** for each of these, with sources:
   - Basketball: HomeCourt, ShotTracker, Hoop Coach and similar.
   - Piano: Simply Piano, Yousician, Flowkey, Skoove, Synthesia.
   - Chess: Chess.com lessons and puzzles, Lichess, ChessKid, Chessable (MoveTrainer, spaced repetition).
2. **Map each mechanic** to what Savant already has: `public/engine/basketball` (tracking, court,
   camera blocks, demo-sim), `public/engine/piano` (piano-core, piano-io with MIDI), `public/engine/chess`
   (board, chess-core, chess-solver), plus `content/*-items.js`. List what's missing.
3. **Propose local, free implementations**, checking licences:
   - Pose and ball tracking in the browser with MediaPipe Tasks (Apache-2.0) or YOLO/ONNX via
     WebGPU/WASM.
   - Pitch and polyphonic note detection, e.g. Spotify basic-pitch (Apache-2.0) in TF.js/ONNX, or
     YIN/MPM for single notes, with latency targets.
   - Chess: the existing solver vs Stockfish WASM (GPL-3.0, check what that means for us) or another
     permissive engine; the Lichess puzzle DB (CC0); opening data.
   - Include accuracy and latency evidence.
4. **Write `curriculum-build/SKILL-APPS-MECHANICS.md`** with a prioritised build plan per subject: which
   mechanics most improve learning, and how we verify them (test videos, recordings, positions).
   Research and plan only; no build yet. Note anything needing the owner's decision, such as GPL.

## 3. Scorecard continuous research and improvement

**Owner's words:** "keep researching and getting a better and better understanding on how to make this
scorecard absolutely perfect, so when we modify the curriculum and level content to a user each level
is in the way that educates the user best with the highest understanding and retention rate of that
material in the most efficient way possible, and keep bettering and bettering this scorecard."

**Read:** `SCORECARD-RESEARCH-2026-10-22.md`, `scorecard-sim/BASELINE.md` (steps 1–22) and
`docs/SCORECARD.md`.

**Do:** research the evidence further, with sources, and make more measured improvements with
`scripts/scorecard-recovery-sim.js`. Keep a change only if it improves the targets with no
regressions.

**Leave as proposals with measured gains** (product-visible, owner hasn't approved):
- tapping confidence more often
- more experiments
- FSRS-style review scheduling
- a reading-level channel

**Rules:** avoid the lineup agent's files; no model calls; DB copies only; backups; no commits.
