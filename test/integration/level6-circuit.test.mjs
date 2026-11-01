import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.mjs";
import { IsolatedEnvironment } from "../helpers/isolated-environment.mjs";
import { createKubectlFacade } from "../helpers/level0-scenarios.mjs";
import { installRouting } from "../../src/tracks/kubernetes/routing/install.mjs";
import { run } from "../../src/lib/runtime.mjs";

/**
 * The Level 6 (M5.8) circuit against a real, disposable kind cluster with Traefik.
 *
 * Opt-in (FEATHERLAB_KIND_TESTS=1; needs Docker and kind). Mirrors the structure of
 * level5-circuit.test.mjs: for each exercise, activate → baseline failed → reference
 * solution → passed → each variant fails exactly the listed checks.
 *
 * The before() hook installs the full routing stack (Gateway API CRDs + Traefik + GatewayClass)
 * using the host-side kubeconfig before creating the app. Exercises with profile: kind-routing
 * use lifecycle.mjs's ensureRoutingInstalled(), which skips installation if Traefik is already
 * running — so this setup and the lifecycle path are both idempotent.
 *
 * Scenario helpers live in test/helpers/level6-*-scenarios.mjs.
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

  // Install routing stack via host kubeconfig (not the workstation container).
  // installRouting is synchronous — it uses execFileSync internally.
  const hostExec = (binary, args, opts = {}) =>
    run(binary, args, {
      ...opts,
      env: {
        ...process.env,
        KUBECONFIG: env.config.stateDir + "/host-kubeconfig",
      },
    });
  installRouting({ exec: hostExec, log: console });

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
 * This handles the inevitable lag between a kubectl apply and Traefik picking it up,
 * without rewriting every scenario's solve() or variant run().
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
const { LEVEL6_A_SCENARIOS } = await import("../helpers/level6-a-scenarios.mjs");
const { LEVEL6_B_SCENARIOS } = await import("../helpers/level6-b-scenarios.mjs");
const { LEVEL6_C_SCENARIOS, LEVEL6_D_SCENARIOS } =
  await import("../helpers/level6-c-d-scenarios.mjs");
const { LEVEL6_E_SCENARIOS, LEVEL6_F_SCENARIOS } =
  await import("../helpers/level6-e-f-scenarios.mjs");

const SCENARIOS = {
  ...LEVEL6_A_SCENARIOS,
  ...LEVEL6_B_SCENARIOS,
  ...LEVEL6_C_SCENARIOS,
  ...LEVEL6_D_SCENARIOS,
  ...LEVEL6_E_SCENARIOS,
  ...LEVEL6_F_SCENARIOS,
};

const EXPECTED_IDS = [
  // Circuit A: Ingress
  "k8s-0125",
  "k8s-0126",
  "k8s-0127",
  "k8s-0128",
  "k8s-0129",
  // Circuit B: Gateway API
  "k8s-0130",
  "k8s-0131",
  "k8s-0132",
  "k8s-0133",
  "k8s-0134",
  "k8s-0135",
  // Circuit C: HTTP Matching
  "k8s-0136",
  "k8s-0137",
  "k8s-0138",
  "k8s-0139",
  // Circuit D: TLS
  "k8s-0140",
  "k8s-0141",
  "k8s-0142",
  "k8s-0143",
  // Circuit E: Cross-namespace
  "k8s-0144",
  "k8s-0145",
  "k8s-0146",
  "k8s-0147",
  // Circuit F: Weighted routing
  "k8s-0148",
  "k8s-0149",
  // Mastery
  "k8s-0150",
];

const missing = EXPECTED_IDS.filter((id) => !SCENARIOS[id]);
if (missing.length > 0) throw new Error(`Level 6 scenarios missing for: ${missing.join(", ")}`);

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
