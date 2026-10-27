/**
 * Migration 001 — initial schema.
 *
 * Creates the three tables that form the M4 persistence foundation:
 *
 *   exercise_attempts  — append-only history of grading attempts.
 *   exercise_progress  — compact per-exercise aggregate (best score, completion status).
 *   resume_state       — single row recording the learner's last selected track/exercise.
 *
 * Design notes:
 *   - Timestamps are stored as TEXT in ISO 8601 UTC format ("YYYY-MM-DDTHH:mm:ss.sssZ").
 *     SQLite has no native date type; TEXT sorts and compares correctly for ISO strings.
 *   - score_earned / score_possible use INTEGER (whole points) because the current grading
 *     engine uses integer weights. If fractional scoring arrives later, a new migration
 *     will convert those columns to REAL.
 *   - exercise_progress uses (exercise_id, track_id) as the composite primary key because
 *     exercise IDs are only stable within a track (a future track might reuse "ex-001").
 *   - resume_state enforces at most one row via CHECK (id = 1). UPSERT on that single key
 *     replaces the previous value without a separate read.
 *   - No foreign key to an exercise definitions table: definitions live in YAML on disk and
 *     are not tracked in SQLite. Progress records are retained even if the YAML definition
 *     is later updated or removed.
 */

export const version = 1;
export const description = "Initial schema: exercise_attempts, exercise_progress, resume_state";

/** @param {import('../database.mjs').DatabaseAdapter} db */
export function up(db) {
  db.exec(`
    CREATE TABLE exercise_attempts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id     TEXT    NOT NULL,
      track_id        TEXT    NOT NULL,
      attempted_at    TEXT    NOT NULL,
      outcome         TEXT    NOT NULL CHECK (outcome IN ('passed', 'failed', 'incomplete')),
      score_earned    INTEGER,
      score_possible  INTEGER,
      hints_used      INTEGER,
      duration_ms     INTEGER,
      CHECK (score_earned IS NULL OR (score_earned >= 0)),
      CHECK (score_possible IS NULL OR (score_possible >= 0)),
      CHECK (score_earned IS NULL OR score_possible IS NULL OR score_earned <= score_possible),
      CHECK (hints_used IS NULL OR hints_used >= 0),
      CHECK (duration_ms IS NULL OR duration_ms >= 0)
    );

    CREATE INDEX exercise_attempts_exercise_idx ON exercise_attempts (exercise_id);
    CREATE INDEX exercise_attempts_track_idx    ON exercise_attempts (track_id);
    CREATE INDEX exercise_attempts_time_idx     ON exercise_attempts (attempted_at);

    CREATE TABLE exercise_progress (
      exercise_id           TEXT    NOT NULL,
      track_id              TEXT    NOT NULL,
      best_score_earned     INTEGER,
      best_score_possible   INTEGER,
      completed             INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      first_completed_at    TEXT,
      last_attempted_at     TEXT,
      attempt_count         INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      PRIMARY KEY (exercise_id, track_id),
      CHECK (best_score_earned IS NULL OR best_score_earned >= 0),
      CHECK (best_score_possible IS NULL OR best_score_possible >= 0),
      CHECK (
        best_score_earned IS NULL OR
        best_score_possible IS NULL OR
        best_score_earned <= best_score_possible
      )
    );

    CREATE TABLE resume_state (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      track_id    TEXT    NOT NULL,
      exercise_id TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    );
  `);
}
