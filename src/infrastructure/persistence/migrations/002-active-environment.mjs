/**
 * Migration 002 — active environment.
 *
 *   active_environment — single row naming the exercise that currently owns the shared
 *                        practice cluster. Survives restarts so reopening the same exercise
 *                        after `featherlab stop` / `start` keeps the learner's work, while
 *                        opening a different one is known to need a cleanup first.
 *
 * Distinct from resume_state: resume records what the learner last *looked at*; this records
 * whose resources are actually in the cluster.
 */

export const version = 2;
export const description = "Active environment: which exercise owns the practice cluster";

/** @param {import('../database.mjs').DatabaseAdapter} db */
export function up(db) {
  db.exec(`
    CREATE TABLE active_environment (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      track_id     TEXT    NOT NULL,
      exercise_id  TEXT    NOT NULL,
      activated_at TEXT    NOT NULL
    );
  `);
}
