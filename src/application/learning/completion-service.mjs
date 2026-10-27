/**
 * Pure function: compute the next progress aggregate from the current record and a new
 * grading result.
 *
 * Invariants:
 *   - completion is monotonic: once true, stays true regardless of subsequent outcomes.
 *   - firstCompletedAt is set once and never changed.
 *   - bestScoreEarned is the earned score from the attempt where the learner scored highest;
 *     bestScorePossible is the corresponding possible from that same attempt.
 *   - lastAttemptedAt and attemptCount update on every recorded attempt.
 *
 * "incomplete" grading outcomes (infra errors) are never passed here; the calling service
 * filters them before calling computeNextProgress.
 *
 * @param {object|null} current  - Existing progress record, or null if first attempt.
 * @param {object} gradingResult - Result from the grading engine (outcome, score).
 * @param {object} context
 * @param {string} context.exerciseId
 * @param {string} context.trackId
 * @param {string} context.now    - ISO 8601 UTC timestamp for this attempt.
 * @returns {object} New progress record suitable for ProgressRepository.upsert().
 */
export function computeNextProgress(current, gradingResult, { exerciseId, trackId, now }) {
  const wasCompleted = current?.completed ?? false;
  const justPassed = gradingResult.outcome === "passed";
  const newlyCompleted = !wasCompleted && justPassed;

  const newEarned = gradingResult.score.earned;
  const newPossible = gradingResult.score.possible;
  const currentBestEarned = current?.bestScoreEarned ?? null;

  // Update best score when the new attempt is strictly better.
  let bestScoreEarned, bestScorePossible;
  if (currentBestEarned === null || newEarned > currentBestEarned) {
    bestScoreEarned = newEarned;
    bestScorePossible = newPossible;
  } else {
    bestScoreEarned = currentBestEarned;
    bestScorePossible = current.bestScorePossible;
  }

  return {
    exerciseId,
    trackId,
    completed: wasCompleted || justPassed,
    firstCompletedAt: wasCompleted ? current.firstCompletedAt : newlyCompleted ? now : null,
    lastAttemptedAt: now,
    bestScoreEarned,
    bestScorePossible,
    attemptCount: (current?.attemptCount ?? 0) + 1,
  };
}
