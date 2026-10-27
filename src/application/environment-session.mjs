import {
  ConflictError,
  EnvironmentInUseError,
  InactiveExerciseError,
  LifecycleError,
} from "../core/errors.mjs";

/** In-process stand-in for ActiveEnvironmentRepository when persistence is not configured. */
export function createMemoryEnvironmentStore() {
  let record = null;
  return {
    get: () => record,
    set: ({ trackId, exerciseId, state }) => {
      record = { trackId, exerciseId, state, activatedAt: new Date().toISOString() };
    },
    clear: () => {
      record = null;
    },
  };
}

const silent = { warn() {} };

/**
 * Every exercise shares one practice cluster, so exactly one exercise owns it at a time.
 * The session records which one (and whether it is `ready` or still `preparing`) and
 * enforces:
 *
 *  - Opening a different exercise removes the previous owner's declared learner objects and
 *    its setup objects, then resets the new one. That covers everything an exercise
 *    declares; objects the learner created under other names are NOT removed and can
 *    still affect later exercises (see "Isolation contract" in docs/authoring.md).
 *  - Taking the cluster from a `ready` owner discards the learner's work there, so it needs
 *    explicit confirmation (`discardActive`); without it the request fails with
 *    EnvironmentInUseError and nothing is touched.
 *  - Reopening the `ready` owner keeps the learner's work, so a page reload or
 *    `featherlab stop` / `start` does not throw it away.
 *  - Baseline guard: right after a reset the exercise must NOT already pass. If it does,
 *    the environment is contaminated or the content is broken, and the exercise is not
 *    handed to the learner as ready.
 *  - Only the `ready` owner can be graded, so returning to a completed problem means
 *    solving it again rather than passing on stale state.
 *  - Operations are serialized across exercises: the cluster is shared, so a cleanup for
 *    one exercise must never interleave with a reset or check of another. A repeat request
 *    for an exercise that already has one pending is rejected (an identical open is joined).
 *
 * Recovery protocol. SQLite and the cluster cannot share a transaction, so a transition is
 * split at the point where mutation begins:
 *
 *   1. Probe (read-only). If the cluster cannot be reached, fail here: nothing changed, so
 *      the record is untouched and a `ready` owner keeps its work, still gradable.
 *   2. Journal: set the record to `preparing` (the exercise being torn down) BEFORE the first
 *      mutating command. From here on FeatherLab cannot prove what the cluster looks like.
 *   3. Mutate: cleanup of the previous owner, then `preparing` for the new exercise, reset,
 *      and the baseline check.
 *   4. Commit: set the new exercise to `ready`.
 *
 * Any failure or crash after step 2 leaves a `preparing` record naming the exercise whose
 * resources may still be in the cluster. That state is treated as possibly inconsistent, never
 * as intact: it is not graded or resumed, reopening it resets it, and opening another exercise
 * cleans it up first without asking (its work was already being discarded). A cluster that
 * drops out between steps 1 and 3 is caught by this same conservative rule.
 */
export class EnvironmentSession {
  #lifecycle;
  #registry;
  #store;
  #logger;
  #tail = Promise.resolve();
  #pending = new Map(); // exerciseId -> { key, operation, promise }

  constructor({ lifecycle, registry, store = createMemoryEnvironmentStore(), logger = silent }) {
    this.#lifecycle = lifecycle;
    this.#registry = registry;
    this.#store = store;
    this.#logger = logger;
  }

  /** @returns {{exerciseId: string, trackId: string, state: "preparing"|"ready"}|null} */
  get active() {
    return this.#store.get();
  }

  /**
   * @param {object} exercise
   * @param {{discardActive?: boolean}} [options] - confirm resetting another `ready` owner
   * @returns {Promise<{steps: string[], environment: "fresh"|"resumed"}>}
   */
  open(exercise, { discardActive = false } = {}) {
    return this.#exclusive("activate", exercise, discardActive, async () => {
      const active = this.#store.get();
      if (active?.exerciseId === exercise.id && active.state === "ready") {
        const { steps } = await this.#lifecycle.activate(exercise);
        return { steps, environment: "resumed" };
      }
      return {
        steps: await this.#takeOver(exercise, "activate", discardActive),
        environment: "fresh",
      };
    });
  }

  /** Reset always yields a clean environment for `exercise` and makes it the active one. */
  reset(exercise, { discardActive = false } = {}) {
    return this.#exclusive("reset", exercise, discardActive, async () => ({
      steps: await this.#takeOver(exercise, "reset", discardActive),
    }));
  }

  check(exercise) {
    return this.#exclusive("check", exercise, false, async () => {
      const active = this.#store.get();
      if (active?.exerciseId !== exercise.id || active.state !== "ready")
        throw new InactiveExerciseError(
          "This exercise is not the one loaded in the practice environment. Reopen it to get a fresh environment before checking.",
          { exerciseId: exercise.id },
        );
      return this.#lifecycle.check(exercise);
    });
  }

  cleanup(exercise) {
    return this.#exclusive("cleanup", exercise, false, async () => {
      await this.#lifecycle.probe(exercise);
      const active = this.#store.get();
      if (active?.exerciseId === exercise.id) this.#store.set({ ...active, state: "preparing" });
      const outcome = await this.#lifecycle.cleanup(exercise);
      if (active?.exerciseId === exercise.id) this.#store.clear();
      return outcome;
    });
  }

  async #takeOver(exercise, operation, discardActive) {
    const steps = [];
    const active = this.#store.get();
    const switching = active !== null && active.exerciseId !== exercise.id;
    const previous = switching ? this.#registry.get(active.exerciseId) : undefined;
    if (switching && active.state === "ready" && !discardActive)
      throw new EnvironmentInUseError(
        `"${previous?.title ?? active.exerciseId}" is loaded in the practice environment. Opening "${exercise.title}" resets that exercise's cluster resources; your progress and history stay saved.`,
        { activeExerciseId: active.exerciseId },
      );

    // 1. Probe: fail before any mutation, leaving the record (and a ready owner) untouched.
    await this.#lifecycle.probe(exercise);

    // 2. Journal: from the first mutating command on, the cluster state is not provable.
    if (switching) {
      this.#store.set({ ...active, state: "preparing" });
      if (previous) steps.push(...(await this.#lifecycle.cleanup(previous)).steps);
      else
        this.#logger.warn(
          `Previously active exercise "${active.exerciseId}" is no longer installed; its resources were not cleaned up.`,
        );
    }
    // 3. Mutate.
    this.#store.set({ trackId: exercise.track, exerciseId: exercise.id, state: "preparing" });
    steps.push(...(await this.#lifecycle.reset(exercise)).steps);
    const baseline = await this.#lifecycle.check(exercise);
    if (baseline.success)
      throw new LifecycleError(
        operation,
        "baseline",
        `"${exercise.title}" already passes before any work was done, so it cannot be graded fairly. Reset it to try again; if this persists the exercise content is not resetting its own resources.`,
        { completed: steps },
      );
    // 4. Commit.
    this.#store.set({ trackId: exercise.track, exerciseId: exercise.id, state: "ready" });
    return steps;
  }

  #exclusive(operation, exercise, discardActive, fn) {
    // Only an identical open is joined: a confirmed open must not inherit the
    // EnvironmentInUseError of an unconfirmed one still pending.
    const key = `${operation}:${discardActive}`;
    const pending = this.#pending.get(exercise.id);
    if (pending) {
      if (operation === "activate" && pending.key === key) return pending.promise;
      return Promise.reject(
        new ConflictError(
          `Exercise "${exercise.id}" is busy (${pending.operation} in progress). Try again in a moment.`,
          { exerciseId: exercise.id, operation: pending.operation },
        ),
      );
    }
    const promise = this.#tail.then(fn).finally(() => {
      if (this.#pending.get(exercise.id)?.promise === promise) this.#pending.delete(exercise.id);
    });
    this.#tail = promise.catch(() => {});
    this.#pending.set(exercise.id, { key, operation, promise });
    return promise;
  }
}
