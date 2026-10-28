import { setTimeout as sleep } from "node:timers/promises";
import { parseAllDocuments } from "yaml";
import { EnvironmentError, LifecycleError } from "../../core/errors.mjs";
import { check } from "../../core/schema.mjs";
import { relativePathSpec } from "../../core/exercises/definition.mjs";
import { DNS_LABEL, DNS_SUBDOMAIN, KIND_NAMES, KINDS, PROTECTED_NAMESPACES } from "./kinds.mjs";

export const MANAGED_BY_LABEL = "app.kubernetes.io/managed-by";
export const EXERCISE_LABEL = "featherlab.dev/exercise";
/** Every exercise namespace is `fl-<exercise id>` or `fl-<exercise id>-<suffix>`. */
export const NAMESPACE_PREFIX = "fl-";
const REQUEST_TIMEOUT = "--request-timeout=15s";

const LIFECYCLE_SPEC = {
  type: "object",
  properties: {
    namespaces: {
      type: "array",
      required: true,
      minItems: 1,
      items: { type: "string", maxLength: 63, pattern: DNS_LABEL },
    },
    setup: {
      type: "object",
      properties: {
        manifests: { type: "array", items: relativePathSpec },
        steps: {
          type: "array",
          items: {
            type: "object",
            open: true,
            properties: {
              apply: { ...relativePathSpec, required: true },
              waitRollout: {
                type: "object",
                open: true,
                properties: {
                  name: { type: "string", required: true, pattern: DNS_SUBDOMAIN },
                  namespace: { type: "string", required: true, pattern: DNS_LABEL },
                },
              },
            },
          },
        },
      },
    },
  },
};

/** The namespace every exercise owns; additional ones extend it with `-<suffix>`. */
export function primaryNamespace(exerciseId) {
  return `${NAMESPACE_PREFIX}${exerciseId}`;
}

function refKey({ kind, name, namespace }) {
  return `${kind}/${namespace ? `${namespace}/` : ""}${name}`;
}

function checkNamespaces(namespaces, exerciseId, problems) {
  const primary = primaryNamespace(exerciseId);
  const seen = new Set();
  namespaces.forEach((name, i) => {
    if (typeof name !== "string") return;
    const path = `namespaces[${i}]`;
    if (seen.has(name)) problems.add(path, `duplicate namespace "${name}"`);
    seen.add(name);
    if (i === 0 && name !== primary)
      problems.add(path, `the first namespace must be "${primary}" (fl-<exercise id>)`);
    if (i > 0 && !name.startsWith(`${primary}-`))
      problems.add(path, `additional namespaces must be named "${primary}-<suffix>"`);
    if (PROTECTED_NAMESPACES.includes(name) || name.startsWith("kube-"))
      problems.add(path, `namespace "${name}" is protected and may not be managed`);
  });
}

/** Setup objects must be namespaced kinds that live in one of the declared namespaces. */
function checkPlacement(object, namespaces, problems, path) {
  const { kind } = object;
  const { name, namespace } = object.metadata;
  const spec = KINDS[kind];
  if (!spec) return;
  if (kind === "Namespace")
    return problems.add(
      path,
      "Namespace objects are not allowed in setup manifests; declare them in lifecycle.namespaces",
    );
  if (!spec.namespaced)
    return problems.add(
      path,
      `${kind} is cluster-scoped; exercises may only create objects inside their own namespaces`,
    );
  if (!namespace) return problems.add(path, `${kind} "${name}" requires an explicit namespace`);
  if (!namespaces.includes(namespace))
    problems.add(
      path,
      `${kind} "${name}" is in namespace "${namespace}", which this exercise does not declare (declared: ${namespaces.join(", ")})`,
    );
}

function loadManifest(file, reader, namespaces, problems, path) {
  let text;
  try {
    text = reader.readText(file);
  } catch (error) {
    problems.add(path, `cannot read "${file}": ${error.message}`);
    return [];
  }
  const resources = [];
  const documents = parseAllDocuments(text);
  documents.forEach((doc, i) => {
    const where = `${path} (${file}, document ${i + 1})`;
    if (doc.errors.length > 0) {
      problems.add(where, `invalid YAML: ${doc.errors[0].message}`);
      return;
    }
    const object = doc.toJS();
    if (object === null || object === undefined) return;
    const before = problems.list.length;
    check(
      object,
      {
        type: "object",
        open: true,
        properties: {
          apiVersion: { type: "string", required: true },
          kind: { type: "string", required: true, enum: KIND_NAMES },
          metadata: {
            type: "object",
            required: true,
            open: true,
            properties: {
              name: { type: "string", required: true, pattern: DNS_SUBDOMAIN },
              namespace: { type: "string", pattern: DNS_LABEL },
            },
          },
        },
      },
      where,
      problems,
    );
    if (problems.list.length > before) return;
    if (object.metadata.generateName !== undefined)
      return problems.add(where, "generateName is not supported; use a fixed metadata.name");
    checkPlacement(object, namespaces, problems, where);
    if (problems.list.length > before) return;
    resources.push(object);
  });
  return resources;
}

/**
 * Load-time validation of the Kubernetes `lifecycle` section. Produces an immutable plan:
 *   { namespaces: [names, primary first], resources: [setup objects, all inside them],
 *     claims: [cluster resources this exercise owns, for duplicate detection] }
 *
 * Every Kubernetes exercise owns dedicated namespaces. Reset and cleanup delete them
 * (after verifying ownership) and recreate them, so there is no per-object delete list.
 */
export function compileLifecycle(raw, { exerciseId, reader, problems }) {
  if (raw.reset !== undefined)
    problems.add(
      "reset",
      "reset.delete is no longer supported: an exercise's objects live in its declared namespaces, which are deleted and recreated on reset",
    );
  const rest = { ...raw };
  delete rest.reset; // reported above with a specific message
  check(rest, LIFECYCLE_SPEC, "", problems);
  const namespaces = Array.isArray(raw.namespaces)
    ? raw.namespaces.filter((n) => typeof n === "string")
    : [];
  checkNamespaces(namespaces, exerciseId, problems);

  const resources = [];
  // Shape errors were recorded above; only walk what is well-formed.
  const manifests = Array.isArray(raw.setup?.manifests) ? raw.setup.manifests : [];
  manifests.forEach((file, i) => {
    if (typeof file === "string")
      resources.push(...loadManifest(file, reader, namespaces, problems, `setup.manifests[${i}]`));
  });
  const seen = new Set();
  for (const r of resources) {
    const key = refKey({ kind: r.kind, name: r.metadata.name, namespace: r.metadata.namespace });
    if (seen.has(key)) problems.add("setup.manifests", `${key} is defined more than once`);
    seen.add(key);
  }
  const setupSteps = [];
  const rawSteps = Array.isArray(raw.setup?.steps) ? raw.setup.steps : [];
  rawSteps.forEach((step, i) => {
    if (typeof step?.apply !== "string") return;
    const stepResources = loadManifest(
      step.apply,
      reader,
      namespaces,
      problems,
      `setup.steps[${i}].apply`,
    );
    const waitRollout =
      step.waitRollout &&
      typeof step.waitRollout.name === "string" &&
      typeof step.waitRollout.namespace === "string"
        ? { name: step.waitRollout.name, namespace: step.waitRollout.namespace }
        : undefined;
    setupSteps.push({ resources: stepResources, waitRollout });
  });

  return { namespaces, resources, setupSteps, claims: namespaces.map((n) => `Namespace/${n}`) };
}

/** Walk checks, including the nested `params.checks` of combinators. */
function* walkChecks(checks) {
  for (const c of checks ?? []) {
    if (!c || typeof c !== "object") continue;
    yield c;
    if (Array.isArray(c.params?.checks)) yield* walkChecks(c.params.checks);
  }
}

/**
 * Checks may only look at the exercise's own namespaces. A check against `default` (or
 * another exercise's namespace) could be satisfied by objects this exercise does not own,
 * and they would survive a reset.
 */
export function validateCheckScope(checks, plan, { problems }) {
  if (!plan || !Array.isArray(checks)) return;
  const allowed = plan.namespaces;
  checks.forEach((top, i) => {
    for (const c of walkChecks([top])) {
      const p = c.params ?? {};
      if (typeof p.namespace === "string" && !allowed.includes(p.namespace))
        problems.add(
          `checks[${i}]`,
          `targets namespace "${p.namespace}", which this exercise does not declare (declared: ${allowed.join(", ")})`,
        );
      if (p.kind === "Namespace" && typeof p.name === "string" && !allowed.includes(p.name))
        problems.add(
          `checks[${i}]`,
          `targets Namespace "${p.name}", which this exercise does not declare`,
        );
    }
  });
}

function withManagedLabels(resource, exerciseId) {
  return {
    ...resource,
    metadata: {
      ...resource.metadata,
      labels: {
        ...resource.metadata.labels,
        [MANAGED_BY_LABEL]: "featherlab",
        [EXERCISE_LABEL]: exerciseId,
      },
    },
  };
}

function namespaceObject(name, exerciseId) {
  return withManagedLabels({ apiVersion: "v1", kind: "Namespace", metadata: { name } }, exerciseId);
}

/** Owned = carries both FeatherLab ownership labels, naming exactly this exercise. */
function isOwnedBy(object, exerciseId) {
  const labels = object?.metadata?.labels ?? {};
  return labels[MANAGED_BY_LABEL] === "featherlab" && labels[EXERCISE_LABEL] === exerciseId;
}

function firstLine(text) {
  return text.trim().split("\n")[0].slice(0, 300);
}

/**
 * Lifecycle driver for the Kubernetes track. It is the only Kubernetes component that
 * mutates the cluster.
 *
 * Every exercise owns dedicated namespaces (`fl-<id>`, `fl-<id>-<suffix>`). Reset deletes
 * them and recreates them from the exercise's setup manifests; cleanup deletes them. Deleting
 * a namespace removes every namespaced object in it, including objects the learner created
 * that no exercise declared. It never touches anything outside those namespaces.
 *
 * A namespace is only deleted after it is verified to carry FeatherLab's ownership labels for
 * this exact exercise, and the delete is bound to the verified object's UID, so a namespace
 * recreated by someone else in between is never removed. A same-named namespace without those
 * labels is refused, not adopted. Finalizers are never removed: a namespace stuck in
 * Terminating fails with a bounded, explanatory error.
 *
 * Every step can be re-run: a partially failed reset is recovered by running it again.
 *
 * @param {object} options
 * @param {object} options.runner               CommandRunner for kubectl
 * @param {Function} options.createQuery        ({signal}) => KubernetesQuery
 * @param {string} [options.expectedContext]    kubeconfig context that must be current
 *   (e.g. "kind-featherlab"); prepare fails otherwise, before anything else runs
 * @param {number} [options.namespaceDeleteTimeoutMs]  bound on waiting for termination
 * @param {number} [options.pollMs]
 */
export function createDriver({
  runner,
  createQuery,
  expectedContext,
  namespaceDeleteTimeoutMs = 75_000,
  serviceAccountTimeoutMs = 30_000,
  pollMs = 1_000,
}) {
  async function kubectl(args, { signal, timeoutMs = 30_000, stdin } = {}) {
    return runner.run(["kubectl", ...args, REQUEST_TIMEOUT], { signal, timeoutMs, stdin });
  }

  /** Run named steps in order; on failure report what had already completed. */
  async function steps(operation, plan) {
    const completed = [];
    for (const { name, run } of plan) {
      try {
        const result = await run();
        if (result && result.exitCode !== 0)
          throw new Error(firstLine(result.stderr) || "kubectl failed");
        if (result !== null) completed.push(name);
      } catch (caught) {
        // A deadline that expires while polling (not inside kubectl) is still a timeout.
        const error =
          caught?.name === "AbortError"
            ? new EnvironmentError("The operation timed out.", { reason: "timeout", cause: caught })
            : caught;
        if (error instanceof LifecycleError) {
          error.details.completed = [...error.details.completed, ...completed];
          throw error;
        }
        const message = `${operation} stopped at "${name}": ${error.message}. Run it again to resume.`;
        if (error instanceof EnvironmentError)
          throw new EnvironmentError(message, {
            reason: error.reason,
            details: { step: name, completed },
            cause: error,
          });
        throw new LifecycleError(operation.toLowerCase(), name, message, {
          completed,
          cause: error,
        });
      }
    }
    return completed;
  }

  /**
   * Fresh (never memoized) read. A garbled response (seen under load as an empty stdout from
   * `docker exec`) is retried briefly: reads are side-effect free, and a mutation decision must
   * not hinge on one bad read.
   */
  async function readNamespace(name, signal, attempts = 3) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await createQuery({ signal }).get({ kind: "Namespace", name });
      } catch (error) {
        if (!(error instanceof EnvironmentError) || error.reason !== "bad-response") throw error;
        if (attempt >= attempts) throw error;
        await sleep(pollMs, undefined, { signal });
      }
    }
  }

  /** One namespace's ownership state. */
  async function namespaceState(name, exercise, signal) {
    const ns = await readNamespace(name, signal);
    if (!ns) return { name, state: "absent" };
    if (!isOwnedBy(ns, exercise.id)) return { name, state: "foreign" };
    if (ns.metadata.deletionTimestamp) return { name, state: "terminating", object: ns };
    return { name, state: "owned", object: ns };
  }

  const foreignMessage = (name, exercise) =>
    `Namespace "${name}" exists but is not marked as owned by FeatherLab exercise "${exercise.id}", so FeatherLab will not delete or reuse it. If you created it, remove it yourself (kubectl delete namespace ${name}) and try again.`;

  async function waitUntilGone(operation, name, exercise, signal) {
    const deadline = Date.now() + namespaceDeleteTimeoutMs;
    let last;
    while (Date.now() < deadline) {
      last = await namespaceState(name, exercise, signal);
      if (last.state === "absent") return;
      await sleep(pollMs, undefined, { signal });
    }
    const conditions = (last?.object?.status?.conditions ?? [])
      .filter((c) => c.status === "True" && c.message)
      .map((c) => c.message);
    throw new LifecycleError(
      operation,
      `wait for Namespace/${name}`,
      `Namespace "${name}" is still terminating after ${Math.round(namespaceDeleteTimeoutMs / 1000)}s.${conditions.length ? ` Kubernetes reports: ${conditions.join(" ").slice(0, 400)}` : ""} FeatherLab never removes finalizers. Inspect it with "kubectl get namespace ${name} -o yaml"; once it is gone, try again.`,
    );
  }

  /** Delete one exercise namespace if it exists and is verifiably owned; wait for it to go. */
  const deleteNamespaceStep = (operation, name, exercise, signal) => ({
    name: `delete Namespace/${name}`,
    async run() {
      const current = await namespaceState(name, exercise, signal);
      if (current.state === "absent") return null;
      if (current.state === "foreign")
        throw new LifecycleError(operation, "ownership", foreignMessage(name, exercise));
      if (current.state === "owned") {
        // Bound to the verified object: a namespace replaced since the read is not deleted.
        const options = {
          kind: "DeleteOptions",
          apiVersion: "v1",
          preconditions: { uid: current.object.metadata.uid },
        };
        const result = await kubectl(["delete", "--raw", `/api/v1/namespaces/${name}`, "-f", "-"], {
          signal,
          stdin: JSON.stringify(options),
        });
        if (result.exitCode !== 0 && !/\(NotFound\)/.test(result.stderr)) return result;
      }
      await waitUntilGone(operation, name, exercise, signal);
      return { exitCode: 0, stderr: "" };
    },
  });

  const deleteNamespacesPlan = (operation, exercise, signal) =>
    [...exercise.lifecycle.namespaces]
      .reverse()
      .map((name) => deleteNamespaceStep(operation, name, exercise, signal));

  /** `create`, never `apply`: an object that already exists is an error, not adopted. */
  const createObject = (object, signal) =>
    kubectl(["create", "-f", "-"], { signal, stdin: JSON.stringify(object) });

  /** A Pod created before the namespace's default ServiceAccount exists is rejected. */
  async function waitForServiceAccount(namespace, signal) {
    const deadline = Date.now() + serviceAccountTimeoutMs;
    let result;
    while (Date.now() < deadline) {
      result = await kubectl(["get", "serviceaccount", "default", "-n", namespace, "-o", "name"], {
        signal,
      });
      if (result.exitCode === 0) return result;
      await sleep(pollMs, undefined, { signal });
    }
    return result;
  }

  /** Poll until a Deployment's rollout is complete; for use in multi-revision setup steps. */
  async function waitForRollout(name, namespace, signal, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      last = await kubectl(
        ["rollout", "status", `deployment/${name}`, "-n", namespace, "--timeout=10s"],
        { signal, timeoutMs: 15_000 },
      );
      if (last.exitCode === 0) return last;
      await sleep(pollMs, undefined, { signal });
    }
    throw new EnvironmentError(
      `Setup rollout for "${name}" in "${namespace}" did not complete within ${Math.round(timeoutMs / 1000)}s. Reset the exercise to try again.`,
      { reason: "timeout" },
    );
  }

  /** Plan for applying ordered setup step manifests and optionally waiting for rollouts. */
  const setupStepsPlan = (exercise, signal) =>
    (exercise.lifecycle.setupSteps ?? []).flatMap((step, stepIdx) => {
      const applySteps = step.resources.map((resource, resIdx) => ({
        name: `apply setup step ${stepIdx + 1} resource ${resIdx + 1}`,
        run: () => kubectl(["apply", "-f", "-"], { signal, stdin: JSON.stringify(resource) }),
      }));
      if (!step.waitRollout) return applySteps;
      return [
        ...applySteps,
        {
          name: `wait rollout ${step.waitRollout.name} (step ${stepIdx + 1})`,
          run: () => waitForRollout(step.waitRollout.name, step.waitRollout.namespace, signal),
        },
      ];
    });

  const createPlan = (exercise, signal) => [
    ...exercise.lifecycle.namespaces.map((name) => ({
      name: `create Namespace/${name}`,
      run: () => createObject(namespaceObject(name, exercise.id), signal),
    })),
    ...(exercise.lifecycle.resources.length === 0
      ? []
      : exercise.lifecycle.namespaces.map((name) => ({
          name: `wait for ServiceAccount ${name}/default`,
          run: () => waitForServiceAccount(name, signal),
        }))),
    ...exercise.lifecycle.resources.map((resource) => ({
      name: `create ${refKey({ kind: resource.kind, name: resource.metadata.name, namespace: resource.metadata.namespace })}`,
      run: () => createObject(withManagedLabels(resource, exercise.id), signal),
    })),
    ...setupStepsPlan(exercise, signal),
  ];

  return {
    async prepare({ signal }) {
      if (expectedContext) {
        const context = await kubectl(["config", "current-context"], { signal, timeoutMs: 10_000 });
        if (context.exitCode !== 0 || context.stdout.trim() !== expectedContext)
          throw new EnvironmentError(
            "The workstation is not connected to the FeatherLab practice cluster.",
            {
              reason: "unavailable",
              details: { expected: expectedContext, actual: context.stdout?.trim() },
            },
          );
      }
      const result = await kubectl(["get", "--raw", "/readyz"], { signal, timeoutMs: 20_000 });
      if (result.exitCode !== 0)
        throw new EnvironmentError("The practice cluster is not ready. Is it running?", {
          reason: "unavailable",
          details: { stderr: firstLine(result.stderr) },
        });
    },

    /**
     * Read-only. `intact`: the primary namespace exists and is owned by this exercise, so a
     * previous preparation can be resumed. `blockers`: learner-safe reasons a reset or cleanup
     * would be refused (a same-named namespace FeatherLab does not own).
     */
    async inspect({ exercise, signal }) {
      const states = [];
      for (const name of exercise.lifecycle.namespaces)
        states.push(await namespaceState(name, exercise, signal));
      return {
        intact: states[0]?.state === "owned",
        blockers: states
          .filter((s) => s.state === "foreign")
          .map((s) => foreignMessage(s.name, exercise)),
      };
    },

    async reset({ exercise, signal }) {
      const removed = await steps("Reset", deleteNamespacesPlan("reset", exercise, signal));
      const created = await steps("Reset", createPlan(exercise, signal));
      return [...removed, ...created];
    },

    cleanup: ({ exercise, signal }) =>
      steps("Cleanup", deleteNamespacesPlan("cleanup", exercise, signal)),

    createQuery,
  };
}
