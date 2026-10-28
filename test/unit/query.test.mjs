import test from "node:test";
import assert from "node:assert/strict";
import { EnvironmentError } from "../../src/core/errors.mjs";
import { KubernetesQuery } from "../../src/tracks/kubernetes/query.mjs";
import { createFakeCluster, readyPod } from "../helpers/fake-cluster.mjs";

const ref = { kind: "Pod", name: "web", namespace: "fl-k8s-0001" };

test("get returns the resource, or null when it does not exist", async () => {
  const query = new KubernetesQuery({ runner: createFakeCluster({ resources: [readyPod()] }) });
  assert.equal((await query.get(ref)).metadata.name, "web");
  assert.equal(await query.get({ ...ref, name: "ghost" }), null);
});

test("lookups are memoized within one grading pass", async () => {
  const cluster = createFakeCluster({ resources: [readyPod()] });
  const query = new KubernetesQuery({ runner: cluster });
  await Promise.all([query.get(ref), query.get(ref), query.get(ref)]);
  assert.equal(cluster.calls.length, 1);
});

test("a failing runner or unexpected stderr is an EnvironmentError", async () => {
  const down = createFakeCluster();
  down.down = true;
  await assert.rejects(new KubernetesQuery({ runner: down }).get(ref), EnvironmentError);

  const garbage = { run: async () => ({ stdout: "<html>", stderr: "", exitCode: 0 }) };
  await assert.rejects(
    new KubernetesQuery({ runner: garbage }).get(ref),
    (e) => e.reason === "bad-response",
  );
});

test("unsupported kinds are refused before any command runs", () => {
  const cluster = createFakeCluster();
  assert.throws(() =>
    new KubernetesQuery({ runner: cluster }).get({ kind: "ClusterRole", name: "x" }),
  );
  assert.equal(cluster.calls.length, 0);
});
