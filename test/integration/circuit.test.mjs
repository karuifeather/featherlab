/**
 * Full exercise circuit against a single real, disposable kind cluster.
 *
 * Opt-in (FEATHERLAB_KIND_TESTS=1; needs Docker and kind). Provisions one
 * `featherlab-test-<id>` cluster for all levels, runs every exercise end-to-end, then
 * tears it down. It never addresses the learner's `featherlab` cluster, ~/.featherlab or
 * ~/.kube/config.
 *
 * Each level runs in a describe() block so failures show the level name. Level 6 installs
 * Traefik in its own before() — levels 0–5 run on an unmodified cluster. Infrastructure
 * reliability tests (namespace isolation, ownership, crash recovery) live in the Level 0
 * section; they are not repeated for later levels.
 */

import test, { before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createApp } from "../../src/app.mjs";
import { EXERCISE_LABEL, MANAGED_BY_LABEL } from "../../src/tracks/kubernetes/lifecycle.mjs";
import { installRouting } from "../../src/tracks/kubernetes/routing/install.mjs";
import { run } from "../../src/lib/runtime.mjs";
import {
  assertTestWorkstation,
  fingerprint,
  IsolatedEnvironment,
} from "../helpers/isolated-environment.mjs";
import { createKubectlFacade, LEVEL0_SCENARIOS } from "../helpers/level0-scenarios.mjs";
import { LEVEL2_SCENARIOS } from "../helpers/level2-scenarios.mjs";
import { LEVEL3_AB_SCENARIOS } from "../helpers/level3-a-b-scenarios.mjs";
import { LEVEL3_CD_SCENARIOS } from "../helpers/level3-c-d-scenarios.mjs";
import { LEVEL3_EF_SCENARIOS } from "../helpers/level3-e-f-scenarios.mjs";
import { LEVEL4_A_SCENARIOS } from "../helpers/level4-a-scenarios.mjs";
import { LEVEL4_B_SCENARIOS } from "../helpers/level4-b-scenarios.mjs";
import { LEVEL4_C_SCENARIOS } from "../helpers/level4-c-scenarios.mjs";
import { LEVEL4_E_SCENARIOS } from "../helpers/level4-e-scenarios.mjs";
import { LEVEL4_G_SCENARIOS } from "../helpers/level4-g-scenarios.mjs";
import { LEVEL5_A_SCENARIOS, LEVEL5_B_SCENARIOS } from "../helpers/level5-a-b-scenarios.mjs";
import { LEVEL5_C_SCENARIOS } from "../helpers/level5-c-scenarios.mjs";
import { LEVEL5_D_SCENARIOS, LEVEL5_E_SCENARIOS } from "../helpers/level5-d-e-scenarios.mjs";
import { LEVEL5_F_SCENARIOS, LEVEL5_G_SCENARIOS } from "../helpers/level5-f-g-scenarios.mjs";
import { LEVEL6_A_SCENARIOS } from "../helpers/level6-a-scenarios.mjs";
import { LEVEL6_B_SCENARIOS } from "../helpers/level6-b-scenarios.mjs";
import { LEVEL6_C_SCENARIOS, LEVEL6_D_SCENARIOS } from "../helpers/level6-c-d-scenarios.mjs";
import { LEVEL6_E_SCENARIOS, LEVEL6_F_SCENARIOS } from "../helpers/level6-e-f-scenarios.mjs";
import { LEVEL7_A_SCENARIOS } from "../helpers/level7-a-scenarios.mjs";
import { LEVEL7_B_SCENARIOS } from "../helpers/level7-b-scenarios.mjs";
import { LEVEL7_C_SCENARIOS } from "../helpers/level7-c-scenarios.mjs";
import { LEVEL7_D_SCENARIOS } from "../helpers/level7-d-scenarios.mjs";
import { LEVEL7_E_SCENARIOS } from "../helpers/level7-e-scenarios.mjs";

const enabled = process.env.FEATHERLAB_KIND_TESTS === "1";
const options = {
  skip: enabled ? false : "set FEATHERLAB_KIND_TESTS=1 (needs Docker and kind)",
};
const quiet = { warn() {}, error() {} };
const userKubeconfig = path.join(os.homedir(), ".kube", "config");
const confirmed = { discardActive: true };

let env;
let app;
let k;
let kubeconfigBefore;
let systemPodsBefore;

const appFor = (stateDir, extra = {}) =>
  createApp({
    workstation: env.config.workstation,
    cluster: env.config.cluster,
    stateDir,
    logger: quiet,
    ...extra,
  });

before(() => {
  if (!enabled) return;
  kubeconfigBefore = fingerprint(userKubeconfig);
  env = new IsolatedEnvironment({ log: console }).start();
  app = appFor(env.config.stateDir);
  k = createKubectlFacade((args, { input } = {}) =>
    input === undefined ? env.kubectl(...args) : env.kubectlWithInput(input, ...args),
  );
});

after(() => {
  app?.persistence?.close();
  env?.teardown();
});

// ── Shared helpers ─────────────────────────────────────────────────────────────

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

const failingIds = (result) =>
  result.checks
    .filter((c) => !c.passed)
    .map((c) => c.id)
    .sort();

const describeFailures = (result) =>
  JSON.stringify(result.checks.filter((c) => !c.passed).map((c) => [c.id, c.feedback]));

const namespaceExists = (name) =>
  k.run("get", "namespaces", "-o", "name").split("\n").includes(`namespace/${name}`);

function namespaceLabels(name) {
  const out = k.run("get", "namespace", name, "-o", "json");
  return JSON.parse(out).metadata.labels ?? {};
}

// Poll service.check until non-failing checks all pass (handles async controller propagation).
async function settle(id, expectedFailing = []) {
  let result;
  try {
    await k.until(`${id} converges`, async () => {
      result = await app.service.check(id);
      return result.checks.every((c) => c.passed || expectedFailing.includes(c.id));
    });
  } catch {
    // Timed out — return whatever the last check produced.
  }
  return result;
}

// ── Level 0 ───────────────────────────────────────────────────────────────────

describe("Level 0", () => {
  before(() => {
    if (!enabled) return;
    k.run("run", "learner-own", "--image=nginx:1.27", "-n", "default", "--labels=run=web");
    systemPodsBefore = k
      .run("get", "pods", "-n", "kube-system", "-o", "name")
      .trim()
      .split("\n")
      .sort();
  });

  for (const [id, scenario] of Object.entries(LEVEL0_SCENARIOS)) {
    test(`${id}: activate, baseline, solve, variants, switch, revisit`, options, async () => {
      const { service, registry } = app;
      const exercise = registry.get(id);
      unlock(id);

      const opened = await service.activate(id, confirmed);
      assert.equal(opened.environment, "fresh");
      for (const ns of exercise.lifecycle.namespaces) {
        const labels = namespaceLabels(ns);
        assert.equal(labels[MANAGED_BY_LABEL], "featherlab", ns);
        assert.equal(labels[EXERCISE_LABEL], id, ns);
      }
      for (const [kind, name, ns] of scenario.initial)
        assert.match(k.run("get", kind, name, "-n", ns, "-o", "name"), new RegExp(name));

      const baseline = await service.check(id);
      assert.equal(baseline.outcome, "failed", describeFailures(baseline));

      await scenario.solve(k);
      const solved = await service.check(id);
      assert.equal(solved.outcome, "passed", describeFailures(solved));
      assert.equal(solved.progress.completed, true);

      for (const alternative of scenario.alternatives ?? []) {
        await service.reset(id);
        await alternative.run(k);
        const result = await service.check(id);
        assert.equal(result.outcome, "passed", `${alternative.name}: ${describeFailures(result)}`);
      }

      for (const variant of scenario.variants) {
        await service.reset(id);
        assert.equal((await service.check(id)).outcome, "failed", "reset restores the baseline");
        await variant.run(k);
        const result = await service.check(id);
        assert.equal(result.outcome, "failed", `${variant.name}: ${describeFailures(result)}`);
        assert.deepEqual(failingIds(result), [...variant.failing].sort(), variant.name);
      }

      const other = id === "k8s-0001" ? "k8s-0011" : "k8s-0001";
      unlock(other);
      await service.activate(other, confirmed);
      for (const ns of exercise.lifecycle.namespaces)
        assert.equal(namespaceExists(ns), false, `${ns} removed on switch`);

      assert.equal((await service.activate(id, confirmed)).environment, "fresh");
      const revisit = await service.check(id);
      assert.equal(revisit.outcome, "failed", "a completed exercise must be solved again");
      assert.equal(revisit.progress.completed, true, "completion is never revoked");
      assert.equal(service.getExerciseProgress(id).state, "completed");
    });
  }

  // ── Infrastructure reliability tests ────────────────────────────────────────

  test(
    "undeclared objects in a previous exercise's namespace are removed by a switch",
    options,
    async () => {
      const { service } = app;
      unlock("k8s-0003");
      await service.activate("k8s-0003", confirmed);
      k.apply(`
apiVersion: v1
kind: Service
metadata: { name: stray, namespace: fl-k8s-0003 }
spec: { selector: { app: catalog }, ports: [{ port: 80 }] }
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: deny-all, namespace: fl-k8s-0003-sandbox }
spec: { podSelector: {}, policyTypes: [Ingress, Egress] }
---
apiVersion: v1
kind: ConfigMap
metadata: { name: notes, namespace: fl-k8s-0003 }
data: { a: b }
---
apiVersion: v1
kind: Secret
metadata: { name: token, namespace: fl-k8s-0003-sandbox }
stringData: { t: x }
`);
      await service.activate("k8s-0001", confirmed);
      for (const ns of ["fl-k8s-0003", "fl-k8s-0003-sandbox"])
        assert.equal(namespaceExists(ns), false);

      await service.activate("k8s-0003", confirmed);
      for (const [kind, name, ns] of [
        ["service", "stray", "fl-k8s-0003"],
        ["networkpolicy", "deny-all", "fl-k8s-0003-sandbox"],
        ["configmap", "notes", "fl-k8s-0003"],
        ["secret", "token", "fl-k8s-0003-sandbox"],
      ])
        assert.equal(
          k.run("get", kind, "-n", ns, "-o", "name").includes(name),
          false,
          `${kind}/${name}`,
        );
    },
  );

  test(
    "default, kube-system and a learner's own Pod named like an old exercise survive everything",
    options,
    () => {
      assert.match(
        k.run("get", "pod", "learner-own", "-n", "default", "-o", "name"),
        /learner-own/,
      );
      const systemPods = k
        .run("get", "pods", "-n", "kube-system", "-o", "name")
        .trim()
        .split("\n")
        .sort();
      assert.deepEqual(systemPods, systemPodsBefore);
      for (const ns of ["default", "kube-system", "kube-public", "kube-node-lease"])
        assert.ok(namespaceExists(ns), ns);
    },
  );

  test(
    "a namespace FeatherLab does not own is refused before any mutation, and preserved",
    options,
    async () => {
      const { service, persistence } = app;
      await service.reset("k8s-0001", confirmed);
      k.run("run", "web", "--image=nginx:1.27", "-n", "fl-k8s-0001");
      await k.ready("web", "fl-k8s-0001");
      k.run("create", "namespace", "fl-k8s-0002");
      k.run("create", "configmap", "mine", "-n", "fl-k8s-0002", "--from-literal=a=b");
      try {
        await assert.rejects(service.activate("k8s-0002", confirmed), (error) => {
          assert.equal(error.details.step, "ownership");
          assert.match(error.message, /kubectl delete namespace fl-k8s-0002/);
          return true;
        });
        assert.match(k.run("get", "configmap", "mine", "-n", "fl-k8s-0002", "-o", "name"), /mine/);
        assert.equal(persistence.environment.get().state, "ready", "the owner was never journaled");
        assert.equal((await service.check("k8s-0001")).outcome, "passed", "work intact");
      } finally {
        k.run("delete", "namespace", "fl-k8s-0002", "--wait=true", "--timeout=120s");
      }
    },
  );

  test(
    "a namespace stuck in Terminating fails with a bounded error and recovers once released",
    options,
    async () => {
      const stateDir = mkdtempSync(path.join(os.tmpdir(), `featherlab-test-stuck-`));
      const stuckApp = appFor(stateDir, { driverOptions: { namespaceDeleteTimeoutMs: 8_000 } });
      try {
        unlock("k8s-0002");
        await app.service.activate("k8s-0002", confirmed);
        assert.equal(namespaceExists("fl-k8s-0001"), false);
        await stuckApp.service.activate("k8s-0001", confirmed);
        k.apply(`
apiVersion: v1
kind: ConfigMap
metadata:
  name: hold
  namespace: fl-k8s-0001
  finalizers: [featherlab.test/hold]
`);
        const started = Date.now();
        await assert.rejects(stuckApp.service.reset("k8s-0001"), (error) => {
          assert.equal(error.details.step, "wait for Namespace/fl-k8s-0001");
          assert.match(error.message, /still terminating/);
          assert.match(error.message, /never removes finalizers/);
          return true;
        });
        assert.ok(Date.now() - started < 60_000, "bounded");
        assert.equal(stuckApp.persistence.environment.get().state, "preparing");
        await assert.rejects(stuckApp.service.check("k8s-0001"), /not the one loaded/);
        assert.match(
          k.run(
            "get",
            "configmap",
            "hold",
            "-n",
            "fl-k8s-0001",
            "-o",
            "jsonpath={.metadata.finalizers}",
          ),
          /featherlab\.test\/hold/,
        );

        k.run(
          "patch",
          "configmap",
          "hold",
          "-n",
          "fl-k8s-0001",
          "--type=merge",
          "-p",
          '{"metadata":{"finalizers":null}}',
        );
        await k.until("fl-k8s-0001 to finish terminating", () => !namespaceExists("fl-k8s-0001"));
        await stuckApp.service.reset("k8s-0001");
        assert.equal(stuckApp.persistence.environment.get().state, "ready");
        assert.equal((await stuckApp.service.check("k8s-0001")).outcome, "failed");
      } finally {
        stuckApp.persistence.close();
        rmSync(stateDir, { recursive: true, force: true });
      }
    },
  );

  test(
    "a crash left mid-transition (preparing) is cleaned up conservatively after restart",
    options,
    async () => {
      const { service } = app;
      unlock("k8s-0004");
      await service.activate("k8s-0004", confirmed);
      app.persistence.environment.set({
        trackId: "kubernetes",
        exerciseId: "k8s-0004",
        state: "preparing",
      });
      app.persistence.close();
      app = appFor(env.config.stateDir);

      await assert.rejects(app.service.check("k8s-0004"), /not the one loaded/);
      const opened = await app.service.activate("k8s-0001");
      assert.equal(opened.environment, "fresh");
      assert.equal(namespaceExists("fl-k8s-0004"), false);
      assert.equal(app.persistence.environment.get().state, "ready");
    },
  );

  test(
    "a switch that fails before mutation keeps the ready owner and its work",
    options,
    async () => {
      const { service, persistence } = app;
      await service.reset("k8s-0001", confirmed);
      k.run("run", "web", "--image=nginx:1.27", "-n", "fl-k8s-0001");
      await k.ready("web", "fl-k8s-0001");
      const workstation = assertTestWorkstation(env.config.workstation);
      env.docker("pause", workstation);
      try {
        await assert.rejects(
          service.activate("k8s-0002", confirmed),
          /not reachable|timed out|not ready/i,
        );
      } finally {
        env.docker("unpause", workstation);
      }
      assert.equal(persistence.environment.get().exerciseId, "k8s-0001");
      assert.equal(persistence.environment.get().state, "ready");
      assert.equal((await service.check("k8s-0001")).outcome, "passed", "work intact and gradable");
    },
  );

  test(
    "a page reload and an application restart resume the ready exercise with its work",
    options,
    async () => {
      await app.service.reset("k8s-0001", confirmed);
      k.run("run", "web", "--image=nginx:1.27", "-n", "fl-k8s-0001");
      await k.ready("web", "fl-k8s-0001");
      assert.equal((await app.service.activate("k8s-0001")).environment, "resumed");

      app.persistence.close();
      app = appFor(env.config.stateDir);
      const reopened = await app.service.activate("k8s-0001");
      assert.equal(reopened.environment, "resumed");
      assert.deepEqual(reopened.steps, []);
      assert.equal((await app.service.check("k8s-0001")).outcome, "passed");
    },
  );

  test("concurrent operations are serialized and leave one consistent owner", options, async () => {
    unlock("k8s-0004");
    const results = await Promise.allSettled([
      app.service.reset("k8s-0004", confirmed),
      app.service.activate("k8s-0002", confirmed),
      app.service.reset("k8s-0004", confirmed),
    ]);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "fulfilled");
    assert.equal(results[2].status, "rejected");
    assert.equal(results[2].reason.code, "OPERATION_IN_PROGRESS");
    await sleep(0);
    const owner = app.persistence.environment.get();
    assert.deepEqual([owner.exerciseId, owner.state], ["k8s-0002", "ready"]);
    assert.equal(namespaceExists("fl-k8s-0004"), false, "the earlier owner was cleaned up");
    assert.ok(namespaceExists("fl-k8s-0002"));
  });
});

// ── Level 2 ───────────────────────────────────────────────────────────────────

describe("Level 2", () => {
  for (const [id, scenario] of Object.entries(LEVEL2_SCENARIOS)) {
    test(`${id}: activate, baseline, solve, variants, switch, revisit`, options, async () => {
      const { service, registry } = app;
      const exercise = registry.get(id);
      unlock(id);

      const opened = await service.activate(id, confirmed);
      assert.equal(opened.environment, "fresh");

      for (const [kind, name, ns] of scenario.initial)
        assert.match(k.run("get", kind, name, "-n", ns, "-o", "name"), new RegExp(name));

      const baseline = await service.check(id);
      assert.equal(baseline.outcome, "failed", describeFailures(baseline));

      await scenario.solve(k);
      const solved = await service.check(id);
      assert.equal(solved.outcome, "passed", describeFailures(solved));
      assert.equal(solved.progress.completed, true);

      for (const alternative of scenario.alternatives ?? []) {
        await service.reset(id);
        await alternative.run(k);
        const result = await service.check(id);
        assert.equal(result.outcome, "passed", `${alternative.name}: ${describeFailures(result)}`);
      }

      for (const variant of scenario.variants) {
        await service.reset(id);
        assert.equal((await service.check(id)).outcome, "failed", "reset restores the baseline");
        await variant.run(k);
        const result = await service.check(id);
        assert.equal(result.outcome, "failed", `${variant.name}: expected failed but got passed`);
        assert.deepEqual(failingIds(result), [...variant.failing].sort(), variant.name);
      }

      const other = id === "k8s-0035" ? "k8s-0036" : "k8s-0035";
      unlock(other);
      await service.activate(other, confirmed);
      for (const ns of exercise.lifecycle.namespaces)
        assert.equal(namespaceExists(ns), false, `${ns} removed on switch`);

      assert.equal((await service.activate(id, confirmed)).environment, "fresh");
      const revisit = await service.check(id);
      assert.equal(revisit.outcome, "failed", "a completed exercise must be solved again");
      assert.equal(revisit.progress.completed, true, "completion is never revoked");
    });
  }
});

// ── Level 3 ───────────────────────────────────────────────────────────────────

{
  const LEVEL3_SCENARIOS = {
    ...LEVEL3_AB_SCENARIOS,
    ...LEVEL3_CD_SCENARIOS,
    ...LEVEL3_EF_SCENARIOS,
  };

  const LEVEL3_EXPECTED = [
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
  const missingL3 = LEVEL3_EXPECTED.filter((id) => !LEVEL3_SCENARIOS[id]);
  if (missingL3.length > 0)
    throw new Error(`Level 3 scenarios missing for: ${missingL3.join(", ")}`);

  describe("Level 3", () => {
    for (const [id, scenario] of Object.entries(LEVEL3_SCENARIOS)) {
      test(`${id}: activate, baseline, solve, variants, switch, revisit`, options, async () => {
        const { service, registry } = app;
        const exercise = registry.get(id);
        if (!exercise) throw new Error(`Exercise ${id} not in registry`);
        unlock(id);

        const opened = await service.activate(id, confirmed);
        assert.equal(opened.environment, "fresh");

        for (const [resource, name, ns] of scenario.initial ?? []) {
          const output = k.run("get", resource, name, "-n", ns, "--ignore-not-found");
          assert.match(output, new RegExp(name), `${resource}/${name} not found after setup`);
        }

        const baseline = await service.check(id);
        assert.equal(
          baseline.outcome,
          "failed",
          `baseline should fail: ${describeFailures(baseline)}`,
        );

        await scenario.solve(k);
        const solved = await service.check(id);
        assert.equal(solved.outcome, "passed", `solution should pass: ${describeFailures(solved)}`);

        for (const variant of scenario.variants ?? []) {
          await service.reset(id);
          assert.equal((await service.check(id)).outcome, "failed", "reset restores the baseline");
          await variant.run(k);
          const result = await service.check(id);
          assert.deepEqual(
            failingIds(result),
            [...variant.failing].sort(),
            `variant "${variant.name}": unexpected failures: ${describeFailures(result)}`,
          );
        }

        const others = registry.list({ track: "kubernetes", level: 0 });
        if (others.length > 0) {
          const other = others[0].id;
          await service.activate(other, confirmed);
          const revisit = await service.activate(id, confirmed);
          assert.equal(revisit.environment, "fresh", "revisit after switch should start fresh");
        }
      });
    }
  });
}

// ── Level 4 ───────────────────────────────────────────────────────────────────

{
  const LEVEL4_SCENARIOS = {
    ...LEVEL4_A_SCENARIOS,
    ...LEVEL4_B_SCENARIOS,
    ...LEVEL4_C_SCENARIOS,
    ...LEVEL4_E_SCENARIOS,
    ...LEVEL4_G_SCENARIOS,
  };

  const LEVEL4_EXPECTED = [
    "k8s-0079",
    "k8s-0080",
    "k8s-0081",
    "k8s-0082",
    "k8s-0083",
    "k8s-0084",
    "k8s-0085",
    "k8s-0086",
    "k8s-0087",
    "k8s-0088",
    "k8s-0089",
    "k8s-0090",
    "k8s-0091",
    "k8s-0092",
    "k8s-0093",
    "k8s-0094",
    "k8s-0095",
    "k8s-0096",
    "k8s-0097",
  ];
  const missingL4 = LEVEL4_EXPECTED.filter((id) => !LEVEL4_SCENARIOS[id]);
  if (missingL4.length > 0)
    throw new Error(`Level 4 scenarios missing for: ${missingL4.join(", ")}`);

  describe("Level 4", () => {
    for (const [id, scenario] of Object.entries(LEVEL4_SCENARIOS)) {
      test(`${id}: activate, baseline, solve, variants, switch, revisit`, options, async () => {
        const { service, registry } = app;
        const exercise = registry.get(id);
        if (!exercise) throw new Error(`Exercise ${id} not in registry`);
        unlock(id);

        const opened = await service.activate(id, confirmed);
        assert.equal(opened.environment, "fresh");

        for (const [resource, name, ns] of scenario.initial ?? []) {
          const output = k.run("get", resource, name, "-n", ns, "--ignore-not-found");
          assert.match(output, new RegExp(name), `${resource}/${name} not found after setup`);
        }

        const baseline = await service.check(id);
        assert.equal(
          baseline.outcome,
          "failed",
          `baseline should fail: ${describeFailures(baseline)}`,
        );

        await scenario.solve(k);
        const solved = await service.check(id);
        assert.equal(solved.outcome, "passed", `solution should pass: ${describeFailures(solved)}`);

        for (const variant of scenario.variants ?? []) {
          await service.reset(id);
          await variant.run(k);
          const result = await service.check(id);
          assert.deepEqual(
            failingIds(result),
            [...variant.failing].sort(),
            `variant "${variant.name}": unexpected failures: ${describeFailures(result)}`,
          );
        }

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
  });
}

// ── Level 5 ───────────────────────────────────────────────────────────────────

{
  const LEVEL5_SCENARIOS = {
    ...LEVEL5_A_SCENARIOS,
    ...LEVEL5_B_SCENARIOS,
    ...LEVEL5_C_SCENARIOS,
    ...LEVEL5_D_SCENARIOS,
    ...LEVEL5_E_SCENARIOS,
    ...LEVEL5_F_SCENARIOS,
    ...LEVEL5_G_SCENARIOS,
  };

  const LEVEL5_EXPECTED = [
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
  const missingL5 = LEVEL5_EXPECTED.filter((id) => !LEVEL5_SCENARIOS[id]);
  if (missingL5.length > 0)
    throw new Error(`Level 5 scenarios missing for: ${missingL5.join(", ")}`);

  describe("Level 5", () => {
    for (const [id, scenario] of Object.entries(LEVEL5_SCENARIOS)) {
      test(`${id}: activate, baseline, solve, variants, switch, revisit`, options, async () => {
        const { service, registry } = app;
        const exercise = registry.get(id);
        if (!exercise) throw new Error(`Exercise ${id} not in registry`);
        unlock(id);

        const opened = await service.activate(id, confirmed);
        assert.equal(opened.environment, "fresh");

        for (const [resource, name, ns] of scenario.initial ?? []) {
          const output = k.run("get", resource, name, "-n", ns, "--ignore-not-found");
          assert.match(output, new RegExp(name), `${resource}/${name} not found after setup`);
        }

        const baseline = await service.check(id);
        assert.equal(
          baseline.outcome,
          "failed",
          `baseline should fail: ${describeFailures(baseline)}`,
        );

        await scenario.solve(k);
        const solved = await service.check(id);
        assert.equal(solved.outcome, "passed", `solution should pass: ${describeFailures(solved)}`);

        for (const variant of scenario.variants ?? []) {
          await service.reset(id);
          await variant.run(k);
          const result = await service.check(id);
          assert.deepEqual(
            failingIds(result),
            [...variant.failing].sort(),
            `variant "${variant.name}": unexpected failures: ${describeFailures(result)}`,
          );
        }

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
  });
}

// ── Level 6 (Traefik / Gateway API) ───────────────────────────────────────────

{
  const LEVEL6_SCENARIOS = {
    ...LEVEL6_A_SCENARIOS,
    ...LEVEL6_B_SCENARIOS,
    ...LEVEL6_C_SCENARIOS,
    ...LEVEL6_D_SCENARIOS,
    ...LEVEL6_E_SCENARIOS,
    ...LEVEL6_F_SCENARIOS,
  };

  const LEVEL6_EXPECTED = [
    "k8s-0125",
    "k8s-0126",
    "k8s-0127",
    "k8s-0128",
    "k8s-0129",
    "k8s-0130",
    "k8s-0131",
    "k8s-0132",
    "k8s-0133",
    "k8s-0134",
    "k8s-0135",
    "k8s-0136",
    "k8s-0137",
    "k8s-0138",
    "k8s-0139",
    "k8s-0140",
    "k8s-0141",
    "k8s-0142",
    "k8s-0143",
    "k8s-0144",
    "k8s-0145",
    "k8s-0146",
    "k8s-0147",
    "k8s-0148",
    "k8s-0149",
    "k8s-0150",
  ];
  const missingL6 = LEVEL6_EXPECTED.filter((id) => !LEVEL6_SCENARIOS[id]);
  if (missingL6.length > 0)
    throw new Error(`Level 6 scenarios missing for: ${missingL6.join(", ")}`);

  describe("Level 6", () => {
    before(() => {
      if (!enabled) return;
      const hostExec = (binary, args, opts = {}) =>
        run(binary, args, {
          ...opts,
          env: {
            ...process.env,
            KUBECONFIG: env.config.stateDir + "/host-kubeconfig",
          },
        });
      installRouting({ exec: hostExec, log: console });
    });

    for (const [id, scenario] of Object.entries(LEVEL6_SCENARIOS)) {
      test(`${id}: activate, baseline, solve, variants`, options, async () => {
        const { service, registry } = app;
        const exercise = registry.get(id);
        if (!exercise) throw new Error(`Exercise ${id} not in registry`);
        unlock(id);

        const opened = await service.activate(id, confirmed);
        assert.equal(opened.environment, "fresh");

        for (const [resource, name, ns] of scenario.initial ?? []) {
          const output = k.run("get", resource, name, "-n", ns, "--ignore-not-found");
          assert.match(output, new RegExp(name), `${resource}/${name} not found after setup`);
        }

        const baseline = await service.check(id);
        assert.equal(
          baseline.outcome,
          "failed",
          `baseline should fail: ${describeFailures(baseline)}`,
        );

        await scenario.solve(k);
        const solved = await settle(id);
        assert.equal(solved.outcome, "passed", `solution should pass: ${describeFailures(solved)}`);

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
  });
}

// ── Level 7 (NetworkPolicy) ───────────────────────────────────────────────────

{
  const LEVEL7_SCENARIOS = {
    ...LEVEL7_A_SCENARIOS,
    ...LEVEL7_B_SCENARIOS,
    ...LEVEL7_C_SCENARIOS,
    ...LEVEL7_D_SCENARIOS,
    ...LEVEL7_E_SCENARIOS,
  };

  const LEVEL7_EXPECTED = [
    "k8s-0151",
    "k8s-0152",
    "k8s-0153",
    "k8s-0154",
    "k8s-0155",
    "k8s-0156",
    "k8s-0157",
    "k8s-0158",
    "k8s-0159",
    "k8s-0160",
    "k8s-0161",
    "k8s-0162",
    "k8s-0163",
    "k8s-0164",
    "k8s-0165",
    "k8s-0166",
    "k8s-0167",
    "k8s-0168",
    "k8s-0169",
    "k8s-0170",
    "k8s-0171",
    "k8s-0172",
    "k8s-0173",
    "k8s-0174",
  ];
  const missingL7 = LEVEL7_EXPECTED.filter((id) => !LEVEL7_SCENARIOS[id]);
  if (missingL7.length > 0)
    throw new Error(`Level 7 scenarios missing for: ${missingL7.join(", ")}`);

  describe("Level 7", () => {
    for (const [id, scenario] of Object.entries(LEVEL7_SCENARIOS)) {
      test(`${id}: activate, baseline, solve, variants`, options, async () => {
        const { service, registry } = app;
        const exercise = registry.get(id);
        if (!exercise) throw new Error(`Exercise ${id} not in registry`);
        unlock(id);

        const opened = await service.activate(id, confirmed);
        assert.equal(opened.environment, "fresh");

        for (const [resource, name, ns] of scenario.initial ?? []) {
          const output = k.run("get", resource, name, "-n", ns, "--ignore-not-found");
          assert.match(output, new RegExp(name), `${resource}/${name} not found after setup`);
        }

        const baseline = await service.check(id);
        assert.equal(
          baseline.outcome,
          "failed",
          `baseline should fail: ${describeFailures(baseline)}`,
        );

        await scenario.solve(k);
        const solved = await settle(id);
        assert.equal(solved.outcome, "passed", `solution should pass: ${describeFailures(solved)}`);

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
  });
}

// ── Final ──────────────────────────────────────────────────────────────────────

test("the run left the learner's kubeconfig untouched", options, () => {
  assert.equal(fingerprint(userKubeconfig), kubeconfigBefore);
});
