/**
 * AttemptsRepository — append-only history of exercise grading attempts.
 *
 * Attempts are never mutated or deleted. Progress aggregates are stored
 * separately in ProgressRepository; this table is the authoritative record
 * of what actually happened.
 */
export class AttemptsRepository {
  #db;

  /** @param {import('../database.mjs').DatabaseAdapter} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * Record one grading attempt. Returns the auto-assigned attempt id.
   *
   * @param {object} attempt
   * @param {string} attempt.exerciseId   - Stable exercise identifier (e.g. 'k8s-0001').
   * @param {string} attempt.trackId      - Track identifier (e.g. 'kubernetes').
   * @param {string} [attempt.attemptedAt] - ISO 8601 UTC timestamp; defaults to now.
   * @param {'passed'|'failed'|'incomplete'} attempt.outcome
   * @param {number|null} [attempt.scoreEarned]   - Earned points (integer).
   * @param {number|null} [attempt.scorePossible] - Maximum points (integer).
   * @param {number|null} [attempt.hintsUsed]     - Number of hints revealed.
   * @param {number|null} [attempt.durationMs]    - Wall-clock duration in milliseconds.
   * @returns {number} The new attempt's id.
   */
  insert({
    exerciseId,
    trackId,
    attemptedAt = new Date().toISOString(),
    outcome,
    scoreEarned = null,
    scorePossible = null,
    hintsUsed = null,
    durationMs = null,
  }) {
    const result = this.#db
      .prepare(
        `INSERT INTO exercise_attempts
           (exercise_id, track_id, attempted_at, outcome,
            score_earned, score_possible, hints_used, duration_ms)
         VALUES ($exercise_id, $track_id, $attempted_at, $outcome,
                 $score_earned, $score_possible, $hints_used, $duration_ms)`,
      )
      .run({
        $exercise_id: exerciseId,
        $track_id: trackId,
        $attempted_at: attemptedAt,
        $outcome: outcome,
        $score_earned: scoreEarned,
        $score_possible: scorePossible,
        $hints_used: hintsUsed,
        $duration_ms: durationMs,
      });
    return result.lastInsertRowid;
  }

  /**
   * Return all attempts for a given exercise, oldest first.
   *
   * @param {string} exerciseId
   * @returns {object[]}
   */
  byExercise(exerciseId) {
    return this.#db
      .prepare(
        `SELECT id, exercise_id, track_id, attempted_at, outcome,
                score_earned, score_possible, hints_used, duration_ms
         FROM exercise_attempts
         WHERE exercise_id = $exercise_id
         ORDER BY attempted_at ASC, id ASC`,
      )
      .all({ $exercise_id: exerciseId })
      .map(rowToAttempt);
  }

  /**
   * Return the most recent attempts across all exercises, newest first.
   *
   * @param {number} [limit=20]
   * @returns {object[]}
   */
  recent(limit = 20) {
    return this.#db
      .prepare(
        `SELECT id, exercise_id, track_id, attempted_at, outcome,
                score_earned, score_possible, hints_used, duration_ms
         FROM exercise_attempts
         ORDER BY attempted_at DESC, id DESC
         LIMIT $limit`,
      )
      .all({ $limit: limit })
      .map(rowToAttempt);
  }
}

function rowToAttempt(row) {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    trackId: row.track_id,
    attemptedAt: row.attempted_at,
    outcome: row.outcome,
    scoreEarned: row.score_earned,
    scorePossible: row.score_possible,
    hintsUsed: row.hints_used,
    durationMs: row.duration_ms,
  };
}
