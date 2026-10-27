/**
 * ActiveEnvironmentRepository — which exercise currently owns the practice cluster, and
 * whether it is `ready` or still `preparing` (a takeover in progress or interrupted).
 *
 * At most one row exists (enforced by CHECK (id = 1)). The repository only stores and
 * retrieves the record; EnvironmentSession decides when it changes.
 */
export class ActiveEnvironmentRepository {
  #db;

  /** @param {import('../database.mjs').DatabaseAdapter} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * @returns {{ trackId: string, exerciseId: string, state: "preparing"|"ready",
   *             activatedAt: string }|null}
   */
  get() {
    const row = this.#db
      .prepare(
        "SELECT track_id, exercise_id, state, activated_at FROM active_environment WHERE id = 1",
      )
      .get();
    return row
      ? {
          trackId: row.track_id,
          exerciseId: row.exercise_id,
          state: row.state,
          activatedAt: row.activated_at,
        }
      : null;
  }

  /**
   * @param {object} record
   * @param {string} record.trackId
   * @param {string} record.exerciseId
   * @param {"preparing"|"ready"} record.state
   * @param {string} [record.activatedAt] - ISO 8601 UTC timestamp; defaults to now.
   */
  set({ trackId, exerciseId, state, activatedAt = new Date().toISOString() }) {
    this.#db
      .prepare(
        `INSERT INTO active_environment (id, track_id, exercise_id, state, activated_at)
         VALUES (1, $track_id, $exercise_id, $state, $activated_at)
         ON CONFLICT (id) DO UPDATE SET
           track_id     = excluded.track_id,
           exercise_id  = excluded.exercise_id,
           state        = excluded.state,
           activated_at = excluded.activated_at`,
      )
      .run({
        $track_id: trackId,
        $exercise_id: exerciseId,
        $state: state,
        $activated_at: activatedAt,
      });
  }

  clear() {
    this.#db.prepare("DELETE FROM active_environment WHERE id = 1").run();
  }
}
