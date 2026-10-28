import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/app.mjs";
import {
  EnvironmentError,
  EnvironmentInUseError,
  InactiveExerciseError,
  LifecycleError,
} from "../../src/core/errors.mjs";
import { startServer } from "../../src/server.mjs";
import { appFor, exerciseFiles } from "../helpers/content.mjs";
import {
  createFakeCluster,
  deployment,
  ownedNamespace,
  readyPod,
} from "../helpers/fake-cluster.mjs";

const quiet = { warn() {}, error() {} };
/**
 * These tests are about switching between two owners, k8s-0001 and k8s-0002, not about
 * locking. With persistence, k8s-0002 also needs k8s-0012 (Working With YAML), so that one
 * completion is seeded; the tests still earn k8s-0001's completion themselves.
 */
function packaged(cluster, options = {}) {
  const app = createApp({ runner: cluster, logger: quiet, ...options });
  if (app.persistence && !app.persistence.progress.get("k8s-0012", "kubernetes")?.completed)
    app.persistence.progress.upsert({
      exerciseId: "k8s-0012",
      trackId: "kubernetes",
      completed: true,
      firstCompletedAt: new Date().toISOString(),
    });
  return app;
}
const ns2 = (cluster) => cluster.find("Namespace", "fl-k8s-0002");
const confirmed = { discardActive: true };

function withStateDir(fn) {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-session-"));
  return Promise.resolve(fn(stateDir)).finally(() =>
    rmSync(stateDir, { recursive: true, force: true }),
  );
}

/** Fail kubectl calls matching `pattern` while `active()` is true. */
function failWhen(cluster, pattern, active) {
  const original = cluster.run;
  cluster.run = async (argv, options) => {
    if (active() && pattern.test(argv.join(" ")))
      return { stdout: "", stderr: "Error from server: injected failure", exitCode: 1 };
    return original(argv, options);
  };
}

// ── Switching ────────────────────────────────────────────────────────────────

test("switching away from a ready exercise needs confirmation; without it nothing is touched", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0001");
  cluster.put(readyPod());
  const before = cluster.commands().length;

  await assert.rejects(service.activate("k8s-0002"), (error) => {
    assert.ok(error instanceof EnvironmentInUseError);
    assert.equal(error.details.activeExerciseId, "k8s-0001");
    assert.match(error.message, /Your first Pod/);
    assert.match(error.message, /progress and history stay saved/);
    return true;
  });
  await assert.rejects(service.reset("k8s-0002"), EnvironmentInUseError);
  assert.equal(cluster.commands().length, before, "no cluster command was issued");
  assert.equal((await service.check("k8s-0001")).success, true, "work is intact");
});

test("returning to a passed exercise starts from scratch; stale work cannot pass", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);

  await service.activate("k8s-0001");
  cluster.put(readyPod());
  assert.equal((await service.check("k8s-0001")).success, true);

  await service.activate("k8s-0002", confirmed);
  assert.equal(cluster.find("Pod", "web", "fl-k8s-0001"), undefined, "A's work removed on switch");

  const back = await service.activate("k8s-0001", confirmed);
  assert.equal(back.environment, "fresh");
  assert.equal((await service.check("k8s-0001")).success, false);
});

test("switching away removes the previous exercise's work and its setup objects", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0002");
  cluster.put(deployment());

  await service.activate("k8s-0001", confirmed);
  assert.equal(cluster.find("Deployment", "api", "fl-k8s-0002"), undefined);
  assert.equal(ns2(cluster), undefined, "managed namespace torn down");
});

test("switching removes undeclared objects in the previous exercise's namespace, nothing outside it", async () => {
  const cluster = createFakeCluster({
    resources: [readyPod({ name: "keepme", namespace: "default" })],
  });
  const { service } = packaged(cluster);
  await service.activate("k8s-0001");
  // Strays no exercise declares.
  cluster.put(readyPod({ name: "extra" }));
  cluster.put({
    apiVersion: "v1",
    kind: "Service",
    metadata: { name: "web", namespace: "fl-k8s-0001" },
  });
  cluster.put({
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: { name: "deny-all", namespace: "fl-k8s-0001" },
  });
  await service.activate("k8s-0002", confirmed);
  assert.deepEqual(
    cluster.all().filter((r) => r.metadata.namespace === "fl-k8s-0001"),
    [],
    "nothing is left in the previous exercise's namespace",
  );
  assert.equal(cluster.find("Namespace", "fl-k8s-0001"), undefined);
  assert.ok(cluster.find("Pod", "keepme", "default"), "objects outside it survive");
  assert.ok(cluster.find("Namespace", "default"));
  assert.ok(cluster.find("Namespace", "kube-system"));
});

test("reopening the ready exercise (page reload) keeps the learner's work", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0001");
  cluster.put(readyPod());

  const reopened = await service.activate("k8s-0001");
  assert.equal(reopened.environment, "resumed");
  assert.ok(cluster.find("Pod", "web", "fl-k8s-0001"));
  assert.equal((await service.check("k8s-0001")).success, true);
});

test("the ready exercise survives a restart, so stop/start keeps work in progress", () =>
  withStateDir(async (stateDir) => {
    const cluster = createFakeCluster();
    const first = packaged(cluster, { stateDir });
    await first.service.activate("k8s-0001");
    cluster.put(readyPod({ image: "busybox" }));
    first.persistence.close();

    const second = packaged(cluster, { stateDir });
    assert.equal(second.persistence.environment.get().state, "ready");
    const reopened = await second.service.activate("k8s-0001");
    assert.equal(reopened.environment, "resumed");
    assert.ok(cluster.find("Pod", "web", "fl-k8s-0001"), "work in progress kept");
    second.persistence.close();
  }));

// ── Grading ──────────────────────────────────────────────────────────────────

test("only the exercise that owns the environment can be graded", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);

  // Nothing opened yet: leftover state in the cluster must not be gradable.
  cluster.put(readyPod());
  await assert.rejects(service.check("k8s-0001"), InactiveExerciseError);

  await service.activate("k8s-0002");
  await assert.rejects(service.check("k8s-0001"), (error) => {
    assert.equal(error.code, "EXERCISE_NOT_ACTIVE");
    return true;
  });
});

test("HTTP: inactive check is 409 EXERCISE_NOT_ACTIVE; unconfirmed switch is 409 ENVIRONMENT_IN_USE", async () => {
  const server = await startServer(0, { service: packaged(createFakeCluster()).service });
  const post = (p) =>
    fetch(`http://127.0.0.1:${server.port}/api/exercises/${p}`, { method: "POST" });
  try {
    const inactive = await post("k8s-0001/check");
    assert.equal(inactive.status, 409);
    assert.equal((await inactive.json()).code, "EXERCISE_NOT_ACTIVE");

    assert.equal((await post("k8s-0001/activate")).status, 200);
    const inUse = await post("k8s-0002/activate");
    assert.equal(inUse.status, 409);
    const body = await inUse.json();
    assert.equal(body.code, "ENVIRONMENT_IN_USE");
    assert.equal(body.details.activeExerciseId, "k8s-0001");
    assert.equal((await post("k8s-0002/activate?discardActive=true")).status, 200);
  } finally {
    await server.close();
  }
});

// ── Recovery: every failed or interrupted transition is safely recoverable ────

/** With persistence, k8s-0002 is locked until k8s-0001 passes; leaves k8s-0001 ready & solved. */
async function solveFirst(service, cluster) {
  await service.activate("k8s-0001");
  cluster.put(readyPod());
  assert.equal((await service.check("k8s-0001")).success, true);
}

/** After a failed transition: the named owner is `preparing` and nothing is gradable. */
async function assertRecoverable(service, persistence, ownerId) {
  const record = persistence.environment.get();
  assert.equal(record.exerciseId, ownerId);
  assert.equal(record.state, "preparing");
  for (const id of ["k8s-0001", "k8s-0002"])
    await assert.rejects(service.check(id), InactiveExerciseError, `${id} must not be gradable`);
}

const failureCases = [
  {
    name: "cleanup of the previous owner fails",
    owner: "k8s-0001",
    fail: /delete --raw \/api\/v1\/namespaces\/fl-k8s-0001/,
  },
  { name: "reset of the new exercise fails", owner: "k8s-0002", fail: / create / },
];

for (const { name, owner, fail } of failureCases) {
  test(`recovery: ${name} → preparing record, nothing gradable, retry converges`, () =>
    withStateDir(async (stateDir) => {
      const cluster = createFakeCluster();
      const { service, persistence } = packaged(cluster, { stateDir });
      await solveFirst(service, cluster);

      let failing = true;
      failWhen(cluster, fail, () => failing);
      await assert.rejects(service.activate("k8s-0002", confirmed));
      await assertRecoverable(service, persistence, owner);

      failing = false;
      // A preparing owner is cleaned up without asking: its work was already being discarded.
      const retry = await service.activate("k8s-0002");
      assert.equal(retry.environment, "fresh");
      assert.equal(cluster.find("Pod", "web", "fl-k8s-0001"), undefined);
      assert.ok(ns2(cluster));
      assert.equal(persistence.environment.get().state, "ready");
      persistence.close();
    }));
}

test("recovery: reopening a preparing exercise resets it instead of resuming", () =>
  withStateDir(async (stateDir) => {
    const cluster = createFakeCluster();
    const { service, persistence } = packaged(cluster, { stateDir });
    await solveFirst(service, cluster);

    let failing = true;
    failWhen(cluster, /delete --raw \/api\/v1\/namespaces\/fl-k8s-0001/, () => failing);
    await assert.rejects(service.activate("k8s-0002", confirmed));
    failing = false;

    const reopened = await service.activate("k8s-0001");
    assert.equal(reopened.environment, "fresh");
    assert.equal(cluster.find("Pod", "web", "fl-k8s-0001"), undefined, "full reset, not a resume");
    assert.equal((await service.check("k8s-0001")).success, false);
    persistence.close();
  }));

test("recovery: the baseline guard leaves the exercise preparing and ungradable", () =>
  withStateDir(async (stateDir) => {
    // Broken content: its own setup creates the object its check looks for.
    const cluster = createFakeCluster();
    const files = exerciseFiles(
      "001-presolved",
      { lifecycle: { namespaces: ["fl-demo-0001"], setup: { manifests: ["setup/demo.yaml"] } } },
      {
        "setup/demo.yaml":
          "apiVersion: v1\nkind: Pod\nmetadata:\n  name: demo\n  namespace: fl-demo-0001\nspec:\n  containers: [{ name: c, image: nginx:1.27 }]\n",
      },
    );
    const { service, persistence } = appFor(files, cluster, { stateDir });

    await assert.rejects(service.activate("demo-0001"), (error) => {
      assert.ok(error instanceof LifecycleError);
      assert.equal(error.details.step, "baseline");
      assert.match(error.message, /already passes/);
      return true;
    });
    assert.equal(persistence.environment.get().state, "preparing");
    await assert.rejects(service.check("demo-0001"), InactiveExerciseError);
    // Retrying does not resume into a gradable state either.
    await assert.rejects(service.activate("demo-0001"), LifecycleError);
    persistence.close();
  }));

test("recovery: a crash mid-transition is cleaned up after restart", () =>
  withStateDir(async (stateDir) => {
    const cluster = createFakeCluster();
    const first = packaged(cluster, { stateDir });
    await solveFirst(first.service, cluster);
    await first.service.activate("k8s-0002", confirmed);
    cluster.put(deployment());
    // The process dies mid-takeover: the record says k8s-0002 is preparing and its
    // objects are still in the cluster.
    first.persistence.environment.set({
      trackId: "kubernetes",
      exerciseId: "k8s-0002",
      state: "preparing",
    });
    first.persistence.close();

    const second = packaged(cluster, { stateDir });
    await assert.rejects(second.service.check("k8s-0002"), InactiveExerciseError);
    const opened = await second.service.activate("k8s-0001"); // no confirmation needed
    assert.equal(opened.environment, "fresh");
    assert.equal(cluster.find("Deployment", "api", "fl-k8s-0002"), undefined, "cleaned up");
    assert.equal(ns2(cluster), undefined);
    assert.equal(second.persistence.environment.get().state, "ready");
    second.persistence.close();
  }));

test("protocol: a switch that fails before any mutation keeps the owner ready, with its work", () =>
  withStateDir(async (stateDir) => {
    const cluster = createFakeCluster();
    const { service, persistence } = packaged(cluster, { stateDir });
    await solveFirst(service, cluster);

    cluster.down = true;
    await assert.rejects(service.activate("k8s-0002", confirmed), EnvironmentError);
    cluster.down = false;
    assert.equal(
      cluster.mutations().length,
      1, // only the namespace created when opening k8s-0001 in solveFirst
      "no mutating command was sent by the failed switch",
    );
    assert.deepEqual(
      { ...persistence.environment.get(), activatedAt: undefined },
      { trackId: "kubernetes", exerciseId: "k8s-0001", state: "ready", activatedAt: undefined },
    );
    assert.equal((await service.check("k8s-0001")).success, true, "still gradable");
    const reopened = await service.activate("k8s-0001");
    assert.equal(reopened.environment, "resumed");
    assert.ok(cluster.find("Pod", "web", "fl-k8s-0001"), "work intact");
    persistence.close();
  }));

test("protocol: a reset that fails before any mutation keeps the work", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0001");
  cluster.put(readyPod());

  cluster.down = true;
  await assert.rejects(service.reset("k8s-0001"), EnvironmentError);
  cluster.down = false;
  assert.equal((await service.check("k8s-0001")).success, true);
});

test("protocol: the record turns preparing before the first mutating command, ready after the baseline", () =>
  withStateDir(async (stateDir) => {
    const cluster = createFakeCluster();
    const { service, persistence } = packaged(cluster, { stateDir });
    await solveFirst(service, cluster);

    const observed = [];
    const original = cluster.run;
    cluster.run = async (argv, options) => {
      const line = argv.join(" ");
      const kind = /readyz/.test(line) ? "probe" : / (create|delete) /.test(line) ? "mutate" : null;
      if (kind) {
        const { exerciseId, state } = persistence.environment.get();
        observed.push(`${kind}:${exerciseId}:${state}`);
      }
      return original(argv, options);
    };
    await service.activate("k8s-0002", confirmed);

    assert.equal(observed[0], "probe:k8s-0001:ready", "probe runs while the owner is intact");
    const firstMutation = observed.find((o) => o.startsWith("mutate"));
    assert.equal(firstMutation, "mutate:k8s-0001:preparing", "journaled before deleting");
    assert.ok(
      observed.filter((o) => o.startsWith("mutate")).every((o) => o.endsWith(":preparing")),
      "every mutation happens under a preparing record",
    );
    assert.equal(persistence.environment.get().state, "ready");
    persistence.close();
  }));

test("protocol: if the cluster drops after the probe, recovery stays conservative", () =>
  withStateDir(async (stateDir) => {
    const cluster = createFakeCluster();
    const { service, persistence } = packaged(cluster, { stateDir });
    await solveFirst(service, cluster);

    // Both probes (previous owner, new exercise) succeed; the next readiness check (inside
    // cleanup) fails. FeatherLab cannot prove nothing was deleted in between, so it must not
    // report the old work as intact.
    let probes = 0;
    const original = cluster.run;
    cluster.run = async (argv, options) => {
      if (argv.includes("/readyz") && ++probes > 2)
        return { stdout: "", stderr: "Unable to connect to the server", exitCode: 1 };
      return original(argv, options);
    };
    await assert.rejects(service.activate("k8s-0002", confirmed));
    await assertRecoverable(service, persistence, "k8s-0001");
    persistence.close();
  }));

// ── Concurrency ──────────────────────────────────────────────────────────────

test("concurrent opens of different exercises are serialized; the last one wins", async () => {
  const cluster = createFakeCluster();
  const original = cluster.run;
  let inFlight = 0;
  let maxInFlight = 0;
  cluster.run = async (argv, options) => {
    maxInFlight = Math.max(maxInFlight, ++inFlight);
    await new Promise((resolve) => setImmediate(resolve));
    try {
      return await original(argv, options);
    } finally {
      inFlight--;
    }
  };
  const { service } = packaged(cluster);

  await Promise.all([service.activate("k8s-0002"), service.activate("k8s-0001", confirmed)]);
  assert.equal(maxInFlight, 1, "no two cluster commands ever overlapped");
  assert.equal(ns2(cluster), undefined, "k8s-0001 took over and tore down k8s-0002");
  cluster.put(readyPod());
  assert.equal((await service.check("k8s-0001")).success, true);
});

test("a duplicate open of the same exercise joins the pending one", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  const [a, b] = await Promise.all([service.activate("k8s-0002"), service.activate("k8s-0002")]);
  assert.deepEqual(a.steps, b.steps);
  const creates = cluster.commands().filter((c) => c.includes(" create "));
  assert.equal(creates.length, 1);
});

test("a confirmed open never joins a pending unconfirmed one", async () => {
  const cluster = createFakeCluster();
  const { service } = packaged(cluster);
  await service.activate("k8s-0001");
  const unconfirmed = service.activate("k8s-0002");
  const confirmedOpen = service.activate("k8s-0002", confirmed);
  await assert.rejects(unconfirmed, EnvironmentInUseError);
  // Not joined: it is rejected as busy rather than inheriting the 409 above.
  await assert.rejects(confirmedOpen, (error) => error.code === "OPERATION_IN_PROGRESS");
  await service.activate("k8s-0002", confirmed);
});

// ── Practice ─────────────────────────────────────────────────────────────────

test("completed exercises stay completed and reopen fresh for independent practice", () =>
  withStateDir(async (stateDir) => {
    const cluster = createFakeCluster();
    const { service, persistence } = packaged(cluster, { stateDir });
    await service.activate("k8s-0001");
    cluster.put(readyPod());
    await service.check("k8s-0001");
    await service.activate("k8s-0002", confirmed);
    cluster.put(deployment());
    assert.equal((await service.check("k8s-0002")).success, true);

    // Go back to the first problem to practise it again.
    assert.equal((await service.activate("k8s-0001", confirmed)).environment, "fresh");
    const retry = await service.check("k8s-0001");
    assert.equal(retry.success, false, "must be solved again");
    assert.equal(retry.progress.completed, true, "earlier completion is not revoked");
    assert.equal(service.getExerciseProgress("k8s-0002").state, "completed");
    persistence.close();
  }));

// ── Upgrading from the pre-namespace layout (FeatherLab ≤ 1.0) ───────────────

test("upgrade: a ready record from the old layout is prepared again, never trusted", () =>
  withStateDir(async (stateDir) => {
    // 1.0 ran k8s-0001 in `default`. Its record says ready; the new namespace does not exist.
    const cluster = createFakeCluster({
      resources: [readyPod({ name: "web", namespace: "default" })],
    });
    const first = packaged(cluster, { stateDir });
    first.persistence.environment.set({
      trackId: "kubernetes",
      exerciseId: "k8s-0001",
      state: "ready",
    });
    first.persistence.close();

    const { service, persistence } = packaged(cluster, { stateDir });
    const opened = await service.activate("k8s-0001");
    assert.equal(opened.environment, "fresh");
    assert.equal(opened.recreated, true);
    assert.ok(cluster.find("Namespace", "fl-k8s-0001"), "the new namespace exists");
    assert.ok(cluster.find("Pod", "web", "default"), "the old Pod in default is never deleted");
    assert.equal(persistence.environment.get().state, "ready");
    assert.equal((await service.check("k8s-0001")).outcome, "failed", "old work does not count");
    persistence.close();
  }));

test("upgrade: switching away from an old-layout owner leaves its legacy namespace alone", () =>
  withStateDir(async (stateDir) => {
    // 1.0's k8s-0002 created a labelled `staging` namespace; the exercise no longer declares it.
    const cluster = createFakeCluster({
      resources: [ownedNamespace("staging", "k8s-0002"), deployment({ namespace: "staging" })],
    });
    const first = packaged(cluster, { stateDir });
    first.persistence.environment.set({
      trackId: "kubernetes",
      exerciseId: "k8s-0002",
      state: "ready",
    });
    first.persistence.close();

    const { service, persistence } = packaged(cluster, { stateDir });
    await assert.rejects(service.activate("k8s-0001"), EnvironmentInUseError);
    await service.activate("k8s-0001", confirmed);
    assert.ok(cluster.find("Namespace", "staging"), "never deleted by name or label alone");
    assert.ok(cluster.find("Deployment", "api", "staging"));
    persistence.close();
  }));

test("ownership: a switch blocked by a foreign namespace fails before mutation; owner stays ready", () =>
  withStateDir(async (stateDir) => {
    const cluster = createFakeCluster();
    const { service, persistence } = packaged(cluster, { stateDir });
    await solveFirst(service, cluster);
    // Someone created k8s-0002's namespace by hand.
    cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name: "fl-k8s-0002" } });
    const before = cluster.mutations().length;

    await assert.rejects(service.activate("k8s-0002", confirmed), (error) => {
      assert.equal(error.details.step, "ownership");
      return true;
    });
    assert.equal(cluster.mutations().length, before, "nothing was mutated");
    assert.equal(persistence.environment.get().state, "ready");
    assert.equal((await service.check("k8s-0001")).success, true, "work intact and gradable");
    persistence.close();
  }));

test("baseline: an unevaluable starting state is not committed as ready", () =>
  withStateDir(async (stateDir) => {
    const cluster = createFakeCluster();
    const { service, persistence } = packaged(cluster, { stateDir });
    // Reads of the graded Pod fail, so the baseline check cannot be evaluated.
    failWhen(cluster, /get pods web/, () => true);
    await assert.rejects(service.activate("k8s-0001"), (error) => {
      assert.equal(error.details.step, "baseline");
      assert.match(error.message, /could not be verified/);
      return true;
    });
    assert.equal(persistence.environment.get().state, "preparing");
    await assert.rejects(service.check("k8s-0001"), InactiveExerciseError);
    persistence.close();
  }));
