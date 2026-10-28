/**
 * QuizAttemptsRepository — append-only history of knowledge-check submissions.
 *
 * Attempts are never mutated or deleted. Progress aggregates are stored
 * separately in QuizProgressRepository.
 */
export class QuizAttemptsRepository {
  #db;

  /** @param {import('../database.mjs').DatabaseAdapter} db */
  constructor(db) {
    this.#db = db;
  }

  /**
   * Record one quiz submission. Returns the auto-assigned attempt id.
   *
   * @param {object} attempt
   * @param {string} attempt.quizId
   * @param {string} attempt.contentRev
   * @param {string} [attempt.attemptedAt] - ISO 8601 UTC; defaults to now.
   * @param {number} attempt.scoreEarned
   * @param {number} attempt.scorePossible
   * @param {number} attempt.correctCount
   * @param {number} attempt.totalCount
   * @param {string} attempt.answersJson     - Pre-serialized JSON string.
   * @param {string} attempt.correctnessJson - Pre-serialized JSON string.
   * @returns {number} The new attempt's id.
   */
  insert({
    quizId,
    contentRev,
    attemptedAt = new Date().toISOString(),
    scoreEarned,
    scorePossible,
    correctCount,
    totalCount,
    answersJson,
    correctnessJson,
  }) {
    const result = this.#db
      .prepare(
        `INSERT INTO quiz_attempts
           (quiz_id, content_rev, attempted_at,
            score_earned, score_possible, correct_count, total_count,
            answers_json, correctness_json)
         VALUES
           ($quiz_id, $content_rev, $attempted_at,
            $score_earned, $score_possible, $correct_count, $total_count,
            $answers_json, $correctness_json)`,
      )
      .run({
        $quiz_id: quizId,
        $content_rev: contentRev,
        $attempted_at: attemptedAt,
        $score_earned: scoreEarned,
        $score_possible: scorePossible,
        $correct_count: correctCount,
        $total_count: totalCount,
        $answers_json: answersJson,
        $correctness_json: correctnessJson,
      });
    return result.lastInsertRowid;
  }

  /**
   * Return all attempts for a given quiz, oldest first.
   *
   * @param {string} quizId
   * @returns {object[]}
   */
  byQuiz(quizId) {
    return this.#db
      .prepare(
        `SELECT id, quiz_id, content_rev, attempted_at,
                score_earned, score_possible, correct_count, total_count,
                answers_json, correctness_json
         FROM quiz_attempts
         WHERE quiz_id = $quiz_id
         ORDER BY attempted_at ASC, id ASC`,
      )
      .all({ $quiz_id: quizId })
      .map(rowToAttempt);
  }
}

function rowToAttempt(row) {
  return {
    id: row.id,
    quizId: row.quiz_id,
    contentRev: row.content_rev,
    attemptedAt: row.attempted_at,
    scoreEarned: row.score_earned,
    scorePossible: row.score_possible,
    correctCount: row.correct_count,
    totalCount: row.total_count,
    answers: JSON.parse(row.answers_json),
    correctness: JSON.parse(row.correctness_json),
  };
}
