import { ConflictError, FeatherLabError, LifecycleError } from "../errors.mjs";
import { runChecks } from "../validation/engine.mjs";

const DEFAULT_TIMEOUTS_MS = Object.freeze({
  probe: 30_000,
  activate: 120_000,
  check: 60_000,
  reset: 120_000,
  cleanup: 120_000,
});

const silent = { warn() {}, error() {} };

/**
 * Orchestrates the exercise lifecycle:
 *
 *   probe    = prepare only: is the environment reachable? Read-only, never mutates.
 *   activate = prepare (environment reachable) -> setup (create required resources)
 *   check    = read state through the track's query adapter -> run validators -> score
 *   reset    = prepare -> remove the learner's work -> restore setup state
 *   cleanup  = prepare -> remove everything the exercise owns
 *
 * Guarantees:
 *  - One operation per exercise at a time; a concurrent request is rejected with
 *    ConflictError rather than queued, so UI double-clicks cannot interleave a reset and a check.
 *  - Every operation has a deadline, delivered to the track driver as an AbortSignal.
 *  - Failures surface as FeatherLabError subclasses; the lock is always released.
 *
 * The manager contains no track-specific knowledge: it resolves the exercise's track and
 * calls its driver.
 */
export class LifecycleManager {
  #tracks;
  #validators;
  #timeouts;
  #logger;
  #running = new Map();

  constructor({ tracks, validators, timeouts = {}, logger = silent }) {
    this.#tracks = tracks;
    this.#validators = validators;
    this.#timeouts = { ...DEFAULT_TIMEOUTS_MS, ...timeouts };
    this.#logger = logger;
  }

  /** Read-only reachability check, so callers can fail before any mutation begins. */
  async probe(exercise) {
    return this.#run("probe", exercise, async ({ driver, signal }) => {
      await driver.prepare({ exercise, signal });
      return { exerciseId: exercise.id };
    });
  }

  async activate(exercise) {
    return this.#run("activate", exercise, async ({ driver, signal }) => {
      await driver.prepare({ exercise, signal });
      const steps = await driver.setup({ exercise, signal });
      return { exerciseId: exercise.id, steps };
    });
  }

  async check(exercise) {
    return this.#run("check", exercise, async ({ driver, signal }) => {
      const query = driver.createQuery({ exercise, signal });
      const result = await runChecks(exercise.checks, {
        validators: this.#validators,
        context: { query, signal, exercise: { id: exercise.id, track: exercise.track } },
      });
      for (const c of result.checks)
        if (c.status === "error")
          this.#logger.warn(`[${exercise.id}] check "${c.id}" could not be evaluated:`, c.error);
      return { exerciseId: exercise.id, ...result };
    });
  }

  async reset(exercise) {
    return this.#run("reset", exercise, async ({ driver, signal }) => {
      await driver.prepare({ exercise, signal });
      const steps = await driver.reset({ exercise, signal });
      return { exerciseId: exercise.id, steps };
    });
  }

  async cleanup(exercise) {
    return this.#run("cleanup", exercise, async ({ driver, signal }) => {
      await driver.prepare({ exercise, signal });
      const steps = await driver.cleanup({ exercise, signal });
      return { exerciseId: exercise.id, steps };
    });
  }

  async #run(operation, exercise, fn) {
    const current = this.#running.get(exercise.id);
    if (current)
      throw new ConflictError(
        `Exercise "${exercise.id}" is busy (${current} in progress). Try again in a moment.`,
        { exerciseId: exercise.id, operation: current },
      );
    this.#running.set(exercise.id, operation);
    try {
      const driver = this.#tracks.get(exercise.track).driver;
      const signal = AbortSignal.timeout(this.#timeouts[operation]);
      return await fn({ driver, signal });
    } catch (error) {
      if (error instanceof FeatherLabError) throw error;
      this.#logger.error(`[${exercise.id}] ${operation} failed unexpectedly:`, error);
      throw new LifecycleError(operation, "unexpected", `The ${operation} operation failed.`, {
        cause: error,
      });
    } finally {
      this.#running.delete(exercise.id);
    }
  }
}
