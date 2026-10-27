/**
 * Derives the current availability of exercises from the curriculum definition and
 * persisted completion records.
 *
 * Availability states:
 *   "locked"    — one or more prerequisites are not yet completed.
 *   "available" — no prerequisites, or all prerequisites are completed.
 *   "completed" — the learner has at least one successful grading result.
 *
 * Unlock state is derived, never stored: completing a prerequisite immediately
 * changes the dependent exercise's computed availability without any extra write.
 * No Docker or Kubernetes calls are needed to evaluate availability.
 */
export class ProgressionService {
  #registry;
  #progress;

  /**
   * @param {{ registry: object, progress: object }} opts
   *   registry — ExerciseRegistry; progress — ProgressRepository.
   */
  constructor({ registry, progress }) {
    this.#registry = registry;
    this.#progress = progress;
  }

  /**
   * Return the availability of one exercise.
   *
   * @param {string} exerciseId
   * @returns {{ state: "locked"|"available"|"completed", unmetPrerequisites: string[] }|null}
   *   null when the exercise does not exist in the registry.
   */
  getAvailability(exerciseId) {
    const exercise = this.#registry.get(exerciseId);
    if (!exercise) return null;

    const prog = this.#progress.get(exerciseId, exercise.track);
    if (prog?.completed) return { state: "completed", unmetPrerequisites: [] };

    const unmet = exercise.prerequisites.filter((prereqId) => {
      const prereqProg = this.#progress.get(prereqId, exercise.track);
      return !prereqProg?.completed;
    });

    return unmet.length > 0
      ? { state: "locked", unmetPrerequisites: unmet }
      : { state: "available", unmetPrerequisites: [] };
  }

  /**
   * Return detailed progress for one exercise (availability + stored record).
   *
   * @param {string} exerciseId
   * @returns {object|null}
   */
  getExerciseDetails(exerciseId) {
    const exercise = this.#registry.get(exerciseId);
    if (!exercise) return null;
    const availability = this.getAvailability(exerciseId);
    const prog = this.#progress.get(exerciseId, exercise.track);
    return {
      exerciseId,
      trackId: exercise.track,
      state: availability.state,
      unmetPrerequisites: availability.unmetPrerequisites,
      completed: prog?.completed ?? false,
      attemptCount: prog?.attemptCount ?? 0,
      bestScoreEarned: prog?.bestScoreEarned ?? null,
      bestScorePossible: prog?.bestScorePossible ?? null,
      firstCompletedAt: prog?.firstCompletedAt ?? null,
      lastAttemptedAt: prog?.lastAttemptedAt ?? null,
    };
  }

  /**
   * Return all exercises for a track with their availability states and progress data.
   * Exercises are returned in stable registry order (track, level, id).
   *
   * @param {string} trackId
   * @returns {object[]}
   */
  getTrackProgress(trackId) {
    const exercises = this.#registry.list({ track: trackId });
    const progressRecords = this.#progress.forTrack(trackId);
    const progressByExercise = new Map(progressRecords.map((p) => [p.exerciseId, p]));

    return exercises.map((exercise) => {
      const availability = this.getAvailability(exercise.id);
      const prog = progressByExercise.get(exercise.id) ?? null;
      return {
        exerciseId: exercise.id,
        title: exercise.title,
        level: exercise.level,
        prerequisites: [...exercise.prerequisites],
        state: availability?.state ?? "available",
        unmetPrerequisites: availability?.unmetPrerequisites ?? [],
        completed: prog?.completed ?? false,
        attemptCount: prog?.attemptCount ?? 0,
        bestScoreEarned: prog?.bestScoreEarned ?? null,
        bestScorePossible: prog?.bestScorePossible ?? null,
        firstCompletedAt: prog?.firstCompletedAt ?? null,
        lastAttemptedAt: prog?.lastAttemptedAt ?? null,
      };
    });
  }
}
