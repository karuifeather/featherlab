import { InputError, NotFoundError } from "../core/errors.mjs";
import { ID_PATTERN } from "../core/exercises/definition.mjs";
import {
  presentExercise,
  presentHint,
  presentOperation,
  presentResult,
  presentSummary,
} from "./presenters.mjs";

/**
 * Application service: the use cases the API (and CLI) invoke. It validates input,
 * resolves exercises, delegates to the lifecycle manager, and returns presentation-safe
 * data. It contains no HTTP and no Kubernetes knowledge.
 */
export class ExerciseService {
  #registry;
  #lifecycle;

  constructor({ registry, lifecycle }) {
    this.#registry = registry;
    this.#lifecycle = lifecycle;
  }

  #find(id) {
    if (typeof id !== "string" || id.length > 63 || !ID_PATTERN.test(id))
      throw new NotFoundError("Exercise not found.", { id: String(id).slice(0, 63) });
    return this.#registry.require(id);
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

  async activate(id) {
    const exercise = this.#find(id);
    const outcome = await this.#lifecycle.activate(exercise);
    return { exercise: presentExercise(exercise), ...presentOperation(exercise, outcome) };
  }

  async check(id) {
    const exercise = this.#find(id);
    return presentResult(await this.#lifecycle.check(exercise));
  }

  async reset(id) {
    const exercise = this.#find(id);
    return presentOperation(exercise, await this.#lifecycle.reset(exercise));
  }

  async cleanup(id) {
    const exercise = this.#find(id);
    return presentOperation(exercise, await this.#lifecycle.cleanup(exercise));
  }

  get exerciseCount() {
    return this.#registry.size;
  }
}
