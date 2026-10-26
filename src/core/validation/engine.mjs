import { FeatherLabError } from "../errors.mjs";

/**
 * @typedef {Object} CheckResult
 * @property {string} id
 * @property {string} type
 * @property {string} label
 * @property {number} weight
 * @property {boolean} hidden
 * @property {"passed"|"failed"|"error"} status   "error" = could not be evaluated
 * @property {boolean} passed
 * @property {number} earned                      weight if passed, else 0
 * @property {string} feedback
 * @property {object} [details]                   internal diagnostics
 * @property {Error} [error]                      internal; present when status === "error"
 *
 * @typedef {Object} GradingResult
 * @property {"passed"|"failed"|"incomplete"} outcome
 *   incomplete = at least one check could not be evaluated, so a failure is not trustworthy.
 * @property {boolean} success
 * @property {{earned: number, possible: number, percent: number}} score
 * @property {{total: number, passed: number, failed: number, errored: number}} counts
 * @property {CheckResult[]} checks
 */

const GENERIC_FAILURE = "This check could not be completed.";

/** Evaluate a single check definition. Never throws. */
export async function evaluateCheck(definition, { validators, context }) {
  const base = {
    id: definition.id ?? "",
    type: definition.type,
    label: definition.label ?? definition.type,
    weight: definition.weight ?? 1,
    hidden: definition.hidden === true,
  };
  try {
    const validator = validators.get(definition.type);
    if (!validator) throw new Error(`Validator "${definition.type}" is not registered.`);
    const outcome = await validator.run(definition.params ?? {}, {
      ...context,
      evaluate: (child) => evaluateCheck(child, { validators, context }),
    });
    const passed = outcome?.passed === true;
    return {
      ...base,
      status: passed ? "passed" : "failed",
      passed,
      earned: passed ? base.weight : 0,
      feedback: String(outcome?.feedback ?? ""),
      details: outcome?.details,
    };
  } catch (error) {
    return {
      ...base,
      status: "error",
      passed: false,
      earned: 0,
      feedback: error instanceof FeatherLabError ? error.message : GENERIC_FAILURE,
      details: { error: error?.message },
      error,
    };
  }
}

/** Run every check (isolated from each other) and aggregate weighted partial credit. */
export async function runChecks(checks, deps) {
  const results = [];
  for (const definition of checks) results.push(await evaluateCheck(definition, deps));
  return aggregate(results);
}

export function aggregate(results) {
  const possible = results.reduce((sum, r) => sum + r.weight, 0);
  const earned = results.reduce((sum, r) => sum + r.earned, 0);
  const counts = {
    total: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    errored: results.filter((r) => r.status === "error").length,
  };
  const success = counts.total > 0 && counts.passed === counts.total;
  return {
    outcome: success ? "passed" : counts.errored > 0 ? "incomplete" : "failed",
    success,
    score: {
      earned: round(earned),
      possible: round(possible),
      percent: possible === 0 ? 0 : Math.round((earned / possible) * 100),
    },
    counts,
    checks: results,
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}
