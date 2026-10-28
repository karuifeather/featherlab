import { check } from "../../core/schema.mjs";
import { DNS_LABEL, DNS_SUBDOMAIN, KIND_NAMES, KINDS, podSpecOf } from "./kinds.mjs";
import { parseQuantity, sameQuantity } from "./quantity.mjs";

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

/**
 * The object exists and does not carry a label key (whatever its value). A missing object
 * fails: "not labelled" must not be satisfiable by deleting it.
 */
const labelAbsent = resourceValidator({
  type: "k8s.label-absent",
  params: { label: { type: "string", required: true, minLength: 1, maxLength: 317 } },
  evaluate(resource, p, ref) {
    const value = resource.metadata?.labels?.[p.label];
    return {
      passed: value === undefined,
      feedback:
        value === undefined
          ? `${describe(ref)} does not carry label "${p.label}".`
          : `${describe(ref)} still carries label "${p.label}".`,
    };
  },
});

/**
 * A Deployment whose rollout finished: the controller has seen the latest spec, every
 * replica runs the current template, none of the old ones are left, and all are available
 * and ready. Unlike `replicas-available`, this cannot pass while old Pods still serve.
 */
const rolloutComplete = resourceValidator({
  type: "k8s.rollout-complete",
  kinds: ["Deployment"],
  params: { replicas: COUNT },
  evaluate(deployment, p, ref) {
    const desired = deployment.spec?.replicas ?? 1;
    const s = deployment.status ?? {};
    const counts = {
      desired,
      updated: s.updatedReplicas ?? 0,
      total: s.replicas ?? 0,
      available: s.availableReplicas ?? 0,
      ready: s.readyReplicas ?? 0,
    };
    const fail = (feedback) => ({ passed: false, feedback, details: counts });
    if (desired !== p.replicas)
      return fail(`${describe(ref)} requests ${desired} replicas, expected ${p.replicas}.`);
    if ((s.observedGeneration ?? 0) < (deployment.metadata?.generation ?? 0))
      return fail(`${describe(ref)} has changes the controller has not rolled out yet.`);
    if (counts.updated !== desired || counts.total !== desired)
      return fail(
        `${describe(ref)} is still rolling out: ${counts.updated} of ${desired} replicas run the current template (${counts.total} in total).`,
      );
    if (counts.available !== desired || counts.ready !== desired)
      return fail(`${describe(ref)} has ${counts.available} of ${desired} replicas available.`);
    return {
      passed: true,
      feedback: `${describe(ref)} finished rolling out: ${desired} of ${desired} replicas available.`,
      details: counts,
    };
  },
});

const POD_SPEC_KINDS = KIND_NAMES.filter((k) => KINDS[k].podSpecPath);
const CONTAINER = { type: "string", required: true, pattern: DNS_LABEL };

/** Resolve the named container, or produce the failure result when it is missing. */
function withContainer(resource, ref, name, evaluate) {
  const container = (podSpecOf(resource, ref.kind)?.containers ?? []).find((c) => c.name === name);
  if (!container)
    return { passed: false, feedback: `${describe(ref)} has no container "${name}".` };
  return evaluate(container);
}

const QUANTITY_SPEC = { type: "string", minLength: 1, maxLength: 40 };
const RESOURCE_MAP = {
  type: "object",
  properties: { cpu: QUANTITY_SPEC, memory: QUANTITY_SPEC },
};

/**
 * Requests/limits on one container, compared as quantities: "0.1" equals "100m" and
 * "64Mi" equals "67108864". Only the listed resources are graded.
 */
const containerResources = resourceValidator({
  type: "k8s.container-resources",
  kinds: POD_SPEC_KINDS,
  params: { container: CONTAINER, requests: RESOURCE_MAP, limits: RESOURCE_MAP },
  refine(p, problems) {
    if (!p.requests && !p.limits) problems.add("", "set requests and/or limits");
    for (const group of ["requests", "limits"])
      for (const [key, value] of Object.entries(p[group] ?? {}))
        if (parseQuantity(value) === undefined)
          problems.add(`${group}.${key}`, `"${value}" is not a Kubernetes quantity`);
  },
  evaluate: (resource, p, ref) =>
    withContainer(resource, ref, p.container, (container) => {
      const wrong = [];
      for (const group of ["requests", "limits"])
        for (const [key, expected] of Object.entries(p[group] ?? {})) {
          const actual = container.resources?.[group]?.[key];
          if (!sameQuantity(actual, expected))
            wrong.push(
              actual === undefined
                ? `${key} ${group.slice(0, -1)} is not set`
                : `${key} ${group.slice(0, -1)} is ${actual}`,
            );
        }
      return {
        passed: wrong.length === 0,
        feedback:
          wrong.length === 0
            ? `Container "${p.container}" of ${describe(ref)} has the required resources.`
            : `Container "${p.container}" of ${describe(ref)}: ${wrong.join("; ")}, which does not meet the requirement.`,
        details: { resources: container.resources ?? {} },
      };
    }),
});

const PROBE_HANDLERS = ["httpGet", "tcpSocket", "exec", "grpc"];

/**
 * A probe of the given type exists on the container (optionally with a given handler and
 * HTTP path). It does not prove the probe succeeds: pair it with a readiness check.
 */
const containerProbe = resourceValidator({
  type: "k8s.container-probe",
  kinds: POD_SPEC_KINDS,
  params: {
    container: CONTAINER,
    probe: { type: "string", required: true, enum: ["readiness", "liveness", "startup"] },
    handler: { type: "string", enum: PROBE_HANDLERS },
    path: { type: "string", minLength: 1, maxLength: 200 },
  },
  evaluate: (resource, p, ref) =>
    withContainer(resource, ref, p.container, (container) => {
      const probe = container[`${p.probe}Probe`];
      const what = `Container "${p.container}" of ${describe(ref)}`;
      if (!probe) return { passed: false, feedback: `${what} has no ${p.probe} probe.` };
      const handler = PROBE_HANDLERS.find((h) => probe[h]);
      if (p.handler && handler !== p.handler)
        return {
          passed: false,
          feedback: `${what} has a ${p.probe} probe, but it does not use ${p.handler}.`,
        };
      if (p.path !== undefined && probe.httpGet?.path !== p.path)
        return {
          passed: false,
          feedback: `${what} has a ${p.probe} probe, but not for the required path.`,
        };
      return { passed: true, feedback: `${what} has the required ${p.probe} probe.` };
    }),
});

/** An environment variable on one container: a literal value or a ConfigMap key reference. */
const containerEnv = resourceValidator({
  type: "k8s.container-env",
  kinds: POD_SPEC_KINDS,
  params: {
    container: CONTAINER,
    env: { type: "string", required: true, pattern: /^[A-Za-z_][A-Za-z0-9_]*$/, maxLength: 120 },
    value: { type: "string", maxLength: 300 },
    configMapKeyRef: {
      type: "object",
      properties: {
        name: { ...NAME },
        key: { type: "string", required: true, minLength: 1, maxLength: 253 },
      },
    },
  },
  refine(p, problems) {
    if ((p.value === undefined) === (p.configMapKeyRef === undefined))
      problems.add("", "set exactly one of value or configMapKeyRef");
  },
  evaluate: (resource, p, ref) =>
    withContainer(resource, ref, p.container, (container) => {
      const what = `Container "${p.container}" of ${describe(ref)}`;
      const entry = (container.env ?? []).find((e) => e.name === p.env);
      if (!entry)
        return { passed: false, feedback: `${what} has no environment variable ${p.env}.` };
      if (p.value !== undefined) {
        const passed = entry.valueFrom === undefined && entry.value === p.value;
        return {
          passed,
          feedback: passed
            ? `${what} sets ${p.env} as required.`
            : `${what} sets ${p.env}, but not to the required value.`,
        };
      }
      const source = entry.valueFrom?.configMapKeyRef;
      const passed =
        source?.name === p.configMapKeyRef.name && source?.key === p.configMapKeyRef.key;
      return {
        passed,
        feedback: passed
          ? `${what} reads ${p.env} from the required ConfigMap key.`
          : `${what} does not read ${p.env} from the required ConfigMap key.`,
      };
    }),
});

/** A ConfigMap is mounted into one container as a volume (at any path). */
const configMapMounted = resourceValidator({
  type: "k8s.configmap-mounted",
  kinds: POD_SPEC_KINDS,
  params: { container: CONTAINER, configMap: { ...NAME } },
  evaluate: (resource, p, ref) =>
    withContainer(resource, ref, p.container, (container) => {
      const volumes = (podSpecOf(resource, ref.kind)?.volumes ?? [])
        .filter((v) => v.configMap?.name === p.configMap)
        .map((v) => v.name);
      const passed = (container.volumeMounts ?? []).some((m) => volumes.includes(m.name));
      return {
        passed,
        feedback: passed
          ? `Container "${p.container}" of ${describe(ref)} mounts ConfigMap "${p.configMap}".`
          : `Container "${p.container}" of ${describe(ref)} does not mount ConfigMap "${p.configMap}".`,
      };
    }),
});

function podTemplateLabels(workload, kind) {
  return kind === "Pod"
    ? (workload.metadata?.labels ?? {})
    : (workload.spec?.template?.metadata?.labels ?? {});
}

/**
 * A Service routes to a specific workload: it has a selector, every selector entry matches
 * the workload's Pod labels, and every named targetPort exists on one of its containers.
 * Combine it with a rollout/readiness check to prove the endpoints are actually serving.
 * Matching is against the named workload only, so unrelated Pods that happen to carry the
 * labels never count.
 */
const serviceSelects = {
  type: "k8s.service-selects",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(p, ["name", "namespace", "workload"], problems);
    validateRef({ ...p, kind: "Service" }, problems, ["Service"]);
    check(
      p.workload,
      {
        type: "object",
        required: true,
        properties: {
          kind: { type: "string", required: true, enum: POD_SPEC_KINDS },
          name: NAME,
        },
      },
      "workload",
      problems,
    );
  },
  async run(p, ctx) {
    const svcRef = { kind: "Service", name: p.name, namespace: p.namespace };
    const workRef = { kind: p.workload.kind, name: p.workload.name, namespace: p.namespace };
    const [service, workload] = await Promise.all([ctx.query.get(svcRef), ctx.query.get(workRef)]);
    if (!service) return { passed: false, feedback: `${describe(svcRef)} was not found.` };
    if (!workload) return { passed: false, feedback: `${describe(workRef)} was not found.` };
    const selector = service.spec?.selector ?? {};
    const podLabels = podTemplateLabels(workload, workRef.kind);
    const details = { selector, podLabels };
    if (Object.keys(selector).length === 0)
      return { passed: false, feedback: `${describe(svcRef)} has no selector.`, details };
    if (!Object.entries(selector).every(([k, v]) => podLabels[k] === v))
      return {
        passed: false,
        feedback: `${describe(svcRef)} does not select the Pods of ${workRef.kind} "${workRef.name}".`,
        details,
      };
    const containers = podSpecOf(workload, workRef.kind)?.containers ?? [];
    const portNames = containers.flatMap((c) => (c.ports ?? []).map((port) => port.name));
    const unresolved = (service.spec?.ports ?? []).filter(
      (port) => typeof port.targetPort === "string" && !portNames.includes(port.targetPort),
    );
    if (unresolved.length > 0)
      return {
        passed: false,
        feedback: `${describe(svcRef)} targets a named port that the Pods of ${workRef.kind} "${workRef.name}" do not define.`,
        details,
      };
    return {
      passed: true,
      feedback: `${describe(svcRef)} routes to the Pods of ${workRef.kind} "${workRef.name}".`,
      details,
    };
  },
};

/**
 * k8s.deployment-strategy — passes when a Deployment's update strategy matches the
 * expected type, and optionally when maxSurge and maxUnavailable match.
 * maxSurge / maxUnavailable values are compared as strings so both integers ("1") and
 * percentages ("25%") round-trip correctly through the Kubernetes API.
 */
const deploymentStrategy = resourceValidator({
  type: "k8s.deployment-strategy",
  kinds: ["Deployment"],
  params: {
    strategy: {
      type: "string",
      required: true,
      enum: ["RollingUpdate", "Recreate"],
    },
    maxSurge: { type: "string", minLength: 1, maxLength: 20 },
    maxUnavailable: { type: "string", minLength: 1, maxLength: 20 },
  },
  evaluate(deployment, p, ref) {
    const actual = deployment.spec?.strategy?.type;
    if (actual !== p.strategy)
      return {
        passed: false,
        feedback: `${describe(ref)} has strategy "${actual ?? "(none)"}"; expected "${p.strategy}".`,
      };
    if (p.strategy === "Recreate") {
      return { passed: true, feedback: `${describe(ref)} uses the Recreate strategy.` };
    }
    const ru = deployment.spec?.strategy?.rollingUpdate ?? {};
    if (p.maxSurge !== undefined) {
      const actualSurge = String(ru.maxSurge ?? "");
      if (actualSurge !== p.maxSurge)
        return {
          passed: false,
          feedback: `${describe(ref)} has maxSurge "${actualSurge || "(not set)"}"; expected "${p.maxSurge}".`,
        };
    }
    if (p.maxUnavailable !== undefined) {
      const actualUnavail = String(ru.maxUnavailable ?? "");
      if (actualUnavail !== p.maxUnavailable)
        return {
          passed: false,
          feedback: `${describe(ref)} has maxUnavailable "${actualUnavail || "(not set)"}"; expected "${p.maxUnavailable}".`,
        };
    }
    return { passed: true, feedback: `${describe(ref)} has the correct RollingUpdate strategy.` };
  },
});

/**
 * k8s.deployment-not-paused — passes when a Deployment's spec.paused is absent or false.
 * Useful as a final guard on exercises where the learner must resume a paused rollout.
 */
const deploymentNotPaused = resourceValidator({
  type: "k8s.deployment-not-paused",
  kinds: ["Deployment"],
  params: {},
  evaluate(deployment, _p, ref) {
    const paused = deployment.spec?.paused === true;
    return {
      passed: !paused,
      feedback: paused
        ? `${describe(ref)} is paused. Resume it with \`kubectl rollout resume deployment/${ref.name} -n ${ref.namespace}\`.`
        : `${describe(ref)} is not paused.`,
    };
  },
});

/**
 * k8s.pod-template-labels — passes when a workload's Pod template includes all expected
 * labels. Checks spec.template.metadata.labels for Deployments/ReplicaSets/etc., not the
 * workload's own metadata.labels. Use k8s.labels for the object's own labels.
 */
const podTemplateLabelsCheck = resourceValidator({
  type: "k8s.pod-template-labels",
  kinds: POD_SPEC_KINDS.filter((k) => k !== "Pod"),
  params: { labels: STRING_MAP },
  evaluate(resource, p, ref) {
    const tmplLabels = resource.spec?.template?.metadata?.labels ?? {};
    const missing = Object.entries(p.labels).filter(([k, v]) => tmplLabels[k] !== v);
    if (missing.length > 0) {
      const detail = missing.map(([k, v]) => `"${k}=${v}"`).join(", ");
      return {
        passed: false,
        feedback: `${describe(ref)}'s Pod template is missing labels: ${detail}.`,
        details: { expected: p.labels, actual: tmplLabels },
      };
    }
    return {
      passed: true,
      feedback: `${describe(ref)}'s Pod template has the required labels.`,
    };
  },
});

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
  labelAbsent,
  rolloutComplete,
  containerResources,
  containerProbe,
  containerEnv,
  configMapMounted,
  serviceSelects,
  deploymentStrategy,
  deploymentNotPaused,
  podTemplateLabelsCheck,
]);
