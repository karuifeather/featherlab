import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/app.mjs";
import { PID_FILE, PORT_FILE, resetExercise } from "../../src/cli/reset.mjs";
import { startServer } from "../../src/server.mjs";
import { createFakeCluster, readyPod } from "../helpers/fake-cluster.mjs";

const quiet = { warn() {}, error() {} };
const noLocalApp = () => {
  throw new Error("the CLI must not change the environment directly while a server runs");
};

async function withState(fn) {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-cli-reset-"));
  try {
    return await fn(stateDir);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

function markRunning(stateDir, port) {
  writeFileSync(path.join(stateDir, PID_FILE), "4242 999");
  if (port !== undefined) writeFileSync(path.join(stateDir, PORT_FILE), String(port));
}

async function closedPort() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

test("with no running server, reset changes the environment directly", () =>
  withState(async (stateDir) => {
    const cluster = createFakeCluster({ resources: [readyPod()] });
    const { steps, via } = await resetExercise({
      id: "k8s-0001",
      discardActive: false,
      stateDir,
      isAlive: () => true, // no PID file at all
      createLocalApp: () => createApp({ runner: cluster, stateDir, logger: quiet }),
    });
    assert.equal(via, "direct");
    assert.ok(steps.length > 0);
    assert.equal(cluster.find("Pod", "web", "default"), undefined);
  }));

test("a stale PID file (process gone) falls back to the direct path", () =>
  withState(async (stateDir) => {
    markRunning(stateDir, 1);
    const cluster = createFakeCluster();
    const { via } = await resetExercise({
      id: "k8s-0001",
      discardActive: false,
      stateDir,
      isAlive: () => false,
      createLocalApp: () => createApp({ runner: cluster, logger: quiet }),
    });
    assert.equal(via, "direct");
  }));

test("with a running server, reset goes through it and never touches the cluster directly", () =>
  withState(async (stateDir) => {
    const cluster = createFakeCluster();
    const service = createApp({ runner: cluster, logger: quiet }).service;
    const server = await startServer(0, { service });
    try {
      markRunning(stateDir, server.port);
      await service.activate("k8s-0001");
      cluster.put(readyPod());

      const seen = [];
      const { via } = await resetExercise({
        id: "k8s-0001",
        discardActive: false,
        stateDir,
        isAlive: (pid, startTime) => (seen.push([pid, startTime]), true),
        createLocalApp: noLocalApp,
      });
      assert.equal(via, "server");
      assert.deepEqual(seen, [[4242, "999"]]);
      assert.equal(cluster.find("Pod", "web", "default"), undefined, "the server reset it");

      // The server's rules apply: resetting another exercise needs --yes.
      await assert.rejects(
        resetExercise({
          id: "k8s-0002",
          discardActive: false,
          stateDir,
          isAlive: () => true,
          createLocalApp: noLocalApp,
        }),
        (error) => error.code === "ENVIRONMENT_IN_USE" && /Your first Pod/.test(error.message),
      );
      const yes = await resetExercise({
        id: "k8s-0002",
        discardActive: true,
        stateDir,
        isAlive: () => true,
        createLocalApp: noLocalApp,
      });
      assert.equal(yes.via, "server");
      assert.ok(cluster.find("Namespace", "staging"));
    } finally {
      await server.close();
    }
  }));

test("a running server with an unknown address is never bypassed", () =>
  withState(async (stateDir) => {
    markRunning(stateDir); // PID file only, no port file
    await assert.rejects(
      resetExercise({
        id: "k8s-0001",
        discardActive: false,
        stateDir,
        isAlive: () => true,
        createLocalApp: noLocalApp,
      }),
      (error) => error.code === "SERVER_UNREACHABLE" && /PID 4242/.test(error.message),
    );
  }));

test("a running server that does not answer is never bypassed", () =>
  withState(async (stateDir) => {
    markRunning(stateDir, await closedPort());
    await assert.rejects(
      resetExercise({
        id: "k8s-0001",
        discardActive: false,
        stateDir,
        isAlive: () => true,
        createLocalApp: noLocalApp,
      }),
      (error) => error.code === "SERVER_UNREACHABLE" && /did not answer/.test(error.message),
    );
  }));
