import { computeNextProgress } from "./completion-service.mjs";

/**
 * Records grading attempts and updates the progress aggregate atomically.
 *
 * The persistence layer is injected; this class contains no SQL.
 * Outcome "incomplete" means the grading engine could not evaluate the exercise
 * (infrastructure error, timeout). Those attempts are NOT recorded because they
 * do not represent a genuine learning interaction.
 */
export class AttemptsService {
  #persistence;

  /** @param {{ persistence: object }} opts */
  constructor({ persistence }) {
    this.#persistence = persistence;
  }

  /**
   * Record one grading attempt and update the aggregate progress record atomically.
   *
   * Returns the updated progress object, or null if the outcome was "incomplete"
   * (in which case nothing is written to the database).
   *
   * @param {object} opts
   * @param {object} opts.exercise       - Normalized exercise object (id, track, …).
   * @param {object} opts.gradingResult  - Result from the grading engine.
   * @param {number|null} [opts.durationMs] - Wall-clock grading time in milliseconds.
   * @returns {object|null}
   */
  record({ exercise, gradingResult, durationMs = null }) {
    if (gradingResult.outcome === "incomplete") return null;

    const now = new Date().toISOString();
    let updatedProgress;

    this.#persistence.transaction(() => {
      this.#persistence.attempts.insert({
        exerciseId: exercise.id,
        trackId: exercise.track,
        attemptedAt: now,
        outcome: gradingResult.outcome,
        scoreEarned: gradingResult.score.earned,
        scorePossible: gradingResult.score.possible,
        durationMs,
      });

      const current = this.#persistence.progress.get(exercise.id, exercise.track);
      const next = computeNextProgress(current, gradingResult, {
        exerciseId: exercise.id,
        trackId: exercise.track,
        now,
      });
      this.#persistence.progress.upsert(next);
      updatedProgress = next;
    });

    return updatedProgress;
  }
}
