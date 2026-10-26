import { ID_PATTERN } from "../exercises/definition.mjs";
import { check } from "../schema.mjs";

/**
 * A validator is a pure function from declarative params and a grading context to a
 * result. It reads state only through `ctx.query`.
 *
 * @typedef {Object} ValidatorDefinition
 * @property {string} type         Unique, namespaced by track (e.g. "k8s.pod-ready").
 * @property {string|null} track   Track that provides `ctx.query`, or null if track-independent.
 * @property {(params: object, ctx: {problems: Problems, validateCheck: Function}) => void} validateParams
 *   Load-time validation. Record defects on `ctx.problems`.
 * @property {(params: object, ctx: GradingContext) => Promise<ValidatorResult>} run
 *
 * @typedef {Object} ValidatorResult
 * @property {boolean} passed
 * @property {string} feedback     Learner-visible. Describe what was observed; do not
 *   disclose reference solutions.
 * @property {object} [details]    Diagnostics for logs/tests. Never sent to the browser.
 *
 * @typedef {Object} GradingContext
 * @property {object} query                Track-specific read-only state adapter.
 * @property {AbortSignal} [signal]
 * @property {(check: object) => Promise<CheckResult>} evaluate   Run a nested check (combinators).
 */
export class ValidatorRegistry {
  #byType = new Map();

  constructor(definitions = []) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition) {
    const { type } = definition;
    if (typeof type !== "string" || !/^[a-z0-9]+(\.[a-z0-9-]+|-[a-z0-9]+)*$/.test(type))
      throw new Error(`Invalid validator type "${type}".`);
    if (this.#byType.has(type)) throw new Error(`Validator "${type}" registered twice.`);
    if (typeof definition.run !== "function" || typeof definition.validateParams !== "function")
      throw new Error(`Validator "${type}" must define validateParams() and run().`);
    this.#byType.set(type, Object.freeze({ ...definition }));
    return this;
  }

  get(type) {
    return this.#byType.get(type);
  }

  types() {
    return [...this.#byType.keys()];
  }

  /**
   * Load-time validation of one check against the registry. Nested combinator children
   * pass through here too, with `nested: true` (id/label optional).
   */
  validateCheck(checkDef, { track, problems, path, nested = false }) {
    // Shape errors for non-objects are reported by the enclosing schema check.
    if (typeof checkDef !== "object" || checkDef === null || Array.isArray(checkDef)) return;
    if (nested) {
      check(
        checkDef,
        {
          type: "object",
          properties: {
            id: { type: "string", pattern: ID_PATTERN },
            type: { type: "string", required: true },
            label: { type: "string" },
            params: { type: "object", open: true },
          },
        },
        path,
        problems,
      );
    }
    if (typeof checkDef.type !== "string") return;
    const definition = this.#byType.get(checkDef.type);
    if (!definition) {
      problems.add(
        `${path}.type`,
        `unknown validator "${checkDef.type}" (available: ${this.types().join(", ")})`,
      );
      return;
    }
    if (definition.track !== null && definition.track !== track) {
      problems.add(
        `${path}.type`,
        `validator "${checkDef.type}" belongs to track "${definition.track}", not "${track}"`,
      );
      return;
    }
    const scoped = problems.scoped(`${path}.params`);
    definition.validateParams(checkDef.params ?? {}, {
      problems: scoped,
      validateCheck: (child, childPath) =>
        this.validateCheck(child, {
          track,
          problems: problems.scoped(`${path}.params`),
          path: childPath,
          nested: true,
        }),
    });
  }
}
