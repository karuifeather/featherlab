/**
 * ProgressRepository — compact aggregate of a learner's progress per exercise.
 *
 * Progress is a denormalised summary: best score, completion flag, timestamps,
 * and attempt count. It answers "how is this learner doing on this exercise?"
 * without re-scanning the full attempt history.
 *
 * Completion rules are NOT enforced here. The calling service decides when
 * `completed` flips to true (M4.2). This repository persists and retrieves
 * the aggregate; it does not define what "done" means.
 *
 * Writes use INSERT OR REPLACE (UPSERT) so the same exercise_id / track_id
 * pair always holds exactly one row.
 */
export class ProgressRepository {
  #db;

  /** @param {import('../database.mjs').DatabaseAdapter} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * Retrieve the progress record for one exercise, or null if not yet attempted.
   *
   * @param {string} exerciseId
   * @param {string} trackId
   * @returns {object|null}
   */
  get(exerciseId, trackId) {
    const row = this.#db
      .prepare(
        `SELECT exercise_id, track_id,
                best_score_earned, best_score_possible,
                completed, first_completed_at, last_attempted_at, attempt_count
         FROM exercise_progress
         WHERE exercise_id = $exercise_id AND track_id = $track_id`,
      )
      .get({ $exercise_id: exerciseId, $track_id: trackId });
    return row ? rowToProgress(row) : null;
  }

  /**
   * Return all progress records for a given track, ordered by exercise id.
   *
   * @param {string} trackId
   * @returns {object[]}
   */
  forTrack(trackId) {
    return this.#db
      .prepare(
        `SELECT exercise_id, track_id,
                best_score_earned, best_score_possible,
                completed, first_completed_at, last_attempted_at, attempt_count
         FROM exercise_progress
         WHERE track_id = $track_id
         ORDER BY exercise_id ASC`,
      )
      .all({ $track_id: trackId })
      .map(rowToProgress);
  }

  /**
   * Insert or replace the progress record for one exercise.
   *
   * The caller is responsible for computing correct values (M4.2 will do this).
   * The repository only validates that required fields are present.
   *
   * @param {object} progress
   * @param {string} progress.exerciseId
   * @param {string} progress.trackId
   * @param {number|null} [progress.bestScoreEarned]
   * @param {number|null} [progress.bestScorePossible]
   * @param {boolean} [progress.completed=false]
   * @param {string|null} [progress.firstCompletedAt]  - ISO 8601 UTC or null.
   * @param {string|null} [progress.lastAttemptedAt]   - ISO 8601 UTC or null.
   * @param {number} [progress.attemptCount=0]
   */
  upsert({
    exerciseId,
    trackId,
    bestScoreEarned = null,
    bestScorePossible = null,
    completed = false,
    firstCompletedAt = null,
    lastAttemptedAt = null,
    attemptCount = 0,
  }) {
    this.#db
      .prepare(
        `INSERT INTO exercise_progress
           (exercise_id, track_id,
            best_score_earned, best_score_possible,
            completed, first_completed_at, last_attempted_at, attempt_count)
         VALUES
           ($exercise_id, $track_id,
            $best_score_earned, $best_score_possible,
            $completed, $first_completed_at, $last_attempted_at, $attempt_count)
         ON CONFLICT (exercise_id, track_id) DO UPDATE SET
           best_score_earned    = excluded.best_score_earned,
           best_score_possible  = excluded.best_score_possible,
           completed            = excluded.completed,
           first_completed_at   = excluded.first_completed_at,
           last_attempted_at    = excluded.last_attempted_at,
           attempt_count        = excluded.attempt_count`,
      )
      .run({
        $exercise_id: exerciseId,
        $track_id: trackId,
        $best_score_earned: bestScoreEarned,
        $best_score_possible: bestScorePossible,
        $completed: completed ? 1 : 0,
        $first_completed_at: firstCompletedAt,
        $last_attempted_at: lastAttemptedAt,
        $attempt_count: attemptCount,
      });
  }
}

function rowToProgress(row) {
  return {
    exerciseId: row.exercise_id,
    trackId: row.track_id,
    bestScoreEarned: row.best_score_earned,
    bestScorePossible: row.best_score_possible,
    completed: row.completed === 1,
    firstCompletedAt: row.first_completed_at,
    lastAttemptedAt: row.last_attempted_at,
    attemptCount: row.attempt_count,
  };
}
