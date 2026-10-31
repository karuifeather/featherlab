import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.mjs";
import { IsolatedEnvironment } from "../helpers/isolated-environment.mjs";
import { createKubectlFacade } from "../helpers/level0-scenarios.mjs";

/**
 * The Level 3 (M5.5) circuit against a real, disposable kind cluster.
 *
 * Opt-in (FEATHERLAB_KIND_TESTS=1; needs Docker and kind). Mirrors the structure of
 * level2-circuit.test.mjs: for each exercise, activate → baseline failed → reference
 * solution → passed → each variant fails exactly the listed checks.
 *
 * Scenario helpers live in level3-*-scenarios.mjs files. This file aggregates them all
 * and is the only integration entry point for Level 3.
 */
const enabled = process.env.FEATHERLAB_KIND_TESTS === "1";
const options = {
  skip: enabled ? false : "set FEATHERLAB_KIND_TESTS=1 (needs Docker and kind)",
};
const quiet = { warn() {}, error() {} };
const confirmed = { discardActive: true };

let env;
let app;
let k;

before(() => {
  if (!enabled) return;
  env = new IsolatedEnvironment({ log: console }).start();
  app = createApp({
    workstation: env.config.workstation,
    cluster: env.config.cluster,
    stateDir: env.config.stateDir,
    logger: quiet,
  });
  k = createKubectlFacade((args, { input } = {}) =>
    input === undefined ? env.kubectl(...args) : env.kubectlWithInput(input, ...args),
  );
});

after(() => {
  app?.persistence?.close();
  env?.teardown();
});

const failingIds = (result) =>
  result.checks
    .filter((c) => !c.passed)
    .map((c) => c.id)
    .sort();

const describeFailures = (result) =>
  JSON.stringify(result.checks.filter((c) => !c.passed).map((c) => [c.id, c.feedback]));

function unlock(id) {
  const exercise = app.registry.get(id);
  if (!exercise) return;
  for (const prereq of exercise.prerequisites) {
    if (app.service.getExerciseProgress(prereq).completed) continue;
    unlock(prereq);
    app.persistence.progress.upsert({
      exerciseId: prereq,
      trackId: "kubernetes",
      completed: true,
      firstCompletedAt: new Date().toISOString(),
    });
  }
}

// Import all scenario helpers. Errors here mean a required file is missing or broken.
const { LEVEL3_AB_SCENARIOS } = await import("../helpers/level3-a-b-scenarios.mjs");
const { LEVEL3_CD_SCENARIOS } = await import("../helpers/level3-c-d-scenarios.mjs");
const { LEVEL3_EF_SCENARIOS } = await import("../helpers/level3-e-f-scenarios.mjs");

const SCENARIOS = { ...LEVEL3_AB_SCENARIOS, ...LEVEL3_CD_SCENARIOS, ...LEVEL3_EF_SCENARIOS };

const EXPECTED_IDS = [
  "k8s-0054",
  "k8s-0055",
  "k8s-0056",
  "k8s-0057",
  "k8s-0058",
  "k8s-0059",
  "k8s-0060",
  "k8s-0061",
  "k8s-0062",
  "k8s-0063",
  "k8s-0064",
  "k8s-0065",
  "k8s-0066",
  "k8s-0067",
  "k8s-0068",
  "k8s-0069",
  "k8s-0070",
  "k8s-0071",
  "k8s-0072",
  "k8s-0073",
  "k8s-0074",
  "k8s-0075",
  "k8s-0076",
  "k8s-0077",
  "k8s-0078",
];

const missing = EXPECTED_IDS.filter((id) => !SCENARIOS[id]);
if (missing.length > 0) throw new Error(`Level 3 scenarios missing for: ${missing.join(", ")}`);

for (const [id, scenario] of Object.entries(SCENARIOS)) {
  test(`${id}: activate, baseline, solve, variants, switch, revisit`, options, async () => {
    const { service, registry } = app;
    const exercise = registry.get(id);
    if (!exercise) throw new Error(`Exercise ${id} not in registry`);
    unlock(id);

    // Activate — fresh exercise.
    const opened = await service.activate(id, confirmed);
    assert.equal(opened.environment, "fresh");

    // Verify initial state if declared.
    for (const [resource, name, ns] of scenario.initial ?? []) {
      const output = k.run("get", resource, name, "-n", ns, "--ignore-not-found");
      assert.match(output, new RegExp(name), `${resource}/${name} not found after setup`);
    }

    // Baseline must fail.
    const baseline = await service.check(id);
    assert.equal(baseline.outcome, "failed", `baseline should fail: ${describeFailures(baseline)}`);

    // Reference solution.
    await scenario.solve(k);
    const solved = await service.check(id);
    assert.equal(solved.outcome, "passed", `solution should pass: ${describeFailures(solved)}`);

    // Each variant must fail exactly the expected checks.
    for (const variant of scenario.variants ?? []) {
      await service.activate(id, confirmed); // reset
      await variant.run(k);
      const result = await service.check(id);
      assert.deepEqual(
        failingIds(result),
        [...variant.failing].sort(),
        `variant "${variant.name}": unexpected failures: ${describeFailures(result)}`,
      );
    }

    // Switch to a different exercise and come back — progress should be preserved.
    const others = registry.list({ track: "kubernetes", level: 0 });
    if (others.length > 0) {
      const other = others[0].id;
      await service.activate(other, confirmed);
      const revisit = await service.activate(id, confirmed);
      assert.equal(revisit.environment, "resumed", "expected resumed environment on revisit");
    }
  });
}
