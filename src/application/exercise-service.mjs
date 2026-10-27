import { InputError, LockedError, NotFoundError } from "../core/errors.mjs";
import { ID_PATTERN } from "../core/exercises/definition.mjs";
import {
  presentExercise,
  presentExerciseProgress,
  presentHint,
  presentOperation,
  presentProgress,
  presentResult,
  presentSummary,
} from "./presenters.mjs";

/**
 * Application service: the use cases the API (and CLI) invoke. It validates input,
 * resolves exercises, delegates to the lifecycle manager, and returns presentation-safe
 * data. It contains no HTTP and no Kubernetes knowledge.
 *
 * When M4 persistence is wired in (progression, attemptsService, resumeService), the
 * service enforces prerequisite locks on activate/check, records grading results, and
 * manages resume state. When persistence is absent (isolated tests), the service behaves
 * exactly as it did before M4.
 *
 * Lifecycle operations go through the EnvironmentSession, which owns the rule that one
 * exercise at a time holds the shared practice cluster (see environment-session.mjs).
 */
export class ExerciseService {
  #registry;
  #session;
  #progression; // ProgressionService | null
  #attemptsService; // AttemptsService | null
  #resumeService; // ResumeService | null

  constructor({
    registry,
    session,
    progression = null,
    attemptsService = null,
    resumeService = null,
  }) {
    this.#registry = registry;
    this.#session = session;
    this.#progression = progression;
    this.#attemptsService = attemptsService;
    this.#resumeService = resumeService;
  }

  #find(id) {
    if (typeof id !== "string" || id.length > 63 || !ID_PATTERN.test(id))
      throw new NotFoundError("Exercise not found.", { id: String(id).slice(0, 63) });
    return this.#registry.require(id);
  }

  #assertNotLocked(exercise) {
    if (!this.#progression) return;
    const availability = this.#progression.getAvailability(exercise.id);
    if (availability?.state === "locked")
      throw new LockedError(
        `Exercise "${exercise.id}" is locked. Complete its prerequisites first.`,
        { exerciseId: exercise.id, unmetPrerequisites: availability.unmetPrerequisites },
      );
  }

  list(filter = {}) {
    const { level } = filter;
    let parsedLevel;
    if (level !== undefined) {
      parsedLevel = Number(level);
      if (!Number.isInteger(parsedLevel) || parsedLevel < 0)
        throw new InputError("level must be a non-negative integer.");
    }
    return this.#registry
      .list({
        track: filter.track,
        level: parsedLevel,
        difficulty: filter.difficulty,
        tags: filter.tags,
      })
      .map(presentSummary);
  }

  get(id) {
    return presentExercise(this.#find(id));
  }

  /** `index` is 1-based so hints can be requested one at a time, in order. */
  hint(id, index) {
    const exercise = this.#find(id);
    const n = Number(index);
    if (!Number.isInteger(n) || n < 1 || n > exercise.hints.length)
      throw new NotFoundError("Hint not found.", { id, index });
    return presentHint(exercise, n);
  }

  /**
   * Open an exercise in the shared practice environment. `discardActive` confirms that
   * another exercise's cluster work may be reset; without it that case is refused.
   */
  async activate(id, { discardActive = false } = {}) {
    const exercise = this.#find(id);
    this.#assertNotLocked(exercise);
    const outcome = await this.#session.open(exercise, { discardActive });
    return {
      exercise: presentExercise(exercise),
      ...presentOperation(exercise, outcome),
      environment: outcome.environment,
    };
  }

  async check(id) {
    const exercise = this.#find(id);
    this.#assertNotLocked(exercise);
    const start = Date.now();
    const result = await this.#session.check(exercise);
    const durationMs = Date.now() - start;
    const progress = this.#attemptsService?.record({ exercise, gradingResult: result, durationMs });
    const presented = presentResult(result);
    return progress ? { ...presented, progress: presentProgress(progress) } : presented;
  }

  async reset(id, { discardActive = false } = {}) {
    const exercise = this.#find(id);
    return presentOperation(exercise, await this.#session.reset(exercise, { discardActive }));
  }

  async cleanup(id) {
    const exercise = this.#find(id);
    return presentOperation(exercise, await this.#session.cleanup(exercise));
  }

  /**
   * Record the learner's exercise selection for resume.
   * Validates the exercise exists and is not locked.
   *
   * @returns {{ trackId: string, exerciseId: string }}
   */
  select(id) {
    if (this.#resumeService) return this.#resumeService.select(id);
    const exercise = this.#find(id);
    this.#assertNotLocked(exercise);
    return { trackId: exercise.track, exerciseId: id };
  }

  /**
   * Return detailed progress for one exercise (availability state + stored record).
   * Returns a synthetic "available" record when persistence is not configured.
   */
  getExerciseProgress(id) {
    const exercise = this.#find(id);
    if (!this.#progression) {
      return {
        exerciseId: exercise.id,
        trackId: exercise.track,
        state: "available",
        unmetPrerequisites: [],
        completed: false,
        attemptCount: 0,
        bestScoreEarned: null,
        bestScorePossible: null,
        firstCompletedAt: null,
        lastAttemptedAt: null,
      };
    }
    return presentExerciseProgress(this.#progression.getExerciseDetails(exercise.id));
  }

  /**
   * Return all exercises for a track with their progression states and progress records.
   */
  getTrackProgress(trackId) {
    const exercises = this.#registry.list({ track: trackId });
    if (!this.#progression) {
      return exercises.map((e) => ({
        exerciseId: e.id,
        title: e.title,
        level: e.level,
        prerequisites: [...e.prerequisites],
        state: "available",
        unmetPrerequisites: [],
        completed: false,
        attemptCount: 0,
        bestScoreEarned: null,
        bestScorePossible: null,
        firstCompletedAt: null,
        lastAttemptedAt: null,
      }));
    }
    return this.#progression.getTrackProgress(trackId);
  }

  /**
   * Return the current resume state, with fallback when the stored exercise is invalid.
   * Returns null when no exercises exist.
   */
  getResume() {
    if (!this.#resumeService) return null;
    return this.#resumeService.getResume();
  }

  get exerciseCount() {
    return this.#registry.size;
  }
}
