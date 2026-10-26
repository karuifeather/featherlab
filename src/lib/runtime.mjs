import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pkg from "../../package.json" with { type: "json" };

export const CLUSTER = "featherlab";
export const WORKSTATION = "featherlab-workstation";
export const IMAGE =
  process.env.FEATHERLAB_IMAGE || `ghcr.io/karuifeather/featherlab-workstation:${pkg.version}`;
export const STATE = path.join(os.homedir(), ".featherlab");
const NODE_IMAGE =
  "kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5";

export function run(binary, args, options = {}) {
  try {
    return execFileSync(binary, args, {
      encoding: "utf8",
      timeout: options.timeout ?? 180000,
      stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
      ...options,
    });
  } catch (error) {
    const details = error.stderr?.toString().trim() || error.message;
    throw new Error(`${binary} ${args.join(" ")}: ${details}`);
  }
}

export function doctor() {
  const checks = [
    ["Docker CLI", () => run("docker", ["--version"])],
    ["Docker daemon", () => run("docker", ["info", "--format", "{{.ServerVersion}}"])],
    ["kind", () => run("kind", ["version"])],
  ];
  let ok = true;
  for (const [name, check] of checks) {
    try {
      console.log(`  ✓ ${name}: ${String(check()).trim()}`);
    } catch (error) {
      console.error(`  ✗ ${name}: ${error.message}`);
      ok = false;
    }
  }
  return ok;
}

function containerState() {
  try {
    return run("docker", ["inspect", "--format", "{{.State.Running}}", WORKSTATION]).trim();
  } catch {
    return "missing";
  }
}

export function provision() {
  if (!doctor()) throw new Error("Install or start Docker and kind. See README prerequisites.");
  mkdirSync(STATE, { recursive: true, mode: 0o700 });
  const clusters = run("kind", ["get", "clusters"]).trim().split(/\s+/);
  if (!clusters.includes(CLUSTER)) {
    console.log("Creating isolated kind cluster (first launch may download images)...");
    run(
      "kind",
      [
        "create",
        "cluster",
        "--name",
        CLUSTER,
        "--wait",
        "180s",
        "--image",
        NODE_IMAGE,
        "--kubeconfig",
        path.join(STATE, "host-kubeconfig"),
      ],
      { timeout: 360000, stdio: "inherit" },
    );
  }
  const config = run("kind", ["get", "kubeconfig", "--name", CLUSTER, "--internal"]);
  const kubeconfigPath = path.join(STATE, "workstation-kubeconfig");
  writeFileSync(kubeconfigPath, config, { mode: 0o600 });
  // The learner container uses UID 1000; its read-only bind mount must be readable.
  // The parent ~/.featherlab directory remains owner-only (0700).
  chmodSync(kubeconfigPath, 0o644);
  const status = containerState();
  if (status === "true") return;
  if (status === "false") {
    console.log("Starting existing workstation...");
    run("docker", ["start", WORKSTATION]);
    return;
  }

  // Use the local image if available; otherwise pull it.
  let imageExists = false;

  try {
    run("docker", ["image", "inspect", IMAGE]);
    imageExists = true;
  } catch {
    // Image is not available locally.
  }

  if (imageExists) {
    console.log(`Using local workstation image: ${IMAGE}`);
  } else {
    console.log(`Pulling workstation image: ${IMAGE}`);
    run("docker", ["pull", IMAGE], {
      timeout: 360000,
      stdio: "inherit",
    });
  }

  console.log("Creating isolated learner workstation...");
  run("docker", [
    "run",
    "-d",
    "--name",
    WORKSTATION,
    "--network",
    "kind",
    "--security-opt",
    "no-new-privileges",
    "--cap-drop",
    "ALL",
    "--pids-limit",
    "256",
    "--memory",
    "512m",
    "--user",
    "learner",
    "-e",
    "KUBECONFIG=/home/learner/.kube/config",
    "--mount",
    `type=bind,src=${kubeconfigPath},dst=/home/learner/.kube/config,readonly`,
    IMAGE,
  ]);
}

export function stop() {
  const status = containerState();
  if (status === "true") run("docker", ["stop", WORKSTATION]);
  console.log("Workstation stopped. Kubernetes cluster and progress preserved.");
}

export function status() {
  console.log(
    `Cluster: ${run("kind", ["get", "clusters"]).includes(CLUSTER) ? CLUSTER : "not created"}`,
  );
  console.log(`Workstation: ${containerState()}`);
  console.log(`Image: ${IMAGE}`);
}

export function resetExercise() {
  run(
    "docker",
    [
      "exec",
      WORKSTATION,
      "kubectl",
      "-n",
      "default",
      "delete",
      "pod",
      "web",
      "--ignore-not-found=true",
      "--wait=false",
    ],
    { timeout: 25000 },
  );
  console.log("First exercise reset.");
}
