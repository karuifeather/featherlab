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

test("exec returns stdout when variable is set (exit 0)", async () => {
  const cluster = createFakeCluster({ resources: [readyPod()] });
  cluster.setEnvResult("web", "FEATURE_FLAG", "enabled");
  const query = new KubernetesQuery({ runner: cluster });
  const result = await query.exec({
    podName: "web",
    namespace: "fl-k8s-0001",
    container: "c",
    key: "FEATURE_FLAG",
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), "enabled");
});

test("exec returns exit 1 when variable is unset", async () => {
  const cluster = createFakeCluster({ resources: [readyPod()] });
  const query = new KubernetesQuery({ runner: cluster });
  const result = await query.exec({
    podName: "web",
    namespace: "fl-k8s-0001",
    container: "c",
    key: "MISSING_VAR",
  });
  assert.equal(result.exitCode, 1);
});

test("exec places --request-timeout before -- so it is kubectl's flag not the pod command's", async () => {
  const cluster = createFakeCluster({ resources: [readyPod()] });
  cluster.setEnvResult("web", "X", "y");
  const query = new KubernetesQuery({ runner: cluster });
  await query.exec({ podName: "web", namespace: "fl-k8s-0001", container: "c", key: "X" });
  const argv = cluster.calls.at(-1).argv;
  const ddIdx = argv.indexOf("--");
  const timeoutIdx = argv.findIndex((a) => a.startsWith("--request-timeout"));
  assert.ok(timeoutIdx >= 0, "--request-timeout is present");
  assert.ok(timeoutIdx < ddIdx, "--request-timeout comes before --");
});

test("exec is memoized within one grading pass", async () => {
  const cluster = createFakeCluster({ resources: [readyPod()] });
  cluster.setEnvResult("web", "KEY", "val");
  const query = new KubernetesQuery({ runner: cluster });
  const opts = { podName: "web", namespace: "fl-k8s-0001", container: "c", key: "KEY" };
  await Promise.all([query.exec(opts), query.exec(opts), query.exec(opts)]);
  const execCalls = cluster.calls.filter((c) => c.argv[1] === "exec");
  assert.equal(execCalls.length, 1);
});

test("exec throws EnvironmentError on unexpected exit codes", async () => {
  const broken = { run: async () => ({ stdout: "", stderr: "OOMKilled", exitCode: 137 }) };
  const query = new KubernetesQuery({ runner: broken });
  await assert.rejects(
    query.exec({ podName: "web", namespace: "ns", container: "c", key: "X" }),
    EnvironmentError,
  );
});
