import { LockedError } from "../../core/errors.mjs";

/**
 * Manages the learner's last selected track/exercise (resume state).
 *
 * Rules:
 *   - Resume state updates when an exercise is selected, not only after grading.
 *   - A locked exercise cannot be selected; the learner must complete prerequisites first.
 *   - On read, if the stored exercise no longer exists or is now locked, a deterministic
 *     fallback (first available exercise by stable registry order) is returned.
 *   - Reset, shutdown, and environment changes do not erase resume state.
 */
export class ResumeService {
  #resume;
  #registry;
  #progression;

  /**
   * @param {{ resume: object, registry: object, progression: object }} opts
   */
  constructor({ resume, registry, progression }) {
    this.#resume = resume;
    this.#registry = registry;
    this.#progression = progression;
  }

  /**
   * Store the learner's exercise selection.
   *
   * @param {string} exerciseId
   * @returns {{ trackId: string, exerciseId: string }}
   * @throws {NotFoundError}  when the exercise does not exist.
   * @throws {LockedError}    when the exercise's prerequisites are not yet met.
   */
  select(exerciseId) {
    const exercise = this.#registry.require(exerciseId);
    const availability = this.#progression.getAvailability(exerciseId);
    if (availability?.state === "locked")
      throw new LockedError(
        `Exercise "${exerciseId}" is locked. Complete its prerequisites first.`,
        { exerciseId, unmetPrerequisites: availability.unmetPrerequisites },
      );
    this.#resume.set({ trackId: exercise.track, exerciseId });
    return { trackId: exercise.track, exerciseId };
  }

  /**
   * Return the current resume state.
   *
   * If the stored exercise no longer exists or is locked, returns a fallback to the
   * first available exercise in stable order, with `fallback: true`.
   *
   * @returns {{ trackId: string, exerciseId: string, updatedAt: string|null, fallback: boolean }|null}
   *   null only when no exercises exist in the registry at all.
   */
  getResume() {
    const stored = this.#resume.get();
    if (stored) {
      const exercise = this.#registry.get(stored.exerciseId);
      if (exercise) {
        const availability = this.#progression.getAvailability(stored.exerciseId);
        if (availability?.state !== "locked") {
          return {
            trackId: stored.trackId,
            exerciseId: stored.exerciseId,
            updatedAt: stored.updatedAt,
            fallback: false,
          };
        }
      }
    }
    return this.#firstAvailable();
  }

  #firstAvailable() {
    for (const exercise of this.#registry.list()) {
      const availability = this.#progression.getAvailability(exercise.id);
      if (availability?.state !== "locked") {
        return {
          trackId: exercise.track,
          exerciseId: exercise.id,
          updatedAt: null,
          fallback: true,
        };
      }
    }
    return null;
  }
}
