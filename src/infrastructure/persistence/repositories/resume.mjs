/**
 * ResumeRepository — stores the learner's last selected track and exercise.
 *
 * At most one row exists (enforced by CHECK (id = 1)). M4.3 will read this
 * to implement "Continue Learning". The repository only stores and retrieves
 * the selection; it does not validate that the exercise still exists.
 */
export class ResumeRepository {
  #db;

  /** @param {import('../database.mjs').DatabaseAdapter} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * Return the last selected track and exercise, or null if none was ever saved.
   *
   * @returns {{ trackId: string, exerciseId: string, updatedAt: string }|null}
   */
  get() {
    const row = this.#db
      .prepare("SELECT track_id, exercise_id, updated_at FROM resume_state WHERE id = 1")
      .get();
    return row
      ? { trackId: row.track_id, exerciseId: row.exercise_id, updatedAt: row.updated_at }
      : null;
  }

  /**
   * Store or replace the last selected track and exercise.
   *
   * @param {object} state
   * @param {string} state.trackId
   * @param {string} state.exerciseId
   * @param {string} [state.updatedAt] - ISO 8601 UTC timestamp; defaults to now.
   */
  set({ trackId, exerciseId, updatedAt = new Date().toISOString() }) {
    this.#db
      .prepare(
        `INSERT INTO resume_state (id, track_id, exercise_id, updated_at)
         VALUES (1, $track_id, $exercise_id, $updated_at)
         ON CONFLICT (id) DO UPDATE SET
           track_id    = excluded.track_id,
           exercise_id = excluded.exercise_id,
           updated_at  = excluded.updated_at`,
      )
      .run({
        $track_id: trackId,
        $exercise_id: exerciseId,
        $updated_at: updatedAt,
      });
  }
}
