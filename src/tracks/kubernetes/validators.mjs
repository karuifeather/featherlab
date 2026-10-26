import { check } from "../../core/schema.mjs";
import { DNS_LABEL, DNS_SUBDOMAIN, KIND_NAMES, KINDS, podSpecOf } from "./kinds.mjs";

/**
 * Reusable Kubernetes validators. Each declares its params and reads cluster state only
 * through `ctx.query` (a KubernetesQuery), so none of them know how kubectl is invoked.
 *
 * Add a validator by defining it with `resourceValidator` (or by hand for checks that do
 * not target a single resource) and appending it to `kubernetesValidators`.
 */

const STRING_MAP = { type: "object", required: true, values: { type: "string" } };

const NAME = { type: "string", required: true, pattern: DNS_SUBDOMAIN, maxLength: 253 };
const NAMESPACE = { type: "string", pattern: DNS_LABEL };
const STRING = { type: "string", required: true, minLength: 1, maxLength: 300 };

function describe({ kind, name, namespace }) {
  const where = KINDS[kind].namespaced ? ` in namespace "${namespace}"` : "";
  return `${kind} "${name}"${where}`;
}

function validateRef(params, problems, kinds) {
  check(params.kind, { type: "string", required: true, enum: kinds }, "kind", problems);
  check(params.name, NAME, "name", problems);
  check(params.namespace, NAMESPACE, "namespace", problems);
  const spec = KINDS[params.kind];
  if (spec?.namespaced && params.namespace === undefined)
    problems.add("namespace", `is required for kind ${params.kind}`);
  if (spec && !spec.namespaced && params.namespace !== undefined)
    problems.add("namespace", `must not be set: ${params.kind} is cluster-scoped`);
}

function rejectUnknown(params, allowed, problems) {
  for (const key of Object.keys(params))
    if (!allowed.includes(key))
      problems.add(key, `unknown property (allowed: ${allowed.join(", ")})`);
}

/**
 * Build a validator that targets one resource. The factory handles the shared concerns
 * (param validation, lookup, "not found", "being deleted"); `evaluate` receives the
 * fetched object and returns `{passed, feedback, details?}`.
 *
 * @param {object} def
 * @param {string} def.type
 * @param {string[]} [def.kinds]      Allowed kinds. A single kind is also fixed (not a param).
 * @param {object} [def.params]       Schema for the extra params.
 * @param {Function} [def.refine]     Extra load-time checks: (params, problems) => void
 * @param {Function} def.evaluate     (resource, params, ref) => result
 */
function resourceValidator({ type, kinds = KIND_NAMES, params = {}, refine, evaluate }) {
  const fixedKind = kinds.length === 1 ? kinds[0] : undefined;
  const allowed = [...(fixedKind ? [] : ["kind"]), "name", "namespace", ...Object.keys(params)];
  const refOf = (p) => ({ kind: fixedKind ?? p.kind, name: p.name, namespace: p.namespace });
  return {
    type,
    track: "kubernetes",
    validateParams(p, { problems }) {
      rejectUnknown(p, allowed, problems);
      validateRef({ ...p, kind: fixedKind ?? p.kind }, problems, kinds);
      for (const [key, spec] of Object.entries(params)) check(p[key], spec, key, problems);
      refine?.(p, problems);
    },
    async run(p, ctx) {
      const ref = refOf(p);
      const resource = await ctx.query.get(ref);
      if (!resource) return { passed: false, feedback: `${describe(ref)} was not found.` };
      if (resource.metadata?.deletionTimestamp)
        return { passed: false, feedback: `${describe(ref)} is being deleted.` };
      return evaluate(resource, p, ref);
    },
  };
}

const resourceExists = resourceValidator({
  type: "k8s.resource-exists",
  evaluate: (_, __, ref) => ({ passed: true, feedback: `${describe(ref)} exists.` }),
});

const resourceAbsent = {
  type: "k8s.resource-absent",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(p, ["kind", "name", "namespace"], problems);
    validateRef(p, problems, KIND_NAMES);
  },
  async run(p, ctx) {
    const resource = await ctx.query.get(p);
    if (!resource) return { passed: true, feedback: `${describe(p)} does not exist.` };
    return {
      passed: false,
      feedback: resource.metadata?.deletionTimestamp
        ? `${describe(p)} is still being deleted.`
        : `${describe(p)} still exists.`,
    };
  },
};

/** Passes only if the named resource lives in the expected namespace; says where it is otherwise. */
const resourceInNamespace = {
  type: "k8s.resource-in-namespace",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(p, ["kind", "name", "namespace"], problems);
    validateRef(
      p,
      problems,
      KIND_NAMES.filter((k) => KINDS[k].namespaced),
    );
    check(p.namespace, { ...NAMESPACE, required: true }, "namespace", problems);
  },
  async run(p, ctx) {
    const found = await ctx.query.list({
      kind: p.kind,
      allNamespaces: true,
      fieldSelector: `metadata.name=${p.name}`,
    });
    const namespaces = found.map((r) => r.metadata?.namespace).sort();
    if (namespaces.includes(p.namespace))
      return { passed: true, feedback: `${describe(p)} exists.` };
    if (namespaces.length > 0)
      return {
        passed: false,
        feedback: `${p.kind} "${p.name}" exists, but in namespace "${namespaces[0]}" instead of "${p.namespace}".`,
        details: { namespaces },
      };
    return { passed: false, feedback: `${p.kind} "${p.name}" was not found in any namespace.` };
  },
};

const containerImage = resourceValidator({
  type: "k8s.container-image",
  kinds: KIND_NAMES.filter((k) => KINDS[k].podSpecPath),
  params: {
    image: STRING,
    container: { type: "string", pattern: DNS_LABEL },
  },
  evaluate(resource, p, ref) {
    const containers = (podSpecOf(resource, ref.kind)?.containers ?? []).filter(
      (c) => p.container === undefined || c.name === p.container,
    );
    const images = containers.map((c) => c.image);
    const passed = images.includes(p.image);
    return {
      passed,
      feedback: passed
        ? `${describe(ref)} runs the expected image.`
        : images.length === 0
          ? `${describe(ref)} has no matching container.`
          : `${describe(ref)} runs ${images.map((i) => `"${i}"`).join(", ")}, which is not the expected image.`,
      details: { images },
    };
  },
});

const podPhase = resourceValidator({
  type: "k8s.pod-phase",
  kinds: ["Pod"],
  params: {
    phase: { type: "string", required: true, enum: ["Pending", "Running", "Succeeded", "Failed"] },
  },
  evaluate(pod, p, ref) {
    const phase = pod.status?.phase ?? "Unknown";
    return {
      passed: phase === p.phase,
      feedback:
        phase === p.phase
          ? `${describe(ref)} is ${phase}.`
          : `${describe(ref)} is ${phase}, expected ${p.phase}.`,
    };
  },
});

const podReady = resourceValidator({
  type: "k8s.pod-ready",
  kinds: ["Pod"],
  evaluate(pod, _, ref) {
    const ready = pod.status?.conditions?.some((c) => c.type === "Ready" && c.status === "True");
    return {
      passed: ready === true,
      feedback: ready ? `${describe(ref)} is Ready.` : `${describe(ref)} is not Ready yet.`,
    };
  },
});

const REPLICA_KINDS = ["Deployment", "ReplicaSet", "StatefulSet"];
const COUNT = { type: "integer", required: true, min: 0, max: 1000 };

function replicaValidator(type, label, read) {
  return resourceValidator({
    type,
    kinds: REPLICA_KINDS,
    params: { replicas: COUNT },
    evaluate(resource, p, ref) {
      const actual = read(resource);
      return {
        passed: actual === p.replicas,
        feedback:
          actual === p.replicas
            ? `${describe(ref)} has ${actual} ${label} replicas.`
            : `${describe(ref)} has ${actual} ${label} replicas, expected ${p.replicas}.`,
        details: { actual },
      };
    },
  });
}

const replicasDesired = replicaValidator(
  "k8s.replicas-desired",
  "desired",
  (r) => r.spec?.replicas ?? 1,
);
const replicasAvailable = replicaValidator(
  "k8s.replicas-available",
  "available",
  (r) => r.status?.availableReplicas ?? 0,
);
const replicasReady = replicaValidator(
  "k8s.replicas-ready",
  "ready",
  (r) => r.status?.readyReplicas ?? 0,
);

function metadataMapValidator(type, field, noun) {
  return resourceValidator({
    type,
    params: { [field]: STRING_MAP },
    evaluate(resource, p, ref) {
      const actual = resource.metadata?.[field] ?? {};
      const wrong = Object.entries(p[field]).filter(([key, value]) => actual[key] !== value);
      return {
        passed: wrong.length === 0,
        feedback:
          wrong.length === 0
            ? `${describe(ref)} has the expected ${noun}.`
            : wrong
                .map(([key]) =>
                  actual[key] === undefined
                    ? `${noun} "${key}" is missing`
                    : `${noun} "${key}" has value "${actual[key]}"`,
                )
                .join("; ") + ".",
        details: { missing: wrong.map(([key]) => key) },
      };
    },
  });
}

const labels = metadataMapValidator("k8s.labels", "labels", "label");
const annotations = metadataMapValidator("k8s.annotations", "annotations", "annotation");

export const kubernetesValidators = Object.freeze([
  resourceExists,
  resourceAbsent,
  resourceInNamespace,
  containerImage,
  podPhase,
  podReady,
  replicasDesired,
  replicasAvailable,
  replicasReady,
  labels,
  annotations,
]);
