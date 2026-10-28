import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.mjs";
import { IsolatedEnvironment } from "../helpers/isolated-environment.mjs";
import { createKubectlFacade } from "../helpers/level0-scenarios.mjs";
import { LEVEL2_SCENARIOS } from "../helpers/level2-scenarios.mjs";

/**
 * The Level 2 (M5.4) circuit against a real, disposable kind cluster.
 *
 * Opt-in (FEATHERLAB_KIND_TESTS=1; needs Docker and kind). Mirrors the structure of
 * level0-circuit.test.mjs: for each exercise, activate → baseline `failed` → reference
 * solution → `passed` → each variant fails exactly the listed checks.
 *
 * Infrastructure reliability tests (namespace isolation, ownership checks, crash recovery)
 * are already covered by level0-circuit.test.mjs and are not duplicated here.
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

const namespaceExists = (name) =>
  k.run("get", "namespaces", "-o", "name").split("\n").includes(`namespace/${name}`);

for (const [id, scenario] of Object.entries(LEVEL2_SCENARIOS)) {
  test(`${id}: activate, baseline, solve, variants, switch, revisit`, options, async () => {
    const { service, registry } = app;
    const exercise = registry.get(id);
    unlock(id);

    // Activate — fresh exercise.
    const opened = await service.activate(id, confirmed);
    assert.equal(opened.environment, "fresh");

    // Initial objects from setup must exist.
    for (const [kind, name, ns] of scenario.initial)
      assert.match(k.run("get", kind, name, "-n", ns, "-o", "name"), new RegExp(name));

    // Baseline must be failed (exercise is unsolved before any learner action).
    const baseline = await service.check(id);
    assert.equal(baseline.outcome, "failed", describeFailures(baseline));

    // Reference solution must pass all checks.
    await scenario.solve(k);
    const solved = await service.check(id);
    assert.equal(solved.outcome, "passed", describeFailures(solved));
    assert.equal(solved.progress.completed, true);

    // Alternatives (when present) must also pass after a reset.
    for (const alternative of scenario.alternatives ?? []) {
      await service.reset(id);
      await alternative.run(k);
      const result = await service.check(id);
      assert.equal(result.outcome, "passed", `${alternative.name}: ${describeFailures(result)}`);
    }

    // Each variant starts from a fresh baseline and must fail exactly the listed checks.
    for (const variant of scenario.variants) {
      await service.reset(id);
      assert.equal((await service.check(id)).outcome, "failed", "reset restores the baseline");
      await variant.run(k);
      const result = await service.check(id);
      assert.equal(result.outcome, "failed", `${variant.name}: expected failed but got passed`);
      assert.deepEqual(failingIds(result), [...variant.failing].sort(), variant.name);
    }

    // Switching away removes this exercise's namespaces.
    const other = id === "k8s-0035" ? "k8s-0036" : "k8s-0035";
    unlock(other);
    await service.activate(other, confirmed);
    for (const ns of exercise.lifecycle.namespaces)
      assert.equal(namespaceExists(ns), false, `${ns} removed on switch`);

    // Revisiting starts unsolved; completion record is intact.
    assert.equal((await service.activate(id, confirmed)).environment, "fresh");
    const revisit = await service.check(id);
    assert.equal(revisit.outcome, "failed", "a completed exercise must be solved again");
    assert.equal(revisit.progress.completed, true, "completion is never revoked");
  });
}
