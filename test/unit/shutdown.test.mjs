import test from "node:test";
import assert from "node:assert/strict";
import { stopClusterNodes } from "../../src/infrastructure/docker/kind-nodes.mjs";
import { createRuntime } from "../../src/lib/runtime.mjs";
import { LifecycleCoordinator } from "../../src/lifecycle/coordinator.mjs";

const quiet = { log() {}, warn() {}, error() {} };

/** exec stub: one cluster with the given nodes, each labelled for `labelFor(node)`. */
function kindExec({ cluster = "featherlab", nodes, labelFor = () => cluster, running = "true" }) {
  return (binary, args) => {
    if (binary === "kind" && args[0] === "get" && args[1] === "clusters") return `${cluster}\n`;
    if (binary === "kind" && args[0] === "get" && args[1] === "nodes") return nodes.join("\n");
    if (binary === "docker" && args[0] === "inspect" && args[2].includes("Labels"))
      return labelFor(args[3]);
    if (binary === "docker" && args[0] === "inspect") return running;
    throw new Error(`unexpected exec: ${binary} ${args.join(" ")}`);
  };
}

test("stopClusterNodes stops owned nodes in parallel and skips unlabelled containers", async () => {
  const exec = kindExec({
    nodes: ["featherlab-control-plane", "featherlab-worker", "impostor"],
    labelFor: (node) => (node === "impostor" ? "other" : "featherlab"),
  });
  let inFlight = 0;
  let maxInFlight = 0;
  const stop = async () => {
    maxInFlight = Math.max(maxInFlight, ++inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
  };
  const result = await stopClusterNodes("featherlab", { exec, stop, log: quiet });
  assert.deepEqual(result.stopped, ["featherlab-control-plane", "featherlab-worker"]);
  assert.deepEqual(result.skipped, ["impostor"]);
  assert.equal(maxInFlight, 2, "node stops run concurrently");
});

test("stopClusterNodes reports a failed stop without throwing", async () => {
  const exec = kindExec({ nodes: ["featherlab-control-plane"] });
  const stop = async () => {
    throw new Error("boom");
  };
  const result = await stopClusterNodes("featherlab", { exec, stop, log: quiet });
  assert.deepEqual(result.stopped, []);
  assert.equal(result.errors[0].node, "featherlab-control-plane");
  assert.match(result.errors[0].error.message, /boom/);
});

test("runtime.stop() uses a short grace period for the workstation", async () => {
  const calls = [];
  const rt = createRuntime(
    { workstation: "ws" },
    { exec: kindExec({ nodes: [] }), stopper: async (...a) => calls.push(a), log: quiet },
  );
  await rt.stop();
  assert.deepEqual(calls, [[["ws"], { timeoutSec: 1 }]]);
});

test("runtime.stopInBackground() launches detached stops for workstation and owned nodes", () => {
  const calls = [];
  const rt = createRuntime(
    { workstation: "ws", cluster: "featherlab" },
    {
      exec: kindExec({ nodes: ["featherlab-control-plane"] }),
      stopper: (...a) => calls.push(a),
      log: quiet,
    },
  );
  rt.stopInBackground();
  assert.deepEqual(calls, [
    [["ws"], { timeoutSec: 1, background: true }],
    [["featherlab-control-plane"], { background: true }],
  ]);
});

function fakeRuntime({ stopDelayMs = 0 } = {}) {
  const events = [];
  const delay = () => new Promise((resolve) => setTimeout(resolve, stopDelayMs));
  return {
    events,
    config: { stateDir: "/tmp/x", cluster: "featherlab", workstation: "ws" },
    provision() {},
    async stop() {
      events.push("stop:start");
      await delay();
      events.push("stop:end");
    },
    async stopNodes() {
      events.push("nodes:start");
      await delay();
      events.push("nodes:end");
      return { stopped: ["n"], skipped: [], errors: [] };
    },
    stopInBackground() {
      events.push("background");
    },
  };
}

/** A coordinator already in the running state, with a no-op server handle. */
async function runningCoordinator(runtime) {
  const coordinator = new LifecycleCoordinator({
    runtime,
    log: quiet,
    waitForCluster: async () => {},
  });
  await coordinator.start({
    serverFactory: async () => ({ port: 1, close: async () => {}, closeSessions: async () => {} }),
  });
  assert.equal(coordinator.state, "running");
  return coordinator;
}

test("shutdown stops the workstation and cluster nodes concurrently", async () => {
  const runtime = fakeRuntime({ stopDelayMs: 5 });
  const coordinator = await runningCoordinator(runtime);
  const errors = await coordinator.requestShutdown();
  assert.equal(errors, 0);
  assert.deepEqual(runtime.events.slice(0, 2).sort(), ["nodes:start", "stop:start"]);
});

test("stopInBackground() is a no-op once the container stops are already running", async () => {
  const runtime = fakeRuntime({ stopDelayMs: 5 });
  const coordinator = await runningCoordinator(runtime);
  const shutdown = coordinator.requestShutdown();
  await new Promise((resolve) => setImmediate(resolve));
  coordinator.stopInBackground();
  await shutdown;
  assert.ok(!runtime.events.includes("background"));
});

test("stopInBackground() launches detached stops when forced before containers were reached", async () => {
  const runtime = fakeRuntime();
  const coordinator = new LifecycleCoordinator({
    runtime,
    log: quiet,
    waitForCluster: async () => {},
  });
  let releaseSessions;
  const sessionsGate = new Promise((resolve) => (releaseSessions = resolve));
  await coordinator.start({
    serverFactory: async () => ({
      port: 1,
      close: async () => {},
      closeSessions: () => sessionsGate,
    }),
  });
  const shutdown = coordinator.requestShutdown();
  assert.equal(coordinator.state, "stopping");
  coordinator.stopInBackground();
  assert.deepEqual(runtime.events, ["background"]);
  releaseSessions();
  await shutdown;
});
