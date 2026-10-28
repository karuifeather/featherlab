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
 *  - Opening a different exercise cleans up the previous owner, then resets the new one. For
 *    the Kubernetes track that deletes and recreates the exercises' own namespaces, which
 *    removes every namespaced object in them, declared or not. Cluster-scoped objects and
 *    other namespaces are never touched (see "Isolation contract" in docs/authoring.md).
 *  - Taking the cluster from a `ready` owner discards the learner's work there, so it needs
 *    explicit confirmation (`discardActive`); without it the request fails with
 *    EnvironmentInUseError and nothing is touched.
 *  - Reopening the `ready` owner keeps the learner's work, so a page reload or
 *    `featherlab stop` / `start` does not throw it away. It is read-only. If the probe finds
 *    the exercise's environment missing (an older layout, or removed by hand), there is no
 *    work left to keep and the exercise is prepared again (`recreated: true`).
 *  - Ownership guard: if the probe reports blockers (an exercise resource FeatherLab does not
 *    own and would refuse to delete), the operation fails before any mutation.
 *  - Baseline guard: right after a reset the exercise's checks must run and report
 *    `failed`. If they pass, the environment is contaminated or the content is broken; if
 *    they cannot be evaluated, the starting state is unproven. Either way the exercise is
 *    not handed to the learner as ready.
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
        // Resuming is read-only: re-applying setup would undo a learner's fix.
        const probe = await this.#lifecycle.probe(exercise);
        if (probe.intact) return { steps: [], environment: "resumed" };
        // The record says ready, but the exercise's environment is not there (created by an
        // older FeatherLab layout, or removed by hand). Nothing of it is left to keep, so it is
        // prepared again from scratch rather than trusted.
        this.#logger.warn(
          `Exercise "${exercise.id}" was recorded as ready but its environment is missing; preparing it again.`,
        );
        return {
          steps: await this.#takeOver(exercise, "activate", discardActive, probe),
          environment: "fresh",
          recreated: true,
        };
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
      const { blockers } = await this.#lifecycle.probe(exercise);
      if (blockers.length > 0)
        throw new LifecycleError("cleanup", "ownership", blockers.join(" "), { completed: [] });
      const active = this.#store.get();
      if (active?.exerciseId === exercise.id) this.#store.set({ ...active, state: "preparing" });
      const outcome = await this.#lifecycle.cleanup(exercise);
      if (active?.exerciseId === exercise.id) this.#store.clear();
      return outcome;
    });
  }

  async #takeOver(exercise, operation, discardActive, probed) {
    const steps = [];
    const active = this.#store.get();
    const switching = active !== null && active.exerciseId !== exercise.id;
    const previous = switching ? this.#registry.get(active.exerciseId) : undefined;
    if (switching && active.state === "ready" && !discardActive)
      throw new EnvironmentInUseError(
        `"${previous?.title ?? active.exerciseId}" is loaded in the practice environment. Opening "${exercise.title}" resets that exercise's cluster resources; your progress and history stay saved.`,
        { activeExerciseId: active.exerciseId },
      );

    // 1. Probe (read-only): fail before any mutation, leaving the record (and a ready owner)
    //    untouched. That includes resources the cleanup or reset would refuse to delete.
    const probes = [probed ?? (await this.#lifecycle.probe(exercise))];
    if (previous) probes.unshift(await this.#lifecycle.probe(previous));
    const blockers = probes.flatMap((p) => p.blockers ?? []);
    if (blockers.length > 0)
      throw new LifecycleError(operation, "ownership", blockers.join(" "), { completed: [] });

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
    if (baseline.outcome === "passed")
      throw new LifecycleError(
        operation,
        "baseline",
        `"${exercise.title}" already passes before any work was done, so it cannot be graded fairly. Reset it to try again; if this persists the exercise content is not resetting its own resources.`,
        { completed: steps },
      );
    // An unevaluable baseline proves nothing about the starting state: do not commit it.
    if (baseline.outcome !== "failed")
      throw new LifecycleError(
        operation,
        "baseline",
        `The starting state of "${exercise.title}" could not be verified because the cluster could not be read. Reset it to try again.`,
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
