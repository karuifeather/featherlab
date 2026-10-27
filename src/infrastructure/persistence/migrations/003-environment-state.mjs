/**
 * Migration 003 — active environment transition state.
 *
 * Adds active_environment.state:
 *   'ready'     — the exercise was reset and verified unsolved; its work belongs to the learner.
 *   'preparing' — a takeover (cleanup of the previous owner, reset, baseline check) is in
 *                 progress or was interrupted. The named exercise may have resources in the
 *                 cluster, so the next open cleans it up; it is never graded in this state.
 *
 * Rows written under migration 002 were only stored after a successful takeover, so they
 * are 'ready'.
 */

export const version = 3;
export const description = "Active environment: record whether a takeover completed";

/** @param {import('../database.mjs').DatabaseAdapter} db */
export function up(db) {
  db.exec(`
    ALTER TABLE active_environment
      ADD COLUMN state TEXT NOT NULL DEFAULT 'ready' CHECK (state IN ('preparing', 'ready'));
  `);
}
