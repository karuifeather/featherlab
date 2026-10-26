import test from "node:test";
import assert from "node:assert/strict";
import { EnvironmentError } from "../../src/core/errors.mjs";
import { createWorkstationRunner } from "../../src/infrastructure/docker/workstation-runner.mjs";

function fakeExec(outcome) {
  const seen = {};
  const execFile = (file, args, options, callback) => {
    Object.assign(seen, { file, args, options });
    const child = { stdin: { end: (data) => (seen.stdin = data) } };
    queueMicrotask(() => callback(...outcome));
    return child;
  };
  return { execFile, seen };
}

test("runs kubectl through docker exec with no shell", async () => {
  const { execFile, seen } = fakeExec([null, "out", ""]);
  const runner = createWorkstationRunner({ container: "ws", execFile });
  const result = await runner.run(["kubectl", "get", "pods"]);
  assert.deepEqual(result, { stdout: "out", stderr: "", exitCode: 0 });
  assert.equal(seen.file, "docker");
  assert.deepEqual(seen.args, ["exec", "ws", "kubectl", "get", "pods"]);
});

test("stdin switches on docker exec -i and is delivered", async () => {
  const { execFile, seen } = fakeExec([null, "", ""]);
  await createWorkstationRunner({ container: "ws", execFile }).run(
    ["kubectl", "apply", "-f", "-"],
    {
      stdin: "{}",
    },
  );
  assert.deepEqual(seen.args.slice(0, 3), ["exec", "-i", "ws"]);
  assert.equal(seen.stdin, "{}");
});

test("a non-zero kubectl exit resolves so callers can interpret it", async () => {
  const { execFile } = fakeExec([Object.assign(new Error("x"), { code: 1 }), "", "NotFound"]);
  const result = await createWorkstationRunner({ execFile }).run(["kubectl", "get", "pod", "x"]);
  assert.deepEqual(result, { stdout: "", stderr: "NotFound", exitCode: 1 });
});

test("docker-level failures reject as unavailable", async () => {
  for (const stderr of [
    "Error response from daemon: No such container: featherlab-workstation",
    "Cannot connect to the Docker daemon at unix:///var/run/docker.sock",
    "Error response from daemon: container is not running",
  ]) {
    const { execFile } = fakeExec([Object.assign(new Error("x"), { code: 1 }), "", stderr]);
    await assert.rejects(createWorkstationRunner({ execFile }).run(["kubectl", "version"]), (e) => {
      assert.ok(e instanceof EnvironmentError);
      assert.equal(e.reason, "unavailable");
      return true;
    });
  }
});

test("a missing docker binary rejects as unavailable", async () => {
  const { execFile } = fakeExec([Object.assign(new Error("x"), { code: "ENOENT" }), "", ""]);
  await assert.rejects(
    createWorkstationRunner({ execFile }).run(["kubectl", "version"]),
    EnvironmentError,
  );
});

test("timeouts and aborts reject with reason=timeout", async () => {
  for (const error of [
    Object.assign(new Error("x"), { killed: true, signal: "SIGTERM" }),
    Object.assign(new Error("x"), { name: "AbortError" }),
  ]) {
    const { execFile } = fakeExec([error, "", ""]);
    await assert.rejects(createWorkstationRunner({ execFile }).run(["kubectl", "get"]), (e) => {
      assert.equal(e.reason, "timeout");
      return true;
    });
  }
});

test("only allow-listed binaries can run", async () => {
  const { execFile, seen } = fakeExec([null, "", ""]);
  const runner = createWorkstationRunner({ execFile });
  for (const binary of ["bash", "sh", "docker", "rm", "kubectl; rm -rf /"])
    await assert.rejects(runner.run([binary, "-c", "id"]), /not permitted/);
  assert.equal(seen.file, undefined);
});
