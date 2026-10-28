-- Spanish section schema ("Duolingo-style Spanish inside Polymath").
--
-- Engine: SQLite through Node's built-in `node:sqlite` (Node 24 on this machine),
-- file `data/spanish.sqlite`. No new npm dependency, no server to run.
-- Why not db.json: it is 129 MB, held in memory and rewritten whole every 250 ms;
-- per-answer writes from lessons would make that worse for the whole site.
-- Why not Postgres yet: the host plans Postgres in its Phase 5. This schema maps
-- 1:1 (TEXT ids -> uuid, ISO text times -> timestamptz, json TEXT -> jsonb).
--
-- Conventions
--   ids        TEXT. Content ids are readable and stable ('g01', 'u01.1', 'g01-l002').
--              Learner rows use crypto.randomUUID().
--   times      TEXT, ISO-8601 UTC ('2026-10-13T17:04:05.123Z'). Local calendar days
--              (streaks, quests) are stored separately as 'YYYY-MM-DD' in the learner's
--              own time zone.
--   json       TEXT with CHECK (json_valid(...)).
--   booleans   INTEGER 0/1 with CHECK.
--   users      live in the host's db.json (`users` collection). `user_id` here is
--              that id; it cannot be a foreign key across stores, so the data layer
--              checks ownership on every query and the account-deletion hook purges
--              every es_* row for the user (see architecture.md, "parts that bite").
--   access     data-layer checks: every learner query takes req.user.id and filters
--              on user_id; admin routes require the host's ADMIN_EMAILS check.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ───────────────────────── shared content (same for every learner) ─────────────────────────

CREATE TABLE es_characters (
  id          TEXT PRIMARY KEY,                 -- 'mara', 'tomas'
  name        TEXT NOT NULL,
  voice       TEXT NOT NULL,                    -- TTS voice id
  art_ref     TEXT,                             -- media hash of the portrait
  bio         TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE es_grades (
  id            TEXT PRIMARY KEY,               -- 'g01'..'g57'
  ord           INTEGER NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  cefr_band     TEXT NOT NULL,                  -- 'Pre-A1', 'A1.2', 'Track: C1+'
  lemma_target  INTEGER,                        -- from the grade heading; null for tracks
  track         TEXT CHECK (track IS NULL OR track IN
                  ('culture-history','literature','translation','linguistics','teaching')),
  heading       TEXT NOT NULL                   -- the CSV cell, verbatim
) STRICT;

CREATE TABLE es_units (
  id          TEXT PRIMARY KEY,                 -- 'u01.1', 'g01-entry', 'g01-wrap'
  grade_id    TEXT NOT NULL REFERENCES es_grades(id) ON DELETE CASCADE,
  ord         INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('entry','unit','wrap')),
  goal        TEXT NOT NULL DEFAULT '',         -- "I can ..."
  key_phrases TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(key_phrases)),
  optional    INTEGER NOT NULL DEFAULT 0 CHECK (optional IN (0,1)),
  colour      TEXT,
  guidebook   TEXT CHECK (guidebook IS NULL OR json_valid(guidebook)),
  UNIQUE (grade_id, ord)
) STRICT;
CREATE INDEX es_units_grade ON es_units(grade_id);

CREATE TABLE es_levels (
  id                   TEXT PRIMARY KEY,        -- 'g01-l002'
  grade_id             TEXT NOT NULL REFERENCES es_grades(id) ON DELETE CASCADE,
  unit_id              TEXT NOT NULL REFERENCES es_units(id) ON DELETE CASCADE,
  ord                  INTEGER NOT NULL,        -- CSV "Level #"
  level_type           TEXT NOT NULL,           -- CSV "Level Type" (22 values)
  activity             TEXT NOT NULL,           -- CSV "Activity"
  title                TEXT NOT NULL,           -- CSV "Node"
  skill_focus          TEXT NOT NULL,
  path                 TEXT NOT NULL,           -- 'Core', 'Optional unit', 'Domain: health', ...
  domain               TEXT,                    -- 'health' when path is a Domain elective
  what_happens         TEXT NOT NULL,
  est_min              INTEGER NOT NULL,
  engine               TEXT NOT NULL CHECK (engine IN (
                         'lesson','unit_intro','story','input_session','listening_lab',
                         'reading','reading_block','dictation','quick_game','fluency_sprint',
                         'conversation_lab','writing_lab','mediation','unit_check',
                         'checkpoint','final','entry_check','project','live_conversation',
                         'mission','review_game')),
  game                 TEXT CHECK (game IS NULL OR game IN
                         ('listen_tap','word_race','sentence_builder','fix_sentence',
                          'memory_pairs','speed_match')),
  gate_pct             INTEGER CHECK (gate_pct IS NULL OR gate_pct BETWEEN 1 AND 100),
  xp_reward            INTEGER NOT NULL DEFAULT 10,
  published_version_id TEXT,                    -- es_level_versions.id; null until published
  UNIQUE (grade_id, ord)
) STRICT;
CREATE INDEX es_levels_unit ON es_levels(unit_id, ord);
CREATE INDEX es_levels_engine ON es_levels(engine);

CREATE TABLE es_generation_runs (
  id           TEXT PRIMARY KEY,
  scope        TEXT NOT NULL CHECK (scope IN ('course','grade','unit','level','media','validate')),
  target       TEXT NOT NULL,                   -- 'g01', 'u01.1', 'g01-l002'
  model        TEXT NOT NULL,
  tokens_in    INTEGER NOT NULL DEFAULT 0,
  tokens_out   INTEGER NOT NULL DEFAULT 0,
  cost_cents   INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  error        TEXT,
  started_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at     TEXT
) STRICT;
CREATE INDEX es_runs_target ON es_generation_runs(target, started_at);

CREATE TABLE es_level_versions (
  id                 TEXT PRIMARY KEY,
  level_id           TEXT NOT NULL REFERENCES es_levels(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
                       ('draft','validated','rejected','published','retired')),
  content            TEXT NOT NULL CHECK (json_valid(content)),  -- engine-specific body; refers to item ids
  generation_run_id  TEXT REFERENCES es_generation_runs(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  published_at       TEXT,
  UNIQUE (level_id, version)
) STRICT;
CREATE INDEX es_versions_status ON es_level_versions(status);
-- At most one published version per level (the pointer on es_levels is the fast path).
CREATE UNIQUE INDEX es_versions_one_published ON es_level_versions(level_id) WHERE status = 'published';

CREATE TABLE es_validation_reports (
  id                TEXT PRIMARY KEY,
  level_version_id  TEXT NOT NULL REFERENCES es_level_versions(id) ON DELETE CASCADE,
  model             TEXT NOT NULL,
  scores            TEXT NOT NULL CHECK (json_valid(scores)),   -- quality, fit, answer_coverage, difficulty, ledger
  issues            TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(issues)),
  verdict           TEXT NOT NULL CHECK (verdict IN ('pass','regenerate','human_review')),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX es_reports_version ON es_validation_reports(level_version_id);
CREATE INDEX es_reports_verdict ON es_validation_reports(verdict);

-- The unit item bank: every gradable thing. Lessons list their item ids; games,
-- unit checks, checkpoints, finals and review sessions draw from the bank.
CREATE TABLE es_items (
  id                TEXT PRIMARY KEY,           -- stable; never reused
  unit_id           TEXT NOT NULL REFERENCES es_units(id) ON DELETE CASCADE,
  level_version_id  TEXT REFERENCES es_level_versions(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL CHECK (kind IN (
                      'select_image','match_pairs','select_meaning','word_bank','type_translation',
                      'tap_heard','type_heard','speak','fill_blank','complete_chat',
                      'mark_meaning','arrange','listen_choose','fix_sentence','dictation_line',
                      'comprehension')),
  skill             TEXT NOT NULL CHECK (skill IN ('listening','reading','speaking','writing','vocab','grammar','pronunciation')),
  payload           TEXT NOT NULL CHECK (json_valid(payload)),      -- prompt, choices, tiles, pairs, image ref, speaker
  accepted          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(accepted)),  -- every valid answer
  lexemes           TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(lexemes)),   -- lexeme ids exercised
  grammar_point     TEXT,
  audio_hash        TEXT,                       -- es_media.hash of the spoken prompt
  is_new_word       INTEGER NOT NULL DEFAULT 0 CHECK (is_new_word IN (0,1)),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX es_items_unit ON es_items(unit_id, status);
CREATE INDEX es_items_version ON es_items(level_version_id);

CREATE TABLE es_lexemes (
  id                   TEXT PRIMARY KEY,        -- 'hola', 'banco#bank', 'banco#bench'
  lemma                TEXT NOT NULL,
  pos                  TEXT NOT NULL,
  gloss_en             TEXT NOT NULL,
  introduced_level_id  TEXT REFERENCES es_levels(id) ON DELETE SET NULL,
  audio_hash           TEXT
) STRICT;
CREATE INDEX es_lexemes_lemma ON es_lexemes(lemma);
CREATE INDEX es_lexemes_intro ON es_lexemes(introduced_level_id);

CREATE TABLE es_grammar_points (
  id                   TEXT PRIMARY KEY,        -- 'present-ar', 'ser-vs-estar'
  title                TEXT NOT NULL,
  introduced_level_id  TEXT REFERENCES es_levels(id) ON DELETE SET NULL
) STRICT;

-- What each level introduces and reviews. Generation context and the validator read this.
CREATE TABLE es_ledger (
  level_id  TEXT NOT NULL REFERENCES es_levels(id) ON DELETE CASCADE,
  ref_kind  TEXT NOT NULL CHECK (ref_kind IN ('lexeme','grammar')),
  ref_id    TEXT NOT NULL,
  role      TEXT NOT NULL CHECK (role IN ('introduced','reviewed')),
  PRIMARY KEY (level_id, ref_kind, ref_id)
) STRICT;
CREATE INDEX es_ledger_ref ON es_ledger(ref_kind, ref_id);

CREATE TABLE es_media (
  hash         TEXT PRIMARY KEY,                -- sha256 of kind|voice|text (or prompt)
  kind         TEXT NOT NULL CHECK (kind IN ('audio','image')),
  source       TEXT NOT NULL,                   -- text spoken, or image prompt
  voice        TEXT,
  path         TEXT,                            -- relative path once rendered
  bytes        INTEGER,
  duration_ms  INTEGER,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX es_media_status ON es_media(status);

CREATE TABLE es_reading_texts (
  id            TEXT PRIMARY KEY,
  grade_id      TEXT NOT NULL REFERENCES es_grades(id) ON DELETE CASCADE,
  interest_tag  TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL CHECK (json_valid(body)),   -- sentences with glosses
  word_count    INTEGER NOT NULL,
  known_ratio   REAL NOT NULL CHECK (known_ratio BETWEEN 0 AND 1),
  audio_hash    TEXT
) STRICT;
CREATE INDEX es_reading_pick ON es_reading_texts(grade_id, interest_tag);

-- ───────────────────────── learner state ─────────────────────────

CREATE TABLE es_learners (
  user_id            TEXT PRIMARY KEY,          -- host users.id
  timezone           TEXT NOT NULL,             -- IANA, e.g. 'America/Chicago'
  daily_goal_xp      INTEGER NOT NULL DEFAULT 20 CHECK (daily_goal_xp IN (10,20,30,50)),
  motivation         TEXT,
  start_proficiency  INTEGER CHECK (start_proficiency BETWEEN 0 AND 4),
  interests          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(interests)),
  domains            TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(domains)),
  current_level_id   TEXT REFERENCES es_levels(id) ON DELETE SET NULL,
  xp_total           INTEGER NOT NULL DEFAULT 0 CHECK (xp_total >= 0),
  gems               INTEGER NOT NULL DEFAULT 0 CHECK (gems >= 0),
  hearts             INTEGER NOT NULL DEFAULT 5 CHECK (hearts BETWEEN 0 AND 5),
  hearts_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),  -- regen is computed from this
  prefs              TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(prefs)),           -- sfx, animations, listening, speaking, motivational
  public_profile     INTEGER NOT NULL DEFAULT 1 CHECK (public_profile IN (0,1)),
  onboarded_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE es_grade_progress (
  user_id         TEXT NOT NULL,
  grade_id        TEXT NOT NULL REFERENCES es_grades(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('locked','active','passed')),
  entry_done_at   TEXT,
  passed_at       TEXT,
  PRIMARY KEY (user_id, grade_id)
) STRICT;

CREATE TABLE es_level_progress (
  user_id       TEXT NOT NULL,
  level_id      TEXT NOT NULL REFERENCES es_levels(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('completed','placed_out','skipped_optional')),
  best_score    INTEGER CHECK (best_score BETWEEN 0 AND 100),
  attempts      INTEGER NOT NULL DEFAULT 0,
  version_id    TEXT,                           -- version last completed
  completed_at  TEXT,
  PRIMARY KEY (user_id, level_id)
) STRICT;
CREATE INDEX es_lp_user_time ON es_level_progress(user_id, completed_at);

CREATE TABLE es_sessions (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  client_session_id  TEXT NOT NULL,             -- idempotency: a retried "start" returns the same session
  level_id           TEXT REFERENCES es_levels(id) ON DELETE SET NULL,
  version_id         TEXT REFERENCES es_level_versions(id) ON DELETE SET NULL,  -- pinned at start
  kind               TEXT NOT NULL CHECK (kind IN
                       ('level','practice_mistakes','practice_review','practice_words',
                        'practice_speak','practice_listen','hearts_practice','placement','repair')),
  item_ids           TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(item_ids)),   -- the assembled queue
  status             TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN
                       ('in_progress','completed','failed','abandoned')),
  xp                 INTEGER NOT NULL DEFAULT 0,
  accuracy           INTEGER CHECK (accuracy BETWEEN 0 AND 100),
  mistakes           INTEGER NOT NULL DEFAULT 0,
  combo_max          INTEGER NOT NULL DEFAULT 0,
  hearts_lost        INTEGER NOT NULL DEFAULT 0,
  result             TEXT CHECK (result IS NULL OR json_valid(result)),  -- the finish payload, replayed on retry
  started_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at           TEXT,
  UNIQUE (user_id, client_session_id)
) STRICT;
CREATE INDEX es_sessions_user ON es_sessions(user_id, started_at);
CREATE INDEX es_sessions_level ON es_sessions(level_id);

CREATE TABLE es_answers (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES es_sessions(id) ON DELETE CASCADE,
  user_id           TEXT NOT NULL,
  client_answer_id  TEXT NOT NULL,
  item_id           TEXT NOT NULL REFERENCES es_items(id) ON DELETE CASCADE,
  response          TEXT NOT NULL CHECK (json_valid(response)),
  correct           INTEGER NOT NULL CHECK (correct IN (0,1)),
  skipped           INTEGER NOT NULL DEFAULT 0 CHECK (skipped IN (0,1)),
  note              TEXT,                       -- 'accent', 'typo' when accepted with a nudge
  ms                INTEGER,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (session_id, client_answer_id)
) STRICT;
CREATE INDEX es_answers_user_item ON es_answers(user_id, item_id);
CREATE INDEX es_answers_session ON es_answers(session_id);

-- Spaced-review queue (per learner, per item).
CREATE TABLE es_review_queue (
  user_id        TEXT NOT NULL,
  item_id        TEXT NOT NULL REFERENCES es_items(id) ON DELETE CASCADE,
  due_at         TEXT NOT NULL,
  interval_days  REAL NOT NULL DEFAULT 0,
  ease           REAL NOT NULL DEFAULT 2.5,
  reps           INTEGER NOT NULL DEFAULT 0,
  lapses         INTEGER NOT NULL DEFAULT 0,
  last_seen_at   TEXT,
  PRIMARY KEY (user_id, item_id)
) STRICT;
CREATE INDEX es_review_due ON es_review_queue(user_id, due_at);

CREATE TABLE es_weak_spots (
  user_id     TEXT NOT NULL,
  ref_kind    TEXT NOT NULL CHECK (ref_kind IN ('lexeme','grammar','sound')),
  ref_id      TEXT NOT NULL,
  score       REAL NOT NULL,                    -- higher = weaker
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, ref_kind, ref_id)
) STRICT;
CREATE INDEX es_weak_top ON es_weak_spots(user_id, score DESC);

CREATE TABLE es_error_log (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  session_id     TEXT REFERENCES es_sessions(id) ON DELETE SET NULL,
  item_id        TEXT REFERENCES es_items(id) ON DELETE SET NULL,
  tag            TEXT NOT NULL CHECK (tag IN
                   ('sound','spelling','accent','grammar','vocab','word_order','meaning','other')),
  learner_text   TEXT,
  expected_text  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX es_errors_user ON es_error_log(user_id, created_at);

CREATE TABLE es_gate_attempts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  level_id      TEXT NOT NULL REFERENCES es_levels(id) ON DELETE CASCADE,   -- checkpoint or final
  session_id    TEXT REFERENCES es_sessions(id) ON DELETE SET NULL,
  attempt_no    INTEGER NOT NULL,
  score         INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  passed        INTEGER NOT NULL CHECK (passed IN (0,1)),
  repair_items  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(repair_items)),
  repair_done   INTEGER NOT NULL DEFAULT 0 CHECK (repair_done IN (0,1)),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, level_id, attempt_no)
) STRICT;

-- Runtime-AI work: speech scoring, conversation labs, writing, projects, live excerpts, missions.
CREATE TABLE es_speech_attempts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  session_id   TEXT REFERENCES es_sessions(id) ON DELETE SET NULL,
  item_id      TEXT REFERENCES es_items(id) ON DELETE SET NULL,
  transcript   TEXT,
  target       TEXT NOT NULL,
  score        INTEGER CHECK (score BETWEEN 0 AND 100),
  words_per_min REAL,
  pause_ms     INTEGER,                         -- total long-pause time, measured on the client
  feedback     TEXT CHECK (feedback IS NULL OR json_valid(feedback)),
  cost_cents   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX es_speech_user ON es_speech_attempts(user_id, created_at);

CREATE TABLE es_conversations (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  level_id    TEXT NOT NULL REFERENCES es_levels(id) ON DELETE CASCADE,
  version_id  TEXT REFERENCES es_level_versions(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','ended','abandoned')),
  turns       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(turns)),     -- [{who, text, audio_hash, at}]
  outcome_met INTEGER CHECK (outcome_met IN (0,1)),
  rubric      TEXT CHECK (rubric IS NULL OR json_valid(rubric)),
  tokens      INTEGER NOT NULL DEFAULT 0,
  cost_cents  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ended_at    TEXT
) STRICT;
CREATE INDEX es_conv_user ON es_conversations(user_id, created_at);

CREATE TABLE es_submissions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  level_id    TEXT NOT NULL REFERENCES es_levels(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('writing','mediation','project','live','mission')),
  draft       TEXT,
  feedback    TEXT CHECK (feedback IS NULL OR json_valid(feedback)),     -- 2-3 priorities
  revision    TEXT,
  upload_ref  TEXT,                              -- audio/video/log file for project, live, mission
  partner     TEXT CHECK (partner IS NULL OR partner IN ('tutor','exchange','peer','ai_standin','self')),
  rubric      TEXT CHECK (rubric IS NULL OR json_valid(rubric)),
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','feedback','submitted','scored')),
  cost_cents  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX es_subs_user ON es_submissions(user_id, level_id);

CREATE TABLE es_item_reports (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  item_id      TEXT NOT NULL REFERENCES es_items(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL CHECK (reason IN
                 ('my_answer_should_be_accepted','wrong_answer_accepted','audio_problem',
                  'translation_wrong','too_easy','too_hard','other')),
  response     TEXT,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixed','dismissed')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at  TEXT
) STRICT;
CREATE INDEX es_item_reports_open ON es_item_reports(status, item_id);

-- ───────────────────────── habit loop ─────────────────────────

CREATE TABLE es_xp_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  source      TEXT NOT NULL CHECK (source IN ('level','practice','bonus','quest','gate','story')),
  session_id  TEXT REFERENCES es_sessions(id) ON DELETE SET NULL,
  local_date  TEXT NOT NULL,                    -- learner's calendar day
  week_key    TEXT NOT NULL,                    -- league week, e.g. '2026-W42'
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (session_id, source)                   -- one award per session per source
) STRICT;
CREATE INDEX es_xp_user_day ON es_xp_events(user_id, local_date);
CREATE INDEX es_xp_week ON es_xp_events(week_key, user_id);

CREATE TABLE es_streaks (
  user_id          TEXT PRIMARY KEY,
  current          INTEGER NOT NULL DEFAULT 0,
  longest          INTEGER NOT NULL DEFAULT 0,
  last_local_date  TEXT,
  freezes          INTEGER NOT NULL DEFAULT 0 CHECK (freezes BETWEEN 0 AND 2),
  goal             INTEGER CHECK (goal IS NULL OR goal IN (7,14,30,50)),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE es_streak_days (
  user_id     TEXT NOT NULL,
  local_date  TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('done','frozen','repaired')),
  PRIMARY KEY (user_id, local_date)
) STRICT;

CREATE TABLE es_quests (
  user_id       TEXT NOT NULL,
  period_key    TEXT NOT NULL,                  -- '2026-10-13' (daily) or '2026-10' (monthly)
  quest_code    TEXT NOT NULL,                  -- 'earn_xp_20', 'perfect_lesson', 'listen_3'
  target        INTEGER NOT NULL,
  progress      INTEGER NOT NULL DEFAULT 0,
  reward_gems   INTEGER NOT NULL DEFAULT 0,
  completed_at  TEXT,
  claimed_at    TEXT,
  PRIMARY KEY (user_id, period_key, quest_code)
) STRICT;

CREATE TABLE es_purchases (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  client_purchase_id  TEXT NOT NULL,
  item_code           TEXT NOT NULL CHECK (item_code IN ('heart_refill','streak_freeze','xp_boost')),
  gems                INTEGER NOT NULL CHECK (gems > 0),
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (user_id, client_purchase_id)
) STRICT;
CREATE INDEX es_purchases_user ON es_purchases(user_id, created_at);

-- ───────────────────────── social (milestone 6) ─────────────────────────

CREATE TABLE es_league_cohorts (
  id          TEXT PRIMARY KEY,
  week_key    TEXT NOT NULL,
  tier        INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 10),
  size_cap    INTEGER NOT NULL DEFAULT 30,
  closed_at   TEXT
) STRICT;
CREATE INDEX es_cohorts_week ON es_league_cohorts(week_key, tier);

CREATE TABLE es_league_members (
  cohort_id    TEXT NOT NULL REFERENCES es_league_cohorts(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  xp           INTEGER NOT NULL DEFAULT 0,
  final_rank   INTEGER,
  outcome      TEXT CHECK (outcome IS NULL OR outcome IN ('promoted','stayed','demoted')),
  PRIMARY KEY (cohort_id, user_id)
) STRICT;
CREATE INDEX es_members_user ON es_league_members(user_id);
CREATE INDEX es_members_rank ON es_league_members(cohort_id, xp DESC);

CREATE TABLE es_follows (
  follower_id  TEXT NOT NULL,
  followee_id  TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
) STRICT;
CREATE INDEX es_follows_followee ON es_follows(followee_id);

CREATE TABLE es_blocks (
  blocker_id  TEXT NOT NULL,
  blocked_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (blocker_id, blocked_id)
) STRICT;
