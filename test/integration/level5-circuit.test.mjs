import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.mjs";
import { IsolatedEnvironment } from "../helpers/isolated-environment.mjs";
import { createKubectlFacade } from "../helpers/level0-scenarios.mjs";

/**
 * The Level 5 (M5.7) circuit against a real, disposable kind cluster.
 *
 * Opt-in (FEATHERLAB_KIND_TESTS=1; needs Docker and kind). Mirrors the structure of
 * level4-circuit.test.mjs: for each exercise, activate → baseline failed → reference
 * solution → passed → each variant fails exactly the listed checks.
 *
 * Scenario helpers live in level5-*-scenarios.mjs files. This file aggregates them all.
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

// Import all scenario helpers.
const { LEVEL5_A_SCENARIOS, LEVEL5_B_SCENARIOS } =
  await import("../helpers/level5-a-b-scenarios.mjs");
const { LEVEL5_C_SCENARIOS } = await import("../helpers/level5-c-scenarios.mjs");
const { LEVEL5_D_SCENARIOS, LEVEL5_E_SCENARIOS } =
  await import("../helpers/level5-d-e-scenarios.mjs");
const { LEVEL5_F_SCENARIOS, LEVEL5_G_SCENARIOS } =
  await import("../helpers/level5-f-g-scenarios.mjs");

const SCENARIOS = {
  ...LEVEL5_A_SCENARIOS,
  ...LEVEL5_B_SCENARIOS,
  ...LEVEL5_C_SCENARIOS,
  ...LEVEL5_D_SCENARIOS,
  ...LEVEL5_E_SCENARIOS,
  ...LEVEL5_F_SCENARIOS,
  ...LEVEL5_G_SCENARIOS,
};

const EXPECTED_IDS = [
  "k8s-0098",
  "k8s-0099",
  "k8s-0100",
  "k8s-0101",
  "k8s-0102",
  "k8s-0103",
  "k8s-0104",
  "k8s-0105",
  "k8s-0106",
  "k8s-0107",
  "k8s-0108",
  "k8s-0109",
  "k8s-0110",
  "k8s-0111",
  "k8s-0112",
  "k8s-0113",
  "k8s-0114",
  "k8s-0115",
  "k8s-0116",
  "k8s-0117",
  "k8s-0118",
  "k8s-0119",
  "k8s-0120",
  "k8s-0121",
  "k8s-0122",
  "k8s-0123",
  "k8s-0124",
];

const missing = EXPECTED_IDS.filter((id) => !SCENARIOS[id]);
if (missing.length > 0) throw new Error(`Level 5 scenarios missing for: ${missing.join(", ")}`);

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
      await service.reset(id); // full namespace teardown and re-setup
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
      assert.equal(
        revisit.environment,
        "fresh",
        "expected fresh environment after switching away and back",
      );
    }
  });
}
