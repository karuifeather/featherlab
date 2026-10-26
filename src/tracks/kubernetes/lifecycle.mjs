import { parseAllDocuments } from "yaml";
import { EnvironmentError, LifecycleError } from "../../core/errors.mjs";
import { check } from "../../core/schema.mjs";
import { relativePathSpec } from "../../core/exercises/definition.mjs";
import { DNS_LABEL, DNS_SUBDOMAIN, KIND_NAMES, KINDS, PROTECTED_NAMESPACES } from "./kinds.mjs";

export const MANAGED_BY_LABEL = "app.kubernetes.io/managed-by";
export const EXERCISE_LABEL = "featherlab.dev/exercise";
const REQUEST_TIMEOUT = "--request-timeout=15s";

const LIFECYCLE_SPEC = {
  type: "object",
  properties: {
    setup: {
      type: "object",
      properties: { manifests: { type: "array", items: relativePathSpec } },
    },
    reset: {
      type: "object",
      properties: {
        delete: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", required: true, enum: KIND_NAMES },
              name: { type: "string", required: true, pattern: DNS_SUBDOMAIN },
              namespace: { type: "string", pattern: DNS_LABEL },
            },
          },
        },
      },
    },
  },
};

function refKey({ kind, name, namespace }) {
  return `${kind}/${namespace ? `${namespace}/` : ""}${name}`;
}

/** Placement rules shared by `reset.delete` entries and manifest objects. */
function checkPlacement(kind, name, namespace, problems, path) {
  const spec = KINDS[kind];
  if (!spec) return;
  if (spec.namespaced && !namespace) problems.add(path, `${kind} requires an explicit namespace`);
  if (!spec.namespaced && namespace)
    problems.add(path, `${kind} is cluster-scoped; omit namespace`);
  if (namespace && PROTECTED_NAMESPACES.includes(namespace))
    problems.add(path, `namespace "${namespace}" is protected and may not be managed`);
  if (kind === "Namespace" && PROTECTED_NAMESPACES.includes(name))
    problems.add(path, `namespace "${name}" is protected and may not be managed`);
}

function loadManifest(file, reader, problems, path) {
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
    checkPlacement(object.kind, object.metadata.name, object.metadata.namespace, problems, where);
    resources.push(object);
  });
  return resources;
}

/**
 * Load-time validation of the Kubernetes `lifecycle` section. Produces an immutable plan:
 *   { resources: [manifest objects to apply], deletes: [refs removed on reset],
 *     owned: [refs of resources created by setup] }
 */
export function compileLifecycle(raw, { reader, problems }) {
  check(raw, LIFECYCLE_SPEC, "", problems);
  const resources = [];
  const deletes = [];
  // Shape errors were recorded above; only walk what is well-formed.
  const manifests = Array.isArray(raw.setup?.manifests) ? raw.setup.manifests : [];
  const refs = Array.isArray(raw.reset?.delete) ? raw.reset.delete : [];
  manifests.forEach((file, i) => {
    if (typeof file === "string")
      resources.push(...loadManifest(file, reader, problems, `setup.manifests[${i}]`));
  });
  refs.forEach((ref, i) => {
    if (typeof ref !== "object" || ref === null) return;
    const path = `reset.delete[${i}]`;
    if (ref.kind === "Namespace")
      problems.add(path, "Namespaces cannot be deleted on reset; create them in setup instead");
    checkPlacement(ref.kind, ref.name, ref.namespace, problems, path);
    deletes.push({ kind: ref.kind, name: ref.name, namespace: ref.namespace });
  });
  const owned = resources.map((r) => ({
    kind: r.kind,
    name: r.metadata.name,
    namespace: r.metadata.namespace,
  }));
  return { resources, deletes, owned };
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

function firstLine(text) {
  return text.trim().split("\n")[0].slice(0, 300);
}

/**
 * Lifecycle driver for the Kubernetes track. It is the only Kubernetes component that
 * mutates the cluster, and only through the allow-listed kinds and names that survived
 * load-time validation.
 *
 * Every step is idempotent: `apply` converges, `delete --ignore-not-found` is a no-op when
 * the object is gone. Recovery from a partial failure is therefore to run the operation again.
 */
export function createDriver({ runner, createQuery }) {
  async function kubectl(args, { signal, timeoutMs = 30_000, stdin } = {}) {
    return runner.run(["kubectl", ...args, REQUEST_TIMEOUT], { signal, timeoutMs, stdin });
  }

  /** Run named steps in order; on failure report what had already completed. */
  async function steps(operation, plan) {
    const completed = [];
    for (const { name, run } of plan) {
      try {
        const result = await run();
        if (result.exitCode !== 0) throw new Error(firstLine(result.stderr) || "kubectl failed");
        completed.push(name);
      } catch (error) {
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

  const applyPlan = (exercise, signal) =>
    exercise.lifecycle.resources.map((resource) => ({
      name: `apply ${refKey({ kind: resource.kind, name: resource.metadata.name, namespace: resource.metadata.namespace })}`,
      run: () =>
        kubectl(["apply", "-f", "-"], {
          signal,
          stdin: JSON.stringify(withManagedLabels(resource, exercise.id)),
        }),
    }));

  const deletePlan = (refs, signal) =>
    refs.map((ref) => ({
      name: `delete ${refKey(ref)}`,
      run: () =>
        kubectl(
          [
            "delete",
            KINDS[ref.kind].resource,
            ref.name,
            ...(ref.namespace ? ["-n", ref.namespace] : []),
            "--ignore-not-found=true",
            "--wait=true",
            "--timeout=60s",
          ],
          { signal, timeoutMs: 75_000 },
        ),
    }));

  /** Delete setup-created resources, but only those still carrying this exercise's label. */
  const teardownPlan = (exercise, signal) =>
    [...exercise.lifecycle.owned].reverse().map((ref) => ({
      name: `delete managed ${refKey(ref)}`,
      run: async () => {
        const existing = await createQuery({ exercise, signal }).get(ref);
        if (!existing || existing.metadata?.labels?.[EXERCISE_LABEL] !== exercise.id)
          return { exitCode: 0, stderr: "" };
        return deletePlan([ref], signal)[0].run();
      },
    }));

  return {
    async prepare({ signal }) {
      const result = await kubectl(["get", "--raw", "/readyz"], { signal, timeoutMs: 20_000 });
      if (result.exitCode !== 0)
        throw new EnvironmentError("The practice cluster is not ready. Is it running?", {
          reason: "unavailable",
          details: { stderr: firstLine(result.stderr) },
        });
    },

    setup: ({ exercise, signal }) => steps("Setup", applyPlan(exercise, signal)),

    async reset({ exercise, signal }) {
      const removed = await steps("Reset", deletePlan(exercise.lifecycle.deletes, signal));
      const restored = await steps("Reset", applyPlan(exercise, signal));
      return [...removed, ...restored];
    },

    async cleanup({ exercise, signal }) {
      const removed = await steps("Cleanup", deletePlan(exercise.lifecycle.deletes, signal));
      const torn = await steps("Cleanup", teardownPlan(exercise, signal));
      return [...removed, ...torn];
    },

    createQuery,
  };
}
