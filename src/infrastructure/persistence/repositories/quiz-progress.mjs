/**
 * QuizProgressRepository — compact aggregate of a learner's progress per knowledge check.
 *
 * Tracks best and most-recent scores, completion status, and attempt count.
 * Completion rules are not enforced here; the calling service decides when `completed`
 * flips to true.
 */
export class QuizProgressRepository {
  #db;

  /** @param {import('../database.mjs').DatabaseAdapter} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * Retrieve the progress record for one quiz, or null if not yet attempted.
   *
   * @param {string} quizId
   * @returns {object|null}
   */
  get(quizId) {
    const row = this.#db
      .prepare(
        `SELECT quiz_id, completed, first_completed_at, last_attempted_at,
                attempt_count, best_score_earned, best_score_possible,
                last_score_earned, last_score_possible
         FROM quiz_progress
         WHERE quiz_id = $quiz_id`,
      )
      .get({ $quiz_id: quizId });
    return row ? rowToProgress(row) : null;
  }

  /**
   * Insert or update the progress record for one quiz.
   *
   * @param {object} progress
   * @param {string} progress.quizId
   * @param {boolean} [progress.completed=false]
   * @param {string|null} [progress.firstCompletedAt]
   * @param {string} progress.lastAttemptedAt
   * @param {number} progress.attemptCount
   * @param {number|null} [progress.bestScoreEarned]
   * @param {number|null} [progress.bestScorePossible]
   * @param {number} progress.lastScoreEarned
   * @param {number} progress.lastScorePossible
   */
  upsert({
    quizId,
    completed = false,
    firstCompletedAt = null,
    lastAttemptedAt,
    attemptCount,
    bestScoreEarned = null,
    bestScorePossible = null,
    lastScoreEarned,
    lastScorePossible,
  }) {
    this.#db
      .prepare(
        `INSERT INTO quiz_progress
           (quiz_id, completed, first_completed_at, last_attempted_at,
            attempt_count, best_score_earned, best_score_possible,
            last_score_earned, last_score_possible)
         VALUES
           ($quiz_id, $completed, $first_completed_at, $last_attempted_at,
            $attempt_count, $best_score_earned, $best_score_possible,
            $last_score_earned, $last_score_possible)
         ON CONFLICT (quiz_id) DO UPDATE SET
           completed           = excluded.completed,
           first_completed_at  = excluded.first_completed_at,
           last_attempted_at   = excluded.last_attempted_at,
           attempt_count       = excluded.attempt_count,
           best_score_earned   = excluded.best_score_earned,
           best_score_possible = excluded.best_score_possible,
           last_score_earned   = excluded.last_score_earned,
           last_score_possible = excluded.last_score_possible`,
      )
      .run({
        $quiz_id: quizId,
        $completed: completed ? 1 : 0,
        $first_completed_at: firstCompletedAt,
        $last_attempted_at: lastAttemptedAt,
        $attempt_count: attemptCount,
        $best_score_earned: bestScoreEarned,
        $best_score_possible: bestScorePossible,
        $last_score_earned: lastScoreEarned,
        $last_score_possible: lastScorePossible,
      });
  }
}

function rowToProgress(row) {
  return {
    quizId: row.quiz_id,
    completed: row.completed === 1,
    firstCompletedAt: row.first_completed_at,
    lastAttemptedAt: row.last_attempted_at,
    attemptCount: row.attempt_count,
    bestScoreEarned: row.best_score_earned,
    bestScorePossible: row.best_score_possible,
    lastScoreEarned: row.last_score_earned,
    lastScorePossible: row.last_score_possible,
  };
}
