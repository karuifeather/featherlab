import "./CompletionFeedback.scss";

/**
 * Shown inside ExercisePanel after a successful grading pass.
 *
 * - firstCompletion: true only the first time this exercise is passed in this session.
 * - nextExercise: the next non-locked exercise, or null if none.
 * - onNext: callback to navigate to nextExercise. Moving on is the learner's confirmation that
 *   this exercise's cluster resources may be reset, so the note says so up front.
 */
export function CompletionFeedback({ firstCompletion, nextExercise, onNext }) {
  if (!firstCompletion && !nextExercise) return null;

  return (
    <div className="completion-feedback" data-testid="completion-feedback">
      {firstCompletion && (
        <p className="completion-badge" role="status" aria-live="polite">
          Exercise completed
        </p>
      )}
      {nextExercise && (
        <>
          <button
            type="button"
            className="next-exercise-btn"
            data-testid="next-exercise-btn"
            aria-describedby="next-exercise-note"
            onClick={() => onNext(nextExercise.id)}
          >
            Next: {nextExercise.title}{" "}
            <span className="next-exercise-arrow" aria-hidden="true">
              →
            </span>
          </button>
          <p
            className="next-exercise-note"
            id="next-exercise-note"
            data-testid="next-exercise-note"
          >
            Opens in a fresh environment: this exercise&apos;s cluster resources are reset. Your
            completion stays saved.
          </p>
        </>
      )}
    </div>
  );
}
