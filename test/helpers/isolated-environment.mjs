import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRuntime, run } from "../../src/lib/runtime.mjs";
import {
  DEFAULT_CLUSTER,
  DEFAULT_STATE_DIR,
  DEFAULT_WORKSTATION,
  resolveEnvironment,
} from "../../src/infrastructure/environment.mjs";
import { createWorkstationRunner } from "../../src/infrastructure/docker/workstation-runner.mjs";

/**
 * A throwaway practice environment for integration and browser tests.
 *
 * It owns a uniquely named kind cluster, workstation container and state directory, and
 * deletes exactly those on teardown. It is built so it cannot touch the learner's real
 * environment:
 *
 *  - names are generated here with a `featherlab-test-` prefix; nothing is read from the
 *    environment or from the production defaults;
 *  - `assertIsolated` rejects any configuration that could address the real cluster,
 *    workstation or ~/.featherlab, and runs before every command;
 *  - kind and docker are invoked with KUBECONFIG pointing at a temporary file, so
 *    ~/.kube/config is never read or written;
 *  - if a resource with the generated name already exists, start() fails instead of
 *    reusing or deleting it;
 *  - teardown removes only what this instance claimed, and verifies the container's
 *    run label before removing it.
 */
export const TEST_RUN_LABEL = "featherlab.test-run";
const CLUSTER_PATTERN = /^featherlab-test-[a-f0-9]{8}$/;
const WORKSTATION_PATTERN = /^featherlab-test-[a-f0-9]{8}-workstation$/;

export function planIsolatedEnvironment({ id = randomBytes(4).toString("hex"), image } = {}) {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), `featherlab-test-${id}-`));
  return resolveEnvironment({
    cluster: `featherlab-test-${id}`,
    workstation: `featherlab-test-${id}-workstation`,
    stateDir,
    labels: { [TEST_RUN_LABEL]: id },
    ...(image ? { image } : {}),
  });
}

/** Throw unless `config` is provably separate from the learner's real environment. */
export function assertIsolated(config) {
  const fail = (why) => {
    throw new Error(`Refusing to run tests against a non-isolated environment: ${why}.`);
  };
  if (config.cluster === DEFAULT_CLUSTER || !CLUSTER_PATTERN.test(config.cluster))
    fail(`cluster "${config.cluster}" is not a featherlab-test-<id> cluster`);
  if (config.workstation === DEFAULT_WORKSTATION || !WORKSTATION_PATTERN.test(config.workstation))
    fail(`workstation "${config.workstation}" is not a featherlab-test-<id> workstation`);
  const id = config.cluster.slice("featherlab-test-".length);
  if (config.workstation !== `${config.cluster}-workstation`)
    fail("workstation does not belong to the test cluster");
  if (config.labels?.[TEST_RUN_LABEL] !== id) fail("missing test-run label");
  const state = path.resolve(config.stateDir);
  const tmp = realpathSync(os.tmpdir());
  const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
  if (!inside(state, tmp) && !inside(state, os.tmpdir()))
    fail(`state directory "${state}" is outside the temp directory`);
  if (inside(state, DEFAULT_STATE_DIR) || state === os.homedir())
    fail("state directory is the learner's ~/.featherlab");
}

export class IsolatedEnvironment {
  #exec;
  #claimed = { cluster: false, workstation: false };
  #kubeconfig;
  #onExit;
  #signalHandlers = [];
  #tornDown = false;

  constructor({
    config = planIsolatedEnvironment(),
    exec = run,
    log = { log() {}, error() {} },
  } = {}) {
    assertIsolated(config);
    this.config = config;
    this.log = log;
    this.#kubeconfig = path.join(config.stateDir, "host-kubeconfig");
    // Every command runs against a private kubeconfig, never the user's default one.
    this.#exec = (binary, args, options = {}) => {
      assertIsolated(config);
      return exec(binary, args, {
        ...options,
        env: { ...process.env, ...options.env, KUBECONFIG: this.#kubeconfig },
      });
    };
    this.runner = createWorkstationRunner({ container: config.workstation });
  }

  /** Create the cluster and workstation. Fails, touching nothing, on a name collision. */
  start() {
    const { cluster, workstation } = this.config;
    const clusters = this.#exec("kind", ["get", "clusters"]).trim().split(/\s+/);
    if (clusters.includes(cluster))
      throw new Error(`Test cluster "${cluster}" already exists; refusing to reuse or delete it.`);
    if (this.#exists(workstation))
      throw new Error(`Test container "${workstation}" already exists; refusing to reuse it.`);

    this.#installCleanup();
    // Claimed before provisioning so a half-created environment is still cleaned up.
    this.#claimed = { cluster: true, workstation: true };
    try {
      createRuntime(this.config, { exec: this.#exec, log: this.log }).provision();
    } catch (error) {
      this.teardown();
      if (/Multi-User System|Too many open files/.test(error.message))
        error.message += `\nHint: the host may be out of inotify instances. Try: sudo sysctl -w fs.inotify.max_user_instances=512`;
      throw error;
    }
    return this;
  }

  kubectl(...args) {
    return this.#exec("docker", ["exec", this.config.workstation, "kubectl", ...args]);
  }

  /** kubectl in the workstation with `input` on stdin (e.g. `apply -f -`), as the learner. */
  kubectlWithInput(input, ...args) {
    return this.#exec("docker", ["exec", "-i", this.config.workstation, "kubectl", ...args], {
      input,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }

  docker(...args) {
    return this.#exec("docker", args);
  }

  #exists(container) {
    try {
      this.#exec("docker", ["inspect", "--format", "{{.Id}}", container]);
      return true;
    } catch {
      return false;
    }
  }

  /** Remove exactly the resources this instance created. Safe to call repeatedly. */
  teardown() {
    if (this.#tornDown) return;
    this.#tornDown = true;
    this.#removeCleanup();
    const { cluster, workstation, stateDir, labels } = this.config;
    const attempt = (fn) => {
      try {
        fn();
      } catch (error) {
        this.log.error?.(`teardown: ${error.message}`);
      }
    };
    if (this.#claimed.workstation)
      attempt(() => {
        if (!this.#exists(workstation)) return;
        const label = this.#exec("docker", [
          "inspect",
          "--format",
          `{{index .Config.Labels "${TEST_RUN_LABEL}"}}`,
          workstation,
        ]).trim();
        if (label === labels[TEST_RUN_LABEL])
          this.#exec("docker", ["rm", "-f", workstation], { timeout: 60_000 });
      });
    if (this.#claimed.cluster)
      attempt(() =>
        this.#exec(
          "kind",
          ["delete", "cluster", "--name", cluster, "--kubeconfig", this.#kubeconfig],
          {
            timeout: 120_000,
          },
        ),
      );
    attempt(
      () => assertIsolated(this.config) || rmSync(stateDir, { recursive: true, force: true }),
    );
  }

  /** Clean up on normal exit and on interruption (Ctrl+C, SIGTERM). */
  #installCleanup() {
    this.#onExit = () => this.teardown();
    process.once("exit", this.#onExit);
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
      const handler = () => {
        this.teardown();
        process.exit(130);
      };
      process.once(signal, handler);
      this.#signalHandlers.push([signal, handler]);
    }
  }

  #removeCleanup() {
    if (this.#onExit) process.removeListener("exit", this.#onExit);
    for (const [signal, handler] of this.#signalHandlers) process.removeListener(signal, handler);
    this.#signalHandlers = [];
  }
}

/** sha256 of a file or "absent": lets a test prove the user's files were left alone. */
export function fingerprint(file) {
  try {
    return execFileSync("sha256sum", [file], { encoding: "utf8" }).split(" ")[0];
  } catch {
    return "absent";
  }
}

/** For code that only knows a workstation name (e.g. a browser test pausing it). */
export function assertTestWorkstation(name) {
  if (name === DEFAULT_WORKSTATION || !WORKSTATION_PATTERN.test(name ?? ""))
    throw new Error(`Refusing to act on "${name}": not a featherlab-test workstation.`);
  return name;
}
