/**
 * Migration 004 — knowledge checks persistence.
 *
 *   quiz_attempts  — append-only history of knowledge-check submissions.
 *   quiz_progress  — compact aggregate (best score, last score, completion, counts).
 *
 * Design notes:
 *   - quiz_id is globally unique (kq-* prefix convention), so no track_id column is needed.
 *   - content_rev records which question set was in effect when the attempt was made;
 *     a rev change does not invalidate old attempts but makes score comparisons meaningful.
 *   - answers_json and correctness_json are opaque TEXT blobs: {questionId: [optionId,...]}
 *     and {questionId: boolean} respectively. Storing JSON rather than normalising to rows
 *     keeps the schema simple while preserving the full attempt record for later review.
 */

export const version = 4;
export const description = "Knowledge checks: quiz attempts and progress";

/** @param {import('../database.mjs').DatabaseAdapter} db */
export function up(db) {
  db.exec(`
    CREATE TABLE quiz_attempts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id          TEXT    NOT NULL,
      content_rev      TEXT    NOT NULL,
      attempted_at     TEXT    NOT NULL,
      score_earned     INTEGER NOT NULL CHECK (score_earned >= 0),
      score_possible   INTEGER NOT NULL CHECK (score_possible >= 0),
      correct_count    INTEGER NOT NULL CHECK (correct_count >= 0),
      total_count      INTEGER NOT NULL CHECK (total_count >= 1),
      answers_json     TEXT    NOT NULL,
      correctness_json TEXT    NOT NULL,
      CHECK (score_earned <= score_possible),
      CHECK (correct_count <= total_count)
    );

    CREATE INDEX quiz_attempts_quiz_idx ON quiz_attempts (quiz_id);
    CREATE INDEX quiz_attempts_time_idx ON quiz_attempts (attempted_at);

    CREATE TABLE quiz_progress (
      quiz_id             TEXT    PRIMARY KEY,
      completed           INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      first_completed_at  TEXT,
      last_attempted_at   TEXT    NOT NULL,
      attempt_count       INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
      best_score_earned   INTEGER,
      best_score_possible INTEGER,
      last_score_earned   INTEGER NOT NULL,
      last_score_possible INTEGER NOT NULL,
      CHECK (best_score_earned IS NULL OR best_score_earned >= 0),
      CHECK (best_score_possible IS NULL OR best_score_possible >= 0),
      CHECK (
        best_score_earned IS NULL OR
        best_score_possible IS NULL OR
        best_score_earned <= best_score_possible
      ),
      CHECK (last_score_earned >= 0),
      CHECK (last_score_possible >= 0),
      CHECK (last_score_earned <= last_score_possible)
    );
  `);
}
