import { check } from "../schema.mjs";

/**
 * Track-independent validators that compose other checks. They let an exercise accept
 * several valid solutions ("any-of") or group requirements ("all-of") declaratively.
 */

function validateChildren(params, { problems, validateCheck }) {
  check(
    params,
    {
      type: "object",
      properties: {
        checks: { type: "array", required: true, minItems: 1, items: { type: "object" } },
      },
    },
    "",
    problems,
  );
  if (Array.isArray(params.checks))
    params.checks.forEach((child, i) => validateCheck(child, `checks[${i}]`));
}

async function evaluateAll(params, ctx) {
  const results = [];
  for (const child of params.checks) results.push(await ctx.evaluate(child));
  // An infrastructure error in a child means we cannot tell whether the group holds.
  return results;
}

export const allOf = {
  type: "all-of",
  track: null,
  validateParams: validateChildren,
  async run(params, ctx) {
    const results = await evaluateAll(params, ctx);
    const failed = results.filter((r) => !r.passed);
    const errored = failed.find((r) => r.status === "error");
    if (errored) throw errored.error;
    return {
      passed: failed.length === 0,
      feedback:
        failed.length === 0
          ? "All conditions are satisfied."
          : failed.map((r) => r.feedback).join(" "),
      details: { children: results.map(summarize) },
    };
  },
};

export const anyOf = {
  type: "any-of",
  track: null,
  validateParams: validateChildren,
  async run(params, ctx) {
    const results = await evaluateAll(params, ctx);
    const winner = results.find((r) => r.passed);
    if (winner)
      return {
        passed: true,
        feedback: winner.feedback,
        details: { children: results.map(summarize) },
      };
    const errored = results.find((r) => r.status === "error");
    if (errored) throw errored.error;
    return {
      passed: false,
      feedback: `None of the accepted alternatives is satisfied: ${results.map((r) => r.feedback).join(" | ")}`,
      details: { children: results.map(summarize) },
    };
  },
};

function summarize(result) {
  return { type: result.type, status: result.status, feedback: result.feedback };
}

export const combinators = [allOf, anyOf];
