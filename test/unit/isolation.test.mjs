import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_CLUSTER,
  DEFAULT_STATE_DIR,
  DEFAULT_WORKSTATION,
  resolveEnvironment,
} from "../../src/infrastructure/environment.mjs";
import {
  assertIsolated,
  fingerprint,
  IsolatedEnvironment,
  planIsolatedEnvironment,
  TEST_RUN_LABEL,
} from "../helpers/isolated-environment.mjs";

/** Stateful docker/kind double that records every command it is asked to run. */
function fakeExec({ existingClusters = [], existingContainers = {} } = {}) {
  const calls = [];
  const containers = { ...existingContainers }; // name -> run label
  const clusters = [...existingClusters];
  const exec = (binary, args, options = {}) => {
    calls.push({ binary, args, env: options.env });
    const [a, b] = args;
    if (binary === "kind" && a === "get" && b === "clusters") return clusters.join("\n");
    if (binary === "kind" && a === "create") return clusters.push(args[args.indexOf("--name") + 1]);
    if (binary === "kind" && a === "delete") return "";
    if (binary === "kind" && a === "get" && b === "kubeconfig") return "apiVersion: v1\n";
    if (binary === "docker" && a === "inspect") {
      const name = args.at(-1);
      if (!(name in containers)) throw new Error("No such object");
      return args.includes("--format") && args[2].includes("Labels")
        ? (containers[name] ?? "")
        : "id\n";
    }
    if (binary === "docker" && a === "run") {
      const label = args.find((x) => x.startsWith(`${TEST_RUN_LABEL}=`));
      containers[args[args.indexOf("--name") + 1]] = label?.split("=")[1] ?? "";
      return "";
    }
    if (binary === "docker" && a === "rm") return delete containers[args.at(-1)];
    return "ok\n";
  };
  return { exec, calls, containers, clusters };
}

const mutating = (calls) =>
  calls.filter(
    (c) =>
      (c.binary === "kind" && ["create", "delete"].includes(c.args[0])) ||
      (c.binary === "docker" && ["run", "rm", "stop", "start", "kill"].includes(c.args[0])),
  );

test("planned test environments never use the production names or state directory", () => {
  const a = planIsolatedEnvironment();
  const b = planIsolatedEnvironment();
  for (const config of [a, b]) {
    assert.notEqual(config.cluster, DEFAULT_CLUSTER);
    assert.notEqual(config.workstation, DEFAULT_WORKSTATION);
    assert.notEqual(config.stateDir, DEFAULT_STATE_DIR);
    assert.ok(config.stateDir.startsWith(os.tmpdir()));
    assert.doesNotThrow(() => assertIsolated(config));
  }
  rmSync(a.stateDir, { recursive: true, force: true });
  rmSync(b.stateDir, { recursive: true, force: true });
  assert.notEqual(a.cluster, b.cluster, "each run gets its own cluster");
  assert.notEqual(a.workstation, b.workstation);
});

test("assertIsolated rejects every configuration that could reach the real environment", () => {
  const good = planIsolatedEnvironment();
  const bad = {
    "the production defaults": resolveEnvironment(),
    "the production cluster": { ...good, cluster: DEFAULT_CLUSTER },
    "the production workstation": { ...good, workstation: DEFAULT_WORKSTATION },
    "a look-alike cluster name": { ...good, cluster: "featherlab-test" },
    "a workstation of another cluster": {
      ...good,
      workstation: "featherlab-test-deadbeef-workstation",
    },
    "the real state directory": { ...good, stateDir: DEFAULT_STATE_DIR },
    "the home directory": { ...good, stateDir: os.homedir() },
    "a state directory outside tmp": { ...good, stateDir: path.join(os.homedir(), "state") },
    "a missing run label": { ...good, labels: {} },
    "a mismatched run label": { ...good, labels: { [TEST_RUN_LABEL]: "00000000" } },
  };
  for (const [name, config] of Object.entries(bad))
    assert.throws(() => assertIsolated(config), /non-isolated environment/, name);
  rmSync(good.stateDir, { recursive: true, force: true });
});

test("the harness refuses to be constructed with the production environment", () => {
  const { exec, calls } = fakeExec();
  assert.throws(
    () => new IsolatedEnvironment({ config: resolveEnvironment(), exec }),
    /non-isolated/,
  );
  assert.equal(calls.length, 0);
});

test("start() only addresses test-named resources and a private kubeconfig", () => {
  const before = fingerprint(path.join(DEFAULT_STATE_DIR, "workstation-kubeconfig"));
  const { exec, calls } = fakeExec({
    existingClusters: [DEFAULT_CLUSTER],
    existingContainers: { [DEFAULT_WORKSTATION]: "" },
  });
  const env = new IsolatedEnvironment({ exec });
  try {
    env.start();
    const { cluster, workstation, stateDir } = env.config;
    const kubeconfig = path.join(stateDir, "host-kubeconfig");

    for (const call of calls) {
      assert.equal(call.env.KUBECONFIG, kubeconfig, `${call.binary} ${call.args.join(" ")}`);
      assert.ok(!call.env.KUBECONFIG.includes(".kube"), "never the user's ~/.kube/config");
      assert.ok(!call.args.includes(DEFAULT_CLUSTER), call.args.join(" "));
      assert.ok(!call.args.includes(DEFAULT_WORKSTATION), call.args.join(" "));
    }
    const create = calls.find((c) => c.binary === "kind" && c.args[0] === "create");
    assert.equal(create.args[create.args.indexOf("--name") + 1], cluster);
    assert.equal(create.args[create.args.indexOf("--kubeconfig") + 1], kubeconfig);
    const run = calls.find((c) => c.binary === "docker" && c.args[0] === "run");
    assert.equal(run.args[run.args.indexOf("--name") + 1], workstation);
    assert.ok(run.args.includes(`${TEST_RUN_LABEL}=${cluster.slice("featherlab-test-".length)}`));
    assert.ok(existsSync(path.join(stateDir, "workstation-kubeconfig")));
    assert.ok(path.join(stateDir, "workstation-kubeconfig").startsWith(os.tmpdir()));
  } finally {
    env.teardown();
  }
  assert.equal(fingerprint(path.join(DEFAULT_STATE_DIR, "workstation-kubeconfig")), before);
});

test("the learner workstation never gets the Docker socket or elevated privileges", () => {
  const { exec, calls } = fakeExec();
  const env = new IsolatedEnvironment({ exec }).start();
  try {
    const run = calls.find((c) => c.binary === "docker" && c.args[0] === "run").args;
    assert.ok(!run.some((x) => /docker\.sock/.test(x)), "no docker.sock mount");
    assert.ok(!run.includes("--privileged"));
    assert.ok(!run.some((x) => /^--(pid|net|network)=host$/.test(x)));
    assert.deepEqual(run.slice(run.indexOf("--cap-drop"), run.indexOf("--cap-drop") + 2), [
      "--cap-drop",
      "ALL",
    ]);
    assert.ok(run.includes("no-new-privileges"));
    const mount = run[run.indexOf("--mount") + 1];
    assert.match(mount, /dst=\/home\/learner\/\.kube\/config,readonly$/);
  } finally {
    env.teardown();
  }
});

test("a name collision fails with a clear error and deletes nothing", () => {
  const probe = planIsolatedEnvironment();
  for (const scenario of [
    { existingClusters: [probe.cluster] },
    { existingContainers: { [probe.workstation]: "someone-else" } },
  ]) {
    const { exec, calls } = fakeExec(scenario);
    const env = new IsolatedEnvironment({ config: probe, exec });
    assert.throws(() => env.start(), /already exists; refusing to reuse/);
    env.teardown();
    assert.deepEqual(mutating(calls), [], "a colliding resource must be left untouched");
  }
});

test("teardown removes exactly the claimed resources, and only once", () => {
  const { exec, calls, containers, clusters } = fakeExec({
    existingClusters: [DEFAULT_CLUSTER],
    existingContainers: { [DEFAULT_WORKSTATION]: "" },
  });
  const env = new IsolatedEnvironment({ exec }).start();
  const { cluster, workstation, stateDir } = env.config;
  const afterStart = calls.length;
  env.teardown();
  env.teardown();
  const removals = mutating(calls.slice(afterStart));
  assert.equal(removals.length, 2);
  assert.deepEqual(removals[0].args, ["rm", "-f", workstation]);
  assert.deepEqual(removals[1].args.slice(0, 4), ["delete", "cluster", "--name", cluster]);
  assert.ok(removals[1].args.includes(path.join(stateDir, "host-kubeconfig")));
  assert.ok(DEFAULT_WORKSTATION in containers, "the learner's container is untouched");
  assert.ok(clusters.includes(DEFAULT_CLUSTER), "the learner's cluster is untouched");
  assert.equal(existsSync(stateDir), false);
});

test("a container with a foreign run label is not removed", () => {
  const { exec, calls } = fakeExec();
  const env = new IsolatedEnvironment({ exec }).start();
  const afterStart = calls.length;
  // Someone replaced the container between start and teardown.
  exec("docker", ["rm", "-f", env.config.workstation]);
  exec("docker", ["run", "--name", env.config.workstation, "--label", `${TEST_RUN_LABEL}=other`]);
  const mark = calls.length;
  env.teardown();
  const removed = mutating(calls.slice(mark)).filter((c) => c.args[0] === "rm");
  assert.deepEqual(removed, []);
  assert.ok(afterStart > 0);
});

test("a provisioning failure still cleans up what was created", () => {
  const base = fakeExec();
  let failed = false;
  const exec = (binary, args, options) => {
    if (binary === "docker" && args[0] === "run") {
      failed = true;
      throw new Error("docker run failed");
    }
    return base.exec(binary, args, options);
  };
  const env = new IsolatedEnvironment({ exec });
  assert.throws(() => env.start(), /docker run failed/);
  assert.ok(failed);
  const deletes = base.calls.filter((c) => c.binary === "kind" && c.args[0] === "delete");
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0].args[deletes[0].args.indexOf("--name") + 1], env.config.cluster);
});
