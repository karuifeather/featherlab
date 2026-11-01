import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.mjs";
import { IsolatedEnvironment } from "../helpers/isolated-environment.mjs";
import { createKubectlFacade } from "../helpers/level0-scenarios.mjs";

/**
 * The Level 7 (M5.9) circuit against a real, disposable kind cluster.
 *
 * Opt-in (FEATHERLAB_KIND_TESTS=1; needs Docker and kind). Mirrors the structure of
 * level6-circuit.test.mjs: for each exercise, activate → baseline failed → reference
 * solution → passed → each variant fails exactly the listed checks.
 *
 * Level 7 uses the kind-networkpolicy profile. kindnet (the default kind CNI since
 * v0.33.0) enforces standard Kubernetes NetworkPolicy natively — no extra CNI
 * installation step is required (unlike level6 which installs Traefik/Gateway API).
 *
 * Scenario helpers live in test/helpers/level7-*-scenarios.mjs.
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

/**
 * Poll service.check until the checks that are NOT in expectedFailing all pass (i.e.,
 * the result has converged). Returns the last result whether or not convergence happened.
 * This handles the inevitable lag between a kubectl apply and kindnet programming its
 * iptables rules, without rewriting every scenario's solve() or variant run().
 */
async function settle(id, expectedFailing = []) {
  let result;
  try {
    await k.until(`${id} converges`, async () => {
      result = await app.service.check(id);
      return result.checks.every((c) => c.passed || expectedFailing.includes(c.id));
    });
  } catch {
    // Timed out — return whatever the last check produced so the assertion below gives
    // the caller a useful failure message.
  }
  return result;
}

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
const { LEVEL7_A_SCENARIOS } = await import("../helpers/level7-a-scenarios.mjs");
const { LEVEL7_B_SCENARIOS } = await import("../helpers/level7-b-scenarios.mjs");
const { LEVEL7_C_SCENARIOS } = await import("../helpers/level7-c-scenarios.mjs");
const { LEVEL7_D_SCENARIOS } = await import("../helpers/level7-d-scenarios.mjs");
const { LEVEL7_E_SCENARIOS } = await import("../helpers/level7-e-scenarios.mjs");

const SCENARIOS = {
  ...LEVEL7_A_SCENARIOS,
  ...LEVEL7_B_SCENARIOS,
  ...LEVEL7_C_SCENARIOS,
  ...LEVEL7_D_SCENARIOS,
  ...LEVEL7_E_SCENARIOS,
};

const EXPECTED_IDS = [
  // Circuit A: Default traffic model, default-deny ingress, pod selectors, port restrictions, policy union
  "k8s-0151",
  "k8s-0152",
  "k8s-0153",
  "k8s-0154",
  "k8s-0155",
  // Circuit B: Default-deny egress, DNS allow, service egress, label isolation, egress union
  "k8s-0156",
  "k8s-0157",
  "k8s-0158",
  "k8s-0159",
  "k8s-0160",
  // Circuit C: Namespace selectors, combined selectors, namespace isolation, diagnostics
  "k8s-0161",
  "k8s-0162",
  "k8s-0163",
  "k8s-0164",
  "k8s-0165",
  // Circuit D: Bidirectional isolation, least-privilege, policyTypes bug, multi-tier
  "k8s-0166",
  "k8s-0167",
  "k8s-0168",
  "k8s-0169",
  // Circuit E: Protocol/port restrictions, named ports, egress ports, least-privilege review
  "k8s-0170",
  "k8s-0171",
  "k8s-0172",
  "k8s-0173",
  // Mastery
  "k8s-0174",
];

const missing = EXPECTED_IDS.filter((id) => !SCENARIOS[id]);
if (missing.length > 0) throw new Error(`Level 7 scenarios missing for: ${missing.join(", ")}`);

for (const [id, scenario] of Object.entries(SCENARIOS)) {
  test(`${id}: activate, baseline, solve, variants`, options, async () => {
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
    const solved = await settle(id);
    assert.equal(solved.outcome, "passed", `solution should pass: ${describeFailures(solved)}`);

    // Each variant must fail exactly the expected checks.
    for (const variant of scenario.variants ?? []) {
      await service.reset(id);
      await variant.run(k);
      const result = await settle(id, variant.failing);
      assert.deepEqual(
        failingIds(result),
        [...variant.failing].sort(),
        `variant "${variant.name}": unexpected failures: ${describeFailures(result)}`,
      );
    }
  });
}
