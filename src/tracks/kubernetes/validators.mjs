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
 * A probe of the given type exists on the container (optionally with a given handler,
 * HTTP path and port). It does not prove the probe succeeds: pair it with a readiness check.
 */
const containerProbe = resourceValidator({
  type: "k8s.container-probe",
  kinds: POD_SPEC_KINDS,
  params: {
    container: CONTAINER,
    probe: { type: "string", required: true, enum: ["readiness", "liveness", "startup"] },
    handler: { type: "string", enum: PROBE_HANDLERS },
    path: { type: "string", minLength: 1, maxLength: 200 },
    port: { type: "any" }, // integer port or named port string
    initialDelaySeconds: { type: "number" },
    periodSeconds: { type: "number" },
    failureThreshold: { type: "number" },
  },
  refine(p, problems) {
    if (p.port !== undefined) {
      const isInt = Number.isInteger(p.port) && p.port >= 1 && p.port <= 65535;
      const isStr = typeof p.port === "string" && p.port.length >= 1 && p.port.length <= 253;
      if (!isInt && !isStr)
        problems.add("port", "must be an integer (1–65535) or a named port string");
    }
    for (const field of ["initialDelaySeconds", "periodSeconds", "failureThreshold"])
      if (p[field] !== undefined && (!Number.isInteger(p[field]) || p[field] < 0))
        problems.add(field, "must be a non-negative integer");
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
      if (p.port !== undefined) {
        const handlerPort = probe.httpGet?.port ?? probe.tcpSocket?.port ?? probe.grpc?.port;
        if (handlerPort !== p.port)
          return {
            passed: false,
            feedback: `${what} has a ${p.probe} probe, but its port is "${handlerPort ?? "(not set)"}"; expected "${p.port}".`,
          };
      }
      for (const field of ["initialDelaySeconds", "periodSeconds", "failureThreshold"]) {
        if (p[field] !== undefined && probe[field] !== p[field])
          return {
            passed: false,
            feedback: `${what} has a ${p.probe} probe, but ${field} is "${probe[field] ?? "(not set)"}"; expected "${p[field]}".`,
          };
      }
      return { passed: true, feedback: `${what} has the required ${p.probe} probe.` };
    }),
});

/** An environment variable on one container: a literal value, a ConfigMap key ref, or a Secret key ref. */
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
    secretKeyRef: {
      type: "object",
      properties: {
        name: { ...NAME },
        key: { type: "string", required: true, minLength: 1, maxLength: 253 },
      },
    },
  },
  refine(p, problems) {
    const defined = [p.value, p.configMapKeyRef, p.secretKeyRef].filter((x) => x !== undefined);
    if (defined.length !== 1)
      problems.add("", "set exactly one of value, configMapKeyRef, or secretKeyRef");
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
      if (p.configMapKeyRef !== undefined) {
        const source = entry.valueFrom?.configMapKeyRef;
        const passed =
          source?.name === p.configMapKeyRef.name && source?.key === p.configMapKeyRef.key;
        return {
          passed,
          feedback: passed
            ? `${what} reads ${p.env} from the required ConfigMap key.`
            : `${what} does not read ${p.env} from the required ConfigMap key.`,
        };
      }
      const source = entry.valueFrom?.secretKeyRef;
      const passed = source?.name === p.secretKeyRef.name && source?.key === p.secretKeyRef.key;
      return {
        passed,
        feedback: passed
          ? `${what} reads ${p.env} from the required Secret key.`
          : `${what} does not read ${p.env} from the required Secret key.`,
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

/** Specific key/value pairs must be present in a ConfigMap's data. */
const configMapData = resourceValidator({
  type: "k8s.configmap-data",
  kinds: ["ConfigMap"],
  params: { data: STRING_MAP },
  evaluate(cm, p, ref) {
    const actual = cm.data ?? {};
    const missing = Object.entries(p.data).filter(([k, v]) => actual[k] !== v);
    if (missing.length > 0) {
      const detail = missing.map(([k]) => `"${k}"`).join(", ");
      return {
        passed: false,
        feedback: `${describe(ref)} is missing or has wrong values for: ${detail}.`,
        details: { expected: p.data },
      };
    }
    return { passed: true, feedback: `${describe(ref)} has the required data entries.` };
  },
});

/** The Secret's type field must match. */
const secretType = resourceValidator({
  type: "k8s.secret-type",
  kinds: ["Secret"],
  params: { secretType: { type: "string", required: true, minLength: 1, maxLength: 253 } },
  evaluate(secret, p, ref) {
    const actual = secret.type ?? "Opaque";
    const passed = actual === p.secretType;
    return {
      passed,
      feedback: passed
        ? `${describe(ref)} has type "${p.secretType}".`
        : `${describe(ref)} has type "${actual}"; expected "${p.secretType}".`,
    };
  },
});

/**
 * The Secret has all specified keys in its data. Never checks values — exercise content
 * must not leak answer keys or credential values.
 */
const secretKeys = resourceValidator({
  type: "k8s.secret-keys",
  kinds: ["Secret"],
  params: {
    keys: {
      type: "array",
      required: true,
      minItems: 1,
      items: { type: "string", minLength: 1, maxLength: 253 },
    },
  },
  evaluate(secret, p, ref) {
    const actual = Object.keys(secret.data ?? {});
    const missing = p.keys.filter((k) => !actual.includes(k));
    if (missing.length > 0) {
      return {
        passed: false,
        feedback: `${describe(ref)} is missing keys: ${missing.map((k) => `"${k}"`).join(", ")}.`,
      };
    }
    return { passed: true, feedback: `${describe(ref)} has the required keys.` };
  },
});

/** A container loads all keys from a ConfigMap or Secret via envFrom. */
const containerEnvFrom = resourceValidator({
  type: "k8s.container-env-from",
  kinds: POD_SPEC_KINDS,
  params: {
    container: CONTAINER,
    configMapRef: { type: "string", pattern: DNS_SUBDOMAIN, maxLength: 253 },
    secretRef: { type: "string", pattern: DNS_SUBDOMAIN, maxLength: 253 },
  },
  refine(p, problems) {
    const defined = [p.configMapRef, p.secretRef].filter((x) => x !== undefined);
    if (defined.length !== 1) problems.add("", "set exactly one of configMapRef or secretRef");
  },
  evaluate: (resource, p, ref) =>
    withContainer(resource, ref, p.container, (container) => {
      const what = `Container "${p.container}" of ${describe(ref)}`;
      const envFrom = container.envFrom ?? [];
      if (p.configMapRef !== undefined) {
        const passed = envFrom.some((e) => e.configMapRef?.name === p.configMapRef);
        return {
          passed,
          feedback: passed
            ? `${what} loads all keys from ConfigMap "${p.configMapRef}".`
            : `${what} does not load ConfigMap "${p.configMapRef}" via envFrom.`,
        };
      }
      const passed = envFrom.some((e) => e.secretRef?.name === p.secretRef);
      return {
        passed,
        feedback: passed
          ? `${what} loads all keys from Secret "${p.secretRef}".`
          : `${what} does not load Secret "${p.secretRef}" via envFrom.`,
      };
    }),
});

/** A Secret is mounted as a volume into the named container. */
const secretMounted = resourceValidator({
  type: "k8s.secret-mounted",
  kinds: POD_SPEC_KINDS,
  params: { container: CONTAINER, secret: { ...NAME } },
  evaluate: (resource, p, ref) =>
    withContainer(resource, ref, p.container, (container) => {
      const volumes = (podSpecOf(resource, ref.kind)?.volumes ?? [])
        .filter((v) => v.secret?.secretName === p.secret)
        .map((v) => v.name);
      const passed = (container.volumeMounts ?? []).some((m) => volumes.includes(m.name));
      return {
        passed,
        feedback: passed
          ? `Container "${p.container}" of ${describe(ref)} mounts Secret "${p.secret}".`
          : `Container "${p.container}" of ${describe(ref)} does not mount Secret "${p.secret}".`,
      };
    }),
});

/**
 * One or more securityContext fields on a container. Specify any subset of the supported
 * fields; only the ones provided are checked. capDrop verifies the listed capabilities
 * appear in capabilities.drop.
 */
const containerSecurityContext = resourceValidator({
  type: "k8s.container-security-context",
  kinds: POD_SPEC_KINDS,
  params: {
    container: CONTAINER,
    allowPrivilegeEscalation: { type: "boolean" },
    readOnlyRootFilesystem: { type: "boolean" },
    runAsNonRoot: { type: "boolean" },
    runAsUser: { type: "integer", min: 0, max: 65535 },
    capDrop: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1, maxLength: 64 },
    },
  },
  refine(p, problems) {
    const fields = [
      "allowPrivilegeEscalation",
      "readOnlyRootFilesystem",
      "runAsNonRoot",
      "runAsUser",
      "capDrop",
    ];
    if (fields.every((f) => p[f] === undefined))
      problems.add("", "at least one security context field must be specified");
  },
  evaluate(resource, p, ref) {
    const podSpec = podSpecOf(resource, ref.kind);
    const container = (podSpec?.containers ?? []).find((c) => c.name === p.container);
    if (!container)
      return { passed: false, feedback: `${describe(ref)} has no container "${p.container}".` };
    const what = `Container "${p.container}" of ${describe(ref)}`;
    const sc = container.securityContext ?? {};
    const podSc = podSpec?.securityContext ?? {};
    const failures = [];
    if (
      p.allowPrivilegeEscalation !== undefined &&
      sc.allowPrivilegeEscalation !== p.allowPrivilegeEscalation
    )
      failures.push(`allowPrivilegeEscalation should be ${p.allowPrivilegeEscalation}`);
    if (
      p.readOnlyRootFilesystem !== undefined &&
      sc.readOnlyRootFilesystem !== p.readOnlyRootFilesystem
    )
      failures.push(`readOnlyRootFilesystem should be ${p.readOnlyRootFilesystem}`);
    // runAsNonRoot and runAsUser may be set at the Pod level and inherited by containers
    const effectiveRunAsNonRoot = sc.runAsNonRoot ?? podSc.runAsNonRoot;
    if (p.runAsNonRoot !== undefined && effectiveRunAsNonRoot !== p.runAsNonRoot)
      failures.push(`runAsNonRoot should be ${p.runAsNonRoot}`);
    const effectiveRunAsUser = sc.runAsUser ?? podSc.runAsUser;
    if (p.runAsUser !== undefined && effectiveRunAsUser !== p.runAsUser)
      failures.push(`runAsUser should be ${p.runAsUser}`);
    if (p.capDrop !== undefined) {
      const dropped = sc.capabilities?.drop ?? [];
      const missing = p.capDrop.filter((cap) => !dropped.includes(cap));
      if (missing.length > 0)
        failures.push(`capabilities.drop must include ${missing.map((c) => `"${c}"`).join(", ")}`);
    }
    if (failures.length > 0) {
      return {
        passed: false,
        feedback: `${what} has an incorrect security context: ${failures.join("; ")}.`,
      };
    }
    return { passed: true, feedback: `${what} has the required security context settings.` };
  },
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

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * k8s.container-runtime-env — passes when every Running Pod of a Deployment actually
 * sees the expected environment variable value at runtime (via kubectl exec + printenv).
 *
 * This differs from k8s.container-env, which only checks the declarative spec. Use this
 * when the learner must restart the workload for an envFrom/env change to take effect.
 *
 * Feedback deliberately omits the observed value to avoid leaking Secret data.
 */
const containerRuntimeEnv = {
  type: "k8s.container-runtime-env",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(p, ["name", "namespace", "container", "env", "value"], problems);
    check(p.name, NAME, "name", problems);
    check(
      p.namespace,
      { type: "string", required: true, pattern: DNS_LABEL },
      "namespace",
      problems,
    );
    check(
      p.container,
      { type: "string", required: true, pattern: DNS_LABEL },
      "container",
      problems,
    );
    check(
      p.env,
      {
        type: "string",
        required: true,
        pattern: ENV_KEY_RE,
        maxLength: 120,
      },
      "env",
      problems,
    );
    check(p.value, { type: "string", required: true, maxLength: 300 }, "value", problems);
  },
  async run(p, ctx) {
    const deplRef = { kind: "Deployment", name: p.name, namespace: p.namespace };
    const deployment = await ctx.query.get(deplRef);
    if (!deployment)
      return {
        passed: false,
        feedback: `Deployment "${p.name}" was not found in namespace "${p.namespace}".`,
      };

    const matchLabels = deployment.spec?.selector?.matchLabels ?? {};
    const labelSelector = Object.entries(matchLabels)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");

    const pods = await ctx.query.list({ kind: "Pod", namespace: p.namespace, labelSelector });
    const running = pods.filter(
      (pod) => !pod.metadata.deletionTimestamp && pod.status?.phase === "Running",
    );

    if (running.length === 0)
      return {
        passed: false,
        feedback: `No Running Pod for Deployment "${p.name}" found in namespace "${p.namespace}".`,
      };

    for (const pod of running) {
      const result = await ctx.query.exec({
        podName: pod.metadata.name,
        namespace: p.namespace,
        container: p.container,
        key: p.env,
      });
      const actual = result.exitCode === 0 ? result.stdout.trim() : null;
      if (actual !== p.value) {
        return {
          passed: false,
          feedback: `Container "${p.container}" does not see ${p.env}=${p.value}. Update the ConfigMap and restart the Deployment so pods pick up the new value.`,
        };
      }
    }
    return {
      passed: true,
      feedback: `Container "${p.container}" sees ${p.env}=${p.value} at runtime.`,
    };
  },
};

/**
 * k8s.init-container — passes when an initContainer with the given name exists on the
 * Pod-spec workload. Optionally checks image and, for native sidecars, restartPolicy.
 */
const initContainer = {
  type: "k8s.init-container",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(
      p,
      ["kind", "name", "namespace", "container", "image", "nativeSidecar"],
      problems,
    );
    validateRef({ ...p, kind: p.kind ?? "Pod" }, problems, POD_SPEC_KINDS);
    check(p.container, CONTAINER, "container", problems);
    check(p.image, { type: "string", minLength: 1, maxLength: 300 }, "image", problems);
    check(p.nativeSidecar, { type: "boolean" }, "nativeSidecar", problems);
  },
  async run(p, ctx) {
    const kind = p.kind ?? "Pod";
    const ref = { kind, name: p.name, namespace: p.namespace };
    const resource = await ctx.query.get(ref);
    if (!resource) return { passed: false, feedback: `${describe(ref)} was not found.` };
    if (resource.metadata?.deletionTimestamp)
      return { passed: false, feedback: `${describe(ref)} is being deleted.` };
    const initContainers = podSpecOf(resource, kind)?.initContainers ?? [];
    const container = initContainers.find((c) => c.name === p.container);
    if (!container)
      return {
        passed: false,
        feedback: `${describe(ref)} has no initContainer named "${p.container}".`,
      };
    if (p.image !== undefined && container.image !== p.image)
      return {
        passed: false,
        feedback: `initContainer "${p.container}" of ${describe(ref)} uses image "${container.image}", expected "${p.image}".`,
      };
    if (p.nativeSidecar !== undefined) {
      const isNative = container.restartPolicy === "Always";
      if (p.nativeSidecar && !isNative)
        return {
          passed: false,
          feedback: `initContainer "${p.container}" of ${describe(ref)} is not a native sidecar (missing restartPolicy: Always).`,
        };
      if (!p.nativeSidecar && isNative)
        return {
          passed: false,
          feedback: `initContainer "${p.container}" of ${describe(ref)} has restartPolicy: Always; expected a regular init container.`,
        };
    }
    return {
      passed: true,
      feedback: `${describe(ref)} has initContainer "${p.container}" as required.`,
    };
  },
};

/**
 * k8s.job-complete — passes when the Job has a Complete condition with status True.
 * Kubernetes sets this only after all required completions succeed.
 */
const jobComplete = resourceValidator({
  type: "k8s.job-complete",
  kinds: ["Job"],
  evaluate(job, _, ref) {
    const conditions = job.status?.conditions ?? [];
    const complete = conditions.find((c) => c.type === "Complete" && c.status === "True");
    const failed = conditions.find((c) => c.type === "Failed" && c.status === "True");
    const succeeded = job.status?.succeeded ?? 0;
    return {
      passed: !!complete,
      feedback: complete
        ? `${describe(ref)} has completed successfully (${succeeded} succeeded).`
        : failed
          ? `${describe(ref)} has failed and will not complete.`
          : `${describe(ref)} has not completed yet (${succeeded} succeeded so far).`,
      details: { conditions: conditions.map((c) => `${c.type}=${c.status}`), succeeded },
    };
  },
});

/**
 * k8s.job-config — static Job spec field check. Only checks fields you supply;
 * omitted fields are not validated.
 */
const jobConfig = resourceValidator({
  type: "k8s.job-config",
  kinds: ["Job"],
  params: {
    completions: { type: "integer", min: 1, max: 1000 },
    parallelism: { type: "integer", min: 0, max: 100 },
    backoffLimit: { type: "integer", min: 0, max: 100 },
    completionMode: { type: "string", enum: ["NonIndexed", "Indexed"] },
    activeDeadlineSeconds: { type: "integer", min: 1, max: 86400 },
  },
  refine(p, problems) {
    const fields = [
      "completions",
      "parallelism",
      "backoffLimit",
      "completionMode",
      "activeDeadlineSeconds",
    ];
    if (fields.every((f) => p[f] === undefined)) problems.add("", "set at least one Job field");
  },
  evaluate(job, p, ref) {
    const spec = job.spec ?? {};
    const failures = [];
    const fmt = (actual, expected) =>
      `${actual === undefined ? "(not set)" : actual} — expected ${expected}`;
    if (p.completions !== undefined && spec.completions !== p.completions)
      failures.push(`completions: ${fmt(spec.completions, p.completions)}`);
    if (p.parallelism !== undefined && spec.parallelism !== p.parallelism)
      failures.push(`parallelism: ${fmt(spec.parallelism, p.parallelism)}`);
    if (p.backoffLimit !== undefined && spec.backoffLimit !== p.backoffLimit)
      failures.push(`backoffLimit: ${fmt(spec.backoffLimit, p.backoffLimit)}`);
    if (p.completionMode !== undefined && spec.completionMode !== p.completionMode)
      failures.push(`completionMode: ${fmt(spec.completionMode, p.completionMode)}`);
    if (
      p.activeDeadlineSeconds !== undefined &&
      spec.activeDeadlineSeconds !== p.activeDeadlineSeconds
    )
      failures.push(
        `activeDeadlineSeconds: ${fmt(spec.activeDeadlineSeconds, p.activeDeadlineSeconds)}`,
      );
    return {
      passed: failures.length === 0,
      feedback:
        failures.length === 0
          ? `${describe(ref)} has the required configuration.`
          : `${describe(ref)} has incorrect configuration: ${failures.join("; ")}.`,
    };
  },
});

/**
 * k8s.cronjob-config — static CronJob spec field check. Only checks fields you supply.
 */
const cronJobConfig = resourceValidator({
  type: "k8s.cronjob-config",
  kinds: ["CronJob"],
  params: {
    schedule: { type: "string", minLength: 1, maxLength: 100 },
    concurrencyPolicy: { type: "string", enum: ["Allow", "Forbid", "Replace"] },
    suspend: { type: "boolean" },
    successfulJobsHistoryLimit: { type: "integer", min: 0, max: 100 },
    failedJobsHistoryLimit: { type: "integer", min: 0, max: 100 },
    timeZone: { type: "string", minLength: 1, maxLength: 100 },
  },
  refine(p, problems) {
    const fields = [
      "schedule",
      "concurrencyPolicy",
      "suspend",
      "successfulJobsHistoryLimit",
      "failedJobsHistoryLimit",
      "timeZone",
    ];
    if (fields.every((f) => p[f] === undefined)) problems.add("", "set at least one CronJob field");
  },
  evaluate(cj, p, ref) {
    const spec = cj.spec ?? {};
    const failures = [];
    const fmt = (actual, expected) =>
      `${actual === undefined ? "(not set)" : JSON.stringify(actual)} — expected ${JSON.stringify(expected)}`;
    if (p.schedule !== undefined && spec.schedule !== p.schedule)
      failures.push(`schedule: ${fmt(spec.schedule, p.schedule)}`);
    if (p.concurrencyPolicy !== undefined && spec.concurrencyPolicy !== p.concurrencyPolicy)
      failures.push(`concurrencyPolicy: ${fmt(spec.concurrencyPolicy, p.concurrencyPolicy)}`);
    if (p.suspend !== undefined && (spec.suspend ?? false) !== p.suspend)
      failures.push(`suspend: ${fmt(spec.suspend ?? false, p.suspend)}`);
    if (
      p.successfulJobsHistoryLimit !== undefined &&
      spec.successfulJobsHistoryLimit !== p.successfulJobsHistoryLimit
    )
      failures.push(
        `successfulJobsHistoryLimit: ${fmt(spec.successfulJobsHistoryLimit, p.successfulJobsHistoryLimit)}`,
      );
    if (
      p.failedJobsHistoryLimit !== undefined &&
      spec.failedJobsHistoryLimit !== p.failedJobsHistoryLimit
    )
      failures.push(
        `failedJobsHistoryLimit: ${fmt(spec.failedJobsHistoryLimit, p.failedJobsHistoryLimit)}`,
      );
    if (p.timeZone !== undefined && spec.timeZone !== p.timeZone)
      failures.push(`timeZone: ${fmt(spec.timeZone, p.timeZone)}`);
    return {
      passed: failures.length === 0,
      feedback:
        failures.length === 0
          ? `${describe(ref)} has the required configuration.`
          : `${describe(ref)} has incorrect configuration: ${failures.join("; ")}.`,
    };
  },
});

/**
 * k8s.daemonset-status — passes when the DaemonSet has at least one desired Pod and all
 * desired Pods are ready and running the current template.
 *
 * Never hardcodes node count: passes when desired >= 1 and ready == desired == updated.
 */
const daemonSetStatus = resourceValidator({
  type: "k8s.daemonset-status",
  kinds: ["DaemonSet"],
  evaluate(ds, _, ref) {
    const s = ds.status ?? {};
    const desired = s.desiredNumberScheduled ?? 0;
    const ready = s.numberReady ?? 0;
    const updated = s.updatedNumberScheduled ?? 0;
    const generation = ds.metadata?.generation ?? 0;
    const observed = s.observedGeneration ?? 0;
    const counts = { desired, ready, updated };
    const fail = (feedback) => ({ passed: false, feedback, details: counts });
    if (desired < 1)
      return fail(`${describe(ref)} has no Pods scheduled (desiredNumberScheduled=0).`);
    if (observed < generation) return fail(`${describe(ref)} has pending changes not yet applied.`);
    if (updated < desired)
      return fail(
        `${describe(ref)} still has ${desired - updated} Pod(s) running the old template.`,
      );
    if (ready < desired) return fail(`${describe(ref)} has ${ready} of ${desired} Pods ready.`);
    return {
      passed: true,
      feedback: `${describe(ref)} has ${desired} of ${desired} Pods ready.`,
      details: counts,
    };
  },
});

/**
 * k8s.shared-emptydir — passes when all listed containers (from containers[] or
 * initContainers[]) share at least one common emptyDir volume mount.
 */
const sharedEmptyDir = resourceValidator({
  type: "k8s.shared-emptydir",
  kinds: POD_SPEC_KINDS,
  params: {
    containers: {
      type: "array",
      required: true,
      minItems: 2,
      items: { type: "string", pattern: DNS_LABEL, maxLength: 63 },
    },
  },
  evaluate(resource, p, ref) {
    const podSpec = podSpecOf(resource, ref.kind);
    const all = [...(podSpec?.containers ?? []), ...(podSpec?.initContainers ?? [])];
    const emptyDirNames = new Set(
      (podSpec?.volumes ?? []).filter((v) => v.emptyDir !== undefined).map((v) => v.name),
    );
    let shared = null;
    for (const cName of p.containers) {
      const container = all.find((c) => c.name === cName);
      if (!container)
        return { passed: false, feedback: `${describe(ref)} has no container "${cName}".` };
      const mounted = new Set(
        (container.volumeMounts ?? []).filter((m) => emptyDirNames.has(m.name)).map((m) => m.name),
      );
      shared = shared === null ? mounted : new Set([...shared].filter((n) => mounted.has(n)));
    }
    const passed = shared !== null && shared.size > 0;
    const names = p.containers.map((c) => `"${c}"`).join(", ");
    return {
      passed,
      feedback: passed
        ? `Containers ${names} of ${describe(ref)} share an emptyDir volume.`
        : `Containers ${names} of ${describe(ref)} do not share a common emptyDir volume mount.`,
    };
  },
});

const SAFE_PATH = /^(?!.*\.\.)(\/[A-Za-z0-9._-]+)+$/;

/**
 * k8s.exec-file — runs `head -c 4096 <path>` in a Running Pod of a Deployment and checks
 * that the output contains the expected string. Path is validated at content-load time.
 * Use this to verify that an init container wrote a file that the main container can read.
 */
const execFile = {
  type: "k8s.exec-file",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(p, ["name", "namespace", "container", "path", "contains"], problems);
    check(p.name, NAME, "name", problems);
    check(
      p.namespace,
      { type: "string", required: true, pattern: DNS_LABEL },
      "namespace",
      problems,
    );
    check(
      p.container,
      { type: "string", required: true, pattern: DNS_LABEL },
      "container",
      problems,
    );
    check(
      p.path,
      {
        type: "string",
        required: true,
        pattern: SAFE_PATH,
        patternHint: "must be an absolute path using [A-Za-z0-9._/-] only",
        maxLength: 200,
      },
      "path",
      problems,
    );
    check(
      p.contains,
      { type: "string", required: true, minLength: 1, maxLength: 300 },
      "contains",
      problems,
    );
  },
  async run(p, ctx) {
    const deplRef = { kind: "Deployment", name: p.name, namespace: p.namespace };
    const deployment = await ctx.query.get(deplRef);
    if (!deployment)
      return {
        passed: false,
        feedback: `Deployment "${p.name}" was not found in namespace "${p.namespace}".`,
      };
    const matchLabels = deployment.spec?.selector?.matchLabels ?? {};
    const labelSelector = Object.entries(matchLabels)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    const pods = await ctx.query.list({ kind: "Pod", namespace: p.namespace, labelSelector });
    const running = pods.filter(
      (pod) => !pod.metadata.deletionTimestamp && pod.status?.phase === "Running",
    );
    if (running.length === 0)
      return {
        passed: false,
        feedback: `No Running Pod for Deployment "${p.name}" in namespace "${p.namespace}".`,
      };
    const pod = running[0];
    const allContainerStatuses = [
      ...(pod.status?.containerStatuses ?? []),
      ...(pod.status?.initContainerStatuses ?? []),
    ];
    if (allContainerStatuses.length > 0) {
      const cs = allContainerStatuses.find((s) => s.name === p.container);
      if (!cs?.state?.running)
        return {
          passed: false,
          feedback: `Container "${p.container}" is not running in pod for Deployment "${p.name}".`,
        };
    }
    const result = await ctx.query.execFileContent({
      podName: pod.metadata.name,
      namespace: p.namespace,
      container: p.container,
      path: p.path,
    });
    if (!result.found)
      return {
        passed: false,
        feedback: `File "${p.path}" was not found in container "${p.container}".`,
      };
    if (!result.content.includes(p.contains))
      return {
        passed: false,
        feedback: `File "${p.path}" in container "${p.container}" does not contain the expected content.`,
      };
    return {
      passed: true,
      feedback: `File "${p.path}" in container "${p.container}" contains the expected content.`,
    };
  },
};

// ─── Level 4: Resource Management & Scheduling validators ─────────────────────

/**
 * k8s.pod-qos-class — passes when the Pod's status.qosClass matches the expected value.
 * Kubernetes sets this field at admission: Guaranteed, Burstable, or BestEffort.
 * Combine with k8s.pod-ready to prove the pod is actually running with that class.
 */
const podQosClass = resourceValidator({
  type: "k8s.pod-qos-class",
  kinds: ["Pod"],
  params: {
    qosClass: {
      type: "string",
      required: true,
      enum: ["Guaranteed", "Burstable", "BestEffort"],
    },
  },
  evaluate(pod, p, ref) {
    const actual = pod.status?.qosClass ?? "(not set)";
    return {
      passed: actual === p.qosClass,
      feedback:
        actual === p.qosClass
          ? `${describe(ref)} has QoS class ${p.qosClass}.`
          : `${describe(ref)} has QoS class ${actual}; expected ${p.qosClass}.`,
      details: { qosClass: actual },
    };
  },
});

/**
 * k8s.resource-quota — checks that a ResourceQuota's hard limits include the expected
 * entries (compared as Kubernetes quantities). Only the listed fields are graded.
 * Also verifies the ResourceQuota exists and is not being deleted — a learner cannot
 * pass by deleting the quota.
 */
const resourceQuota = resourceValidator({
  type: "k8s.resource-quota",
  kinds: ["ResourceQuota"],
  params: {
    hard: {
      type: "object",
      required: true,
      values: QUANTITY_SPEC,
    },
  },
  evaluate(quota, p, ref) {
    const actual = quota.spec?.hard ?? {};
    const wrong = [];
    for (const [key, expected] of Object.entries(p.hard)) {
      const actualVal = actual[key];
      if (!sameQuantity(actualVal, expected))
        wrong.push(
          actualVal === undefined
            ? `"${key}" is not set`
            : `"${key}" is ${actualVal} (expected ${expected})`,
        );
    }
    return {
      passed: wrong.length === 0,
      feedback:
        wrong.length === 0
          ? `${describe(ref)} has the required hard limits.`
          : `${describe(ref)} hard limits are incorrect: ${wrong.join("; ")}.`,
      details: { hard: actual },
    };
  },
});

const LIMIT_RANGE_TYPE = {
  type: "string",
  required: true,
  enum: ["Container", "Pod", "PersistentVolumeClaim"],
};

/**
 * k8s.limit-range — checks that a LimitRange has at least one limit of the given type
 * with the expected min, max, default, and/or defaultRequest values.
 * Only provided fields are checked; others are ignored.
 */
const limitRange = {
  type: "k8s.limit-range",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(
      p,
      ["name", "namespace", "limitType", "min", "max", "default", "defaultRequest"],
      problems,
    );
    check(p.name, NAME, "name", problems);
    check(
      p.namespace,
      { type: "string", required: true, pattern: DNS_LABEL },
      "namespace",
      problems,
    );
    check(p.limitType, LIMIT_RANGE_TYPE, "limitType", problems);
    for (const field of ["min", "max", "default", "defaultRequest"]) {
      if (p[field] !== undefined)
        check(p[field], { type: "object", values: QUANTITY_SPEC }, field, problems);
    }
    const defined = ["min", "max", "default", "defaultRequest"].filter((f) => p[f] !== undefined);
    if (defined.length === 0)
      problems.add("", "set at least one of min, max, default, defaultRequest");
  },
  async run(p, ctx) {
    const ref = { kind: "LimitRange", name: p.name, namespace: p.namespace };
    const lr = await ctx.query.get(ref);
    if (!lr)
      return {
        passed: false,
        feedback: `LimitRange "${p.name}" in namespace "${p.namespace}" was not found.`,
      };
    if (lr.metadata?.deletionTimestamp)
      return { passed: false, feedback: `LimitRange "${p.name}" is being deleted.` };
    const limits = (lr.spec?.limits ?? []).filter((l) => l.type === p.limitType);
    if (limits.length === 0)
      return {
        passed: false,
        feedback: `LimitRange "${p.name}" has no limit of type "${p.limitType}".`,
      };
    const wrong = [];
    const limit = limits[0];
    for (const [field, map] of [
      ["min", limit.min],
      ["max", limit.max],
      ["default", limit.default],
      ["defaultRequest", limit.defaultRequest],
    ]) {
      if (p[field] === undefined) continue;
      for (const [resource, expected] of Object.entries(p[field])) {
        const actual = map?.[resource];
        if (!sameQuantity(actual, expected))
          wrong.push(
            actual === undefined
              ? `${field}.${resource} is not set`
              : `${field}.${resource} is ${actual} (expected ${expected})`,
          );
      }
    }
    return {
      passed: wrong.length === 0,
      feedback:
        wrong.length === 0
          ? `LimitRange "${p.name}" has the required ${p.limitType} limits.`
          : `LimitRange "${p.name}" ${p.limitType} limits are incorrect: ${wrong.join("; ")}.`,
      details: { limits },
    };
  },
};

/**
 * k8s.node-selector — passes when the named workload's Pod template has a nodeSelector
 * containing all expected key=value pairs.
 */
const nodeSelector = resourceValidator({
  type: "k8s.node-selector",
  kinds: KIND_NAMES.filter((k) => KINDS[k].podSpecPath && k !== "Pod"),
  params: { selector: STRING_MAP },
  evaluate(resource, p, ref) {
    const actual = podSpecOf(resource, ref.kind)?.nodeSelector ?? {};
    const wrong = Object.entries(p.selector).filter(([k, v]) => actual[k] !== v);
    return {
      passed: wrong.length === 0,
      feedback:
        wrong.length === 0
          ? `${describe(ref)} has the required nodeSelector.`
          : wrong
              .map(([k]) =>
                actual[k] === undefined
                  ? `nodeSelector key "${k}" is missing`
                  : `nodeSelector "${k}" is "${actual[k]}"`,
              )
              .join("; ") + ".",
      details: { actual },
    };
  },
});

/**
 * k8s.pod-tolerations — passes when the Pod template has tolerations for all the listed
 * key/operator/effect combinations. Each entry in `tolerations` must have at least `key`
 * and `effect`; `operator` defaults to "Equal" if omitted; `value` is optional.
 */
const podTolerations = resourceValidator({
  type: "k8s.pod-tolerations",
  kinds: KIND_NAMES.filter((k) => KINDS[k].podSpecPath),
  params: {
    tolerations: {
      type: "array",
      required: true,
      minItems: 1,
      items: {
        type: "object",
        open: true,
        properties: {
          key: { type: "string", minLength: 1, maxLength: 317 },
          operator: { type: "string", enum: ["Equal", "Exists"] },
          value: { type: "string", maxLength: 253 },
          effect: { type: "string", enum: ["NoSchedule", "PreferNoSchedule", "NoExecute", ""] },
        },
      },
    },
  },
  evaluate(resource, p, ref) {
    const actual = podSpecOf(resource, ref.kind)?.tolerations ?? [];
    const missing = p.tolerations.filter((expected) => {
      return !actual.some((t) => {
        if (expected.key !== undefined && t.key !== expected.key) return false;
        const op = expected.operator ?? "Equal";
        if (t.operator !== op && !(t.operator === undefined && op === "Equal")) return false;
        if (op === "Equal" && expected.value !== undefined && t.value !== expected.value)
          return false;
        if (expected.effect !== undefined && expected.effect !== "" && t.effect !== expected.effect)
          return false;
        return true;
      });
    });
    return {
      passed: missing.length === 0,
      feedback:
        missing.length === 0
          ? `${describe(ref)} has the required tolerations.`
          : `${describe(ref)} is missing toleration(s): ${missing.map((t) => `key="${t.key ?? "*"}" effect="${t.effect ?? "*"}"`).join(", ")}.`,
      details: { actual },
    };
  },
});

/**
 * k8s.node-affinity — passes when the workload's Pod template has a nodeAffinity rule of
 * the specified scheduling type (required or preferred). Checks that at least one
 * nodeSelectorTerm (for required) or preference (for preferred) uses the given key and
 * operator. This verifies intentional configuration, not that placement actually occurred;
 * pair with k8s.rollout-complete to confirm the workload scheduled.
 */
const nodeAffinity = resourceValidator({
  type: "k8s.node-affinity",
  kinds: KIND_NAMES.filter((k) => KINDS[k].podSpecPath && k !== "Pod"),
  params: {
    scheduling: {
      type: "string",
      required: true,
      enum: ["required", "preferred"],
    },
    key: { type: "string", required: true, minLength: 1, maxLength: 317 },
    operator: {
      type: "string",
      required: true,
      enum: ["In", "NotIn", "Exists", "DoesNotExist", "Gt", "Lt"],
    },
    values: {
      type: "array",
      items: { type: "string", maxLength: 253 },
    },
  },
  evaluate(resource, p, ref) {
    const affinity = podSpecOf(resource, ref.kind)?.affinity?.nodeAffinity;
    if (!affinity) return { passed: false, feedback: `${describe(ref)} has no nodeAffinity.` };

    const matchExpr = (expr) =>
      expr.key === p.key &&
      expr.operator === p.operator &&
      (p.values === undefined || p.values.every((v) => (expr.values ?? []).includes(v)));

    if (p.scheduling === "required") {
      const terms =
        affinity.requiredDuringSchedulingIgnoredDuringExecution?.nodeSelectorTerms ?? [];
      const found = terms.some((term) => (term.matchExpressions ?? []).some(matchExpr));
      return {
        passed: found,
        feedback: found
          ? `${describe(ref)} has the required node affinity rule.`
          : `${describe(ref)} has no required node affinity matching key="${p.key}" operator="${p.operator}".`,
      };
    }
    const prefs = affinity.preferredDuringSchedulingIgnoredDuringExecution ?? [];
    const found = prefs.some((pref) => (pref.preference?.matchExpressions ?? []).some(matchExpr));
    return {
      passed: found,
      feedback: found
        ? `${describe(ref)} has the required preferred node affinity rule.`
        : `${describe(ref)} has no preferred node affinity matching key="${p.key}" operator="${p.operator}".`,
    };
  },
});

/**
 * k8s.hpa-config — checks static HPA spec fields. Only the listed fields are graded.
 * Does not claim metrics work: pair with k8s.resource-exists to prove the HPA exists.
 */
const hpaConfig = resourceValidator({
  type: "k8s.hpa-config",
  kinds: ["HorizontalPodAutoscaler"],
  params: {
    minReplicas: { type: "integer", min: 1, max: 1000 },
    maxReplicas: { type: "integer", min: 1, max: 1000 },
    targetRef: {
      type: "object",
      properties: {
        kind: { type: "string", required: true, minLength: 1, maxLength: 63 },
        name: NAME,
      },
    },
    cpuUtilization: { type: "integer", min: 1, max: 1000 },
  },
  refine(p, problems) {
    const fields = ["minReplicas", "maxReplicas", "targetRef", "cpuUtilization"];
    if (fields.every((f) => p[f] === undefined)) problems.add("", "set at least one HPA field");
    if (p.minReplicas !== undefined && p.maxReplicas !== undefined && p.minReplicas > p.maxReplicas)
      problems.add("minReplicas", "minReplicas must be <= maxReplicas");
  },
  evaluate(hpa, p, ref) {
    const spec = hpa.spec ?? {};
    const failures = [];
    const fmt = (actual, expected) =>
      `${actual === undefined ? "(not set)" : actual} — expected ${expected}`;
    if (p.minReplicas !== undefined && (spec.minReplicas ?? 1) !== p.minReplicas)
      failures.push(`minReplicas: ${fmt(spec.minReplicas, p.minReplicas)}`);
    if (p.maxReplicas !== undefined && spec.maxReplicas !== p.maxReplicas)
      failures.push(`maxReplicas: ${fmt(spec.maxReplicas, p.maxReplicas)}`);
    if (p.targetRef !== undefined) {
      const tr = spec.scaleTargetRef ?? {};
      if (p.targetRef.kind && tr.kind !== p.targetRef.kind)
        failures.push(`scaleTargetRef.kind: ${fmt(tr.kind, p.targetRef.kind)}`);
      if (p.targetRef.name && tr.name !== p.targetRef.name)
        failures.push(`scaleTargetRef.name: ${fmt(tr.name, p.targetRef.name)}`);
    }
    if (p.cpuUtilization !== undefined) {
      // autoscaling/v2 stores CPU target in spec.metrics[]; autoscaling/v1 uses
      // spec.targetCPUUtilizationPercentage. Check both representations.
      const v1cpu = spec.targetCPUUtilizationPercentage;
      const v2metrics = (spec.metrics ?? []).find(
        (m) => m.type === "Resource" && m.resource?.name === "cpu",
      );
      const v2cpu =
        v2metrics?.resource?.target?.averageUtilization ??
        v2metrics?.resource?.target?.averageValue;
      const actual = v1cpu ?? v2cpu;
      if (actual !== p.cpuUtilization)
        failures.push(`CPU utilization target: ${fmt(actual, p.cpuUtilization)}`);
    }
    return {
      passed: failures.length === 0,
      feedback:
        failures.length === 0
          ? `${describe(ref)} has the required configuration.`
          : `${describe(ref)} has incorrect configuration: ${failures.join("; ")}.`,
    };
  },
});

// ─── Level 5: Services, DNS & Traffic Routing validators ──────────────────────

/**
 * k8s.service-spec — validates a Service's type, ports, selector, clusterIP, or externalName.
 * Use alongside k8s.service-selects (which proves selector→workload match) and
 * k8s.endpoint-ready (which proves ready traffic backends).
 */
const SAFE_PORT_NUM = { type: "integer", min: 1, max: 65535 };
const SERVICE_PORT_ITEM = {
  type: "object",
  open: true,
  properties: {
    port: SAFE_PORT_NUM,
    targetPort: { type: "any" }, // integer or named-port string
    protocol: { type: "string", enum: ["TCP", "UDP", "SCTP"] },
    name: { type: "string", maxLength: 63 },
  },
};
const serviceSpec = {
  type: "k8s.service-spec",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(
      p,
      ["name", "namespace", "type", "clusterIP", "externalName", "ports", "selector"],
      problems,
    );
    check(p.name, NAME, "name", problems);
    check(
      p.namespace,
      { type: "string", required: true, pattern: DNS_LABEL },
      "namespace",
      problems,
    );
    if (p.type !== undefined)
      check(
        p.type,
        { type: "string", enum: ["ClusterIP", "NodePort", "LoadBalancer", "ExternalName"] },
        "type",
        problems,
      );
    if (p.clusterIP !== undefined)
      check(p.clusterIP, { type: "string", minLength: 1, maxLength: 40 }, "clusterIP", problems);
    if (p.externalName !== undefined)
      check(
        p.externalName,
        { type: "string", minLength: 1, maxLength: 253 },
        "externalName",
        problems,
      );
    if (p.ports !== undefined)
      check(p.ports, { type: "array", minItems: 1, items: SERVICE_PORT_ITEM }, "ports", problems);
    if (p.selector !== undefined) check(p.selector, STRING_MAP, "selector", problems);
    if (Object.keys(p).filter((k) => !["name", "namespace"].includes(k)).length === 0)
      problems.add(
        "",
        "set at least one Service field to check (type, clusterIP, ports, selector, or externalName)",
      );
  },
  async run(p, ctx) {
    const ref = { kind: "Service", name: p.name, namespace: p.namespace };
    const service = await ctx.query.get(ref);
    if (!service)
      return {
        passed: false,
        feedback: `Service "${p.name}" was not found in namespace "${p.namespace}".`,
      };
    if (service.metadata?.deletionTimestamp)
      return { passed: false, feedback: `Service "${p.name}" is being deleted.` };
    const spec = service.spec ?? {};
    const failures = [];
    const fmt = (actual, expected) =>
      `${actual === undefined ? "(not set)" : JSON.stringify(actual)} — expected ${JSON.stringify(expected)}`;
    if (p.type !== undefined && spec.type !== p.type)
      failures.push(`type: ${fmt(spec.type, p.type)}`);
    if (p.clusterIP !== undefined && spec.clusterIP !== p.clusterIP)
      failures.push(`clusterIP: ${fmt(spec.clusterIP, p.clusterIP)}`);
    if (p.externalName !== undefined && spec.externalName !== p.externalName)
      failures.push(`externalName: ${fmt(spec.externalName, p.externalName)}`);
    if (p.selector !== undefined) {
      const actual = spec.selector ?? {};
      for (const [k, v] of Object.entries(p.selector))
        if (actual[k] !== v) failures.push(`selector.${k}: ${fmt(actual[k], v)}`);
    }
    for (const required of p.ports ?? []) {
      const match = (spec.ports ?? []).find((port) => {
        if (required.port !== undefined && port.port !== required.port) return false;
        if (
          required.targetPort !== undefined &&
          String(port.targetPort) !== String(required.targetPort)
        )
          return false;
        if (required.name !== undefined && port.name !== required.name) return false;
        if (required.protocol !== undefined && port.protocol !== required.protocol) return false;
        return true;
      });
      if (!match) failures.push(`port ${JSON.stringify(required)} not found`);
    }
    return {
      passed: failures.length === 0,
      feedback:
        failures.length === 0
          ? `Service "${p.name}" has the required configuration.`
          : `Service "${p.name}" has incorrect configuration: ${failures.join("; ")}.`,
    };
  },
};

/**
 * k8s.endpoint-ready — verifies that at least `minReady` endpoints are ready for a Service,
 * by inspecting the controller-managed EndpointSlice objects.
 * Counts endpoints where conditions.ready === true and conditions.terminating !== true.
 */
const endpointReady = {
  type: "k8s.endpoint-ready",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(p, ["name", "namespace", "minReady"], problems);
    check(p.name, NAME, "name", problems);
    check(
      p.namespace,
      { type: "string", required: true, pattern: DNS_LABEL },
      "namespace",
      problems,
    );
    check(p.minReady, { type: "integer", required: true, min: 1, max: 1000 }, "minReady", problems);
  },
  async run(p, ctx) {
    const slices = await ctx.query.list({
      kind: "EndpointSlice",
      namespace: p.namespace,
      labelSelector: `kubernetes.io/service-name=${p.name}`,
    });
    let readyCount = 0;
    for (const slice of slices) {
      for (const endpoint of slice.endpoints ?? []) {
        const cond = endpoint.conditions ?? {};
        if (cond.ready === true && cond.terminating !== true) readyCount++;
      }
    }
    return {
      passed: readyCount >= p.minReady,
      feedback:
        readyCount >= p.minReady
          ? `Service "${p.name}" has ${readyCount} ready endpoint(s) (need ${p.minReady}).`
          : `Service "${p.name}" has ${readyCount} ready endpoint(s); need at least ${p.minReady}.`,
      details: { readyCount, sliceCount: slices.length },
    };
  },
};

// Restricted character set for HTTP paths in grader probes.
const SAFE_HTTP_PATH = /^\/[A-Za-z0-9._/-]{0,199}$/;
// Restricted character set for DNS names (includes dots for qualified names like svc.ns).
const SAFE_DNS_NAME = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;

/**
 * k8s.http-probe — executes `wget -qO- -T5 http://<host>:<port><path>` inside a named
 * client Pod and passes when the response body contains the expected string.
 * The client Pod must already exist in the exercise namespace (created by setup).
 * host must be a service DNS name (no IPs, no external hosts — validated by SAFE_DNS_NAME
 * which matches only lowercase alphanumeric, dots and hyphens, max 253 chars).
 */
const httpProbe = {
  type: "k8s.http-probe",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(p, ["clientPod", "namespace", "host", "port", "path", "contains"], problems);
    check(p.clientPod, NAME, "clientPod", problems);
    check(
      p.namespace,
      { type: "string", required: true, pattern: DNS_LABEL },
      "namespace",
      problems,
    );
    check(
      p.host,
      { type: "string", required: true, pattern: SAFE_DNS_NAME, maxLength: 253 },
      "host",
      problems,
    );
    check(p.port, { type: "integer", required: true, min: 1, max: 65535 }, "port", problems);
    if (p.path !== undefined)
      check(p.path, { type: "string", pattern: SAFE_HTTP_PATH, maxLength: 200 }, "path", problems);
    check(
      p.contains,
      { type: "string", required: true, minLength: 1, maxLength: 300 },
      "contains",
      problems,
    );
  },
  async run(p, ctx) {
    const ref = { kind: "Pod", name: p.clientPod, namespace: p.namespace };
    const pod = await ctx.query.get(ref);
    if (!pod)
      return {
        passed: false,
        feedback: `Client Pod "${p.clientPod}" was not found in namespace "${p.namespace}".`,
      };
    if (pod.status?.phase !== "Running")
      return { passed: false, feedback: `Client Pod "${p.clientPod}" is not Running.` };
    const path = p.path ?? "/";
    const url = `http://${p.host}:${p.port}${path}`;
    const result = await ctx.query.execArgv({
      podName: p.clientPod,
      namespace: p.namespace,
      argv: ["wget", "-qO-", "-T", "5", url],
    });
    if (result.exitCode !== 0) {
      return {
        passed: false,
        feedback: `HTTP request to "${url}" failed (exit ${result.exitCode}).`,
        details: { url },
      };
    }
    if (!result.stdout.includes(p.contains)) {
      return {
        passed: false,
        feedback: `HTTP response from "${url}" does not contain the expected content.`,
        details: { url, contains: p.contains },
      };
    }
    return { passed: true, feedback: `HTTP response from "${url}" contains the expected content.` };
  },
};

/**
 * k8s.dns-resolve — executes `nslookup <hostname>` inside a named client Pod and passes
 * when the lookup succeeds (exit 0). If `expectContains` is provided, the nslookup output
 * must also include that string (useful for checking a specific address or CNAME target).
 */
const dnsResolve = {
  type: "k8s.dns-resolve",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(p, ["clientPod", "namespace", "hostname", "expectContains"], problems);
    check(p.clientPod, NAME, "clientPod", problems);
    check(
      p.namespace,
      { type: "string", required: true, pattern: DNS_LABEL },
      "namespace",
      problems,
    );
    check(
      p.hostname,
      { type: "string", required: true, pattern: SAFE_DNS_NAME, maxLength: 253 },
      "hostname",
      problems,
    );
    if (p.expectContains !== undefined)
      check(
        p.expectContains,
        { type: "string", minLength: 1, maxLength: 253 },
        "expectContains",
        problems,
      );
  },
  async run(p, ctx) {
    const ref = { kind: "Pod", name: p.clientPod, namespace: p.namespace };
    const pod = await ctx.query.get(ref);
    if (!pod)
      return {
        passed: false,
        feedback: `Client Pod "${p.clientPod}" was not found in namespace "${p.namespace}".`,
      };
    if (pod.status?.phase !== "Running")
      return { passed: false, feedback: `Client Pod "${p.clientPod}" is not Running.` };
    // Busybox nslookup does not apply DNS search domains to dotted hostnames; always query
    // the fully-qualified cluster name so the check works regardless of nslookup implementation.
    const fqdn = p.hostname.includes(".svc.cluster.local")
      ? p.hostname
      : `${p.hostname}.svc.cluster.local`;
    const result = await ctx.query.execArgv({
      podName: p.clientPod,
      namespace: p.namespace,
      argv: ["nslookup", fqdn],
      timeoutMs: 10_000,
    });
    if (result.exitCode !== 0) {
      return {
        passed: false,
        feedback: `DNS lookup for "${p.hostname}" failed.`,
        details: { hostname: p.hostname, fqdn },
      };
    }
    if (p.expectContains !== undefined && !result.stdout.includes(p.expectContains)) {
      return {
        passed: false,
        feedback: `DNS lookup for "${p.hostname}" resolved but output does not contain "${p.expectContains}".`,
        details: { hostname: p.hostname, expectContains: p.expectContains },
      };
    }
    return { passed: true, feedback: `DNS lookup for "${p.hostname}" succeeded.` };
  },
};

// ─── Level 6: Ingress, Gateway API & HTTP Routing validators ──────────────────

/**
 * k8s.ingress-spec — checks an Ingress resource's rules and/or TLS section.
 * Validates that specific host+path→backend combinations appear in spec.rules,
 * and optionally that a named TLS entry covers a given host.
 *
 * Only the listed entries are checked; additional rules are ignored.
 */
const ingressSpec = {
  type: "k8s.ingress-spec",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(p, ["name", "namespace", "ingressClassName", "rules", "tls"], problems);
    check(p.name, NAME, "name", problems);
    check(
      p.namespace,
      { type: "string", required: true, pattern: DNS_LABEL },
      "namespace",
      problems,
    );
    if (p.ingressClassName !== undefined)
      check(
        p.ingressClassName,
        { type: "string", minLength: 1, maxLength: 253 },
        "ingressClassName",
        problems,
      );
    if (p.rules !== undefined) {
      check(
        p.rules,
        {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            open: true,
            properties: {
              host: { type: "string", minLength: 1, maxLength: 253 },
              path: { type: "string", minLength: 1, maxLength: 200 },
              pathType: { type: "string", enum: ["Exact", "Prefix", "ImplementationSpecific"] },
              backend: {
                type: "object",
                open: true,
                properties: {
                  serviceName: { type: "string", minLength: 1, maxLength: 253 },
                  servicePort: { type: "any" },
                },
              },
            },
          },
        },
        "rules",
        problems,
      );
    }
    if (p.tls !== undefined) {
      check(
        p.tls,
        {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            open: true,
            properties: {
              secretName: { type: "string", minLength: 1, maxLength: 253 },
              host: { type: "string", minLength: 1, maxLength: 253 },
            },
          },
        },
        "tls",
        problems,
      );
    }
    if (!p.ingressClassName && !p.rules && !p.tls)
      problems.add("", "set at least one of ingressClassName, rules, or tls");
  },
  async run(p, ctx) {
    const ref = { kind: "Ingress", name: p.name, namespace: p.namespace };
    const ingress = await ctx.query.get(ref);
    if (!ingress)
      return {
        passed: false,
        feedback: `Ingress "${p.name}" was not found in namespace "${p.namespace}".`,
      };
    if (ingress.metadata?.deletionTimestamp)
      return { passed: false, feedback: `Ingress "${p.name}" is being deleted.` };
    const failures = [];
    if (p.ingressClassName !== undefined) {
      const actual = ingress.spec?.ingressClassName;
      if (actual !== p.ingressClassName)
        failures.push(
          `ingressClassName is "${actual ?? "(not set)"}", expected "${p.ingressClassName}"`,
        );
    }
    for (const required of p.rules ?? []) {
      const hostRules = (ingress.spec?.rules ?? []).filter(
        (r) => !required.host || r.host === required.host,
      );
      if (hostRules.length === 0) {
        failures.push(`no rule for host "${required.host ?? "*"}"`);
        continue;
      }
      if (required.path !== undefined || required.backend !== undefined) {
        const paths = hostRules.flatMap((r) => r.http?.paths ?? []);
        const match = paths.find((p_) => {
          if (required.path !== undefined && p_.path !== required.path) return false;
          if (required.pathType !== undefined && p_.pathType !== required.pathType) return false;
          if (required.backend?.serviceName !== undefined) {
            const svc = p_.backend?.service?.name;
            if (svc !== required.backend.serviceName) return false;
          }
          if (required.backend?.servicePort !== undefined) {
            const port = p_.backend?.service?.port?.number ?? p_.backend?.service?.port?.name;
            if (String(port) !== String(required.backend.servicePort)) return false;
          }
          return true;
        });
        if (!match) {
          const desc = [
            required.path ? `path "${required.path}"` : "",
            required.pathType ? `pathType "${required.pathType}"` : "",
            required.backend?.serviceName ? `→ service "${required.backend.serviceName}"` : "",
            required.backend?.servicePort !== undefined ? `:${required.backend.servicePort}` : "",
          ]
            .filter(Boolean)
            .join(" ");
          failures.push(`no path rule matching ${desc} under host "${required.host ?? "*"}"`);
        }
      }
    }
    for (const required of p.tls ?? []) {
      const entries = ingress.spec?.tls ?? [];
      const match = entries.find((t) => {
        if (required.secretName !== undefined && t.secretName !== required.secretName) return false;
        if (required.host !== undefined && !(t.hosts ?? []).includes(required.host)) return false;
        return true;
      });
      if (!match) {
        failures.push(
          `no TLS entry matching secretName "${required.secretName ?? "*"}" and host "${required.host ?? "*"}"`,
        );
      }
    }
    return {
      passed: failures.length === 0,
      feedback:
        failures.length === 0
          ? `Ingress "${p.name}" has the required configuration.`
          : `Ingress "${p.name}" is incorrect: ${failures.join("; ")}.`,
    };
  },
};

/**
 * k8s.gateway-ready — passes when a Gateway's conditions include Accepted=True and
 * Programmed=True at observedGeneration == generation. Also accepts a specific listener
 * by index (0-based) to check listener-level Programmed=True.
 * A missing status or stale generation is "not yet reconciled", not a pass.
 */
const gatewayReady = resourceValidator({
  type: "k8s.gateway-ready",
  kinds: ["Gateway"],
  params: {
    listenerIndex: { type: "integer", min: 0, max: 99 },
  },
  evaluate(gateway, p, ref) {
    const generation = gateway.metadata?.generation ?? 0;
    const status = gateway.status ?? {};
    const conditions = status.conditions ?? [];
    const accepted = conditions.find((c) => c.type === "Accepted");
    const programmed = conditions.find((c) => c.type === "Programmed");

    // GatewayStatus has no top-level observedGeneration; staleness is on each condition.
    if (!accepted) {
      return {
        passed: false,
        feedback: `${describe(ref)} has not been reconciled yet — no status conditions found.`,
      };
    }
    const observedGen = accepted.observedGeneration;
    if (observedGen !== undefined && observedGen < generation)
      return {
        passed: false,
        feedback: `${describe(ref)} has pending changes not yet reconciled by the controller (generation ${generation}, observed ${observedGen}).`,
      };
    if (accepted.status !== "True")
      return {
        passed: false,
        feedback: `${describe(ref)} is not Accepted (${accepted?.reason ?? "no status"}).`,
      };
    if (!programmed || programmed.status !== "True")
      return {
        passed: false,
        feedback: `${describe(ref)} is not Programmed (${programmed?.reason ?? "no status"}).`,
      };
    if (p.listenerIndex !== undefined) {
      const listener = (status.listeners ?? [])[p.listenerIndex];
      if (!listener)
        return {
          passed: false,
          feedback: `${describe(ref)} has no listener at index ${p.listenerIndex}.`,
        };
      const lProgrammed = (listener.conditions ?? []).find((c) => c.type === "Programmed");
      if (!lProgrammed || lProgrammed.status !== "True")
        return {
          passed: false,
          feedback: `${describe(ref)} listener ${p.listenerIndex} is not Programmed (${lProgrammed?.reason ?? "no status"}).`,
        };
    }
    return { passed: true, feedback: `${describe(ref)} is Accepted and Programmed.` };
  },
});

/**
 * k8s.httproute-accepted — passes when the HTTPRoute's status includes a parent entry
 * with Accepted=True and ResolvedRefs=True at an observedGeneration matching the
 * resource's own generation. Optionally filters by parentRef name.
 * A stale generation is "not yet reconciled", not a pass.
 */
const httpRouteAccepted = {
  type: "k8s.httproute-accepted",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(p, ["name", "namespace", "parentRefName"], problems);
    check(p.name, NAME, "name", problems);
    check(
      p.namespace,
      { type: "string", required: true, pattern: DNS_LABEL },
      "namespace",
      problems,
    );
    if (p.parentRefName !== undefined)
      check(
        p.parentRefName,
        { type: "string", minLength: 1, maxLength: 253 },
        "parentRefName",
        problems,
      );
  },
  async run(p, ctx) {
    const ref = { kind: "HTTPRoute", name: p.name, namespace: p.namespace };
    const route = await ctx.query.get(ref);
    if (!route)
      return {
        passed: false,
        feedback: `HTTPRoute "${p.name}" was not found in namespace "${p.namespace}".`,
      };
    if (route.metadata?.deletionTimestamp)
      return { passed: false, feedback: `HTTPRoute "${p.name}" is being deleted.` };
    const generation = route.metadata?.generation ?? 0;
    const parents = route.status?.parents ?? [];
    const candidates = p.parentRefName
      ? parents.filter((e) => e.parentRef?.name === p.parentRefName)
      : parents;
    if (candidates.length === 0) {
      const msg =
        parents.length === 0
          ? `HTTPRoute "${p.name}" has no parent status yet — the controller may not have reconciled it.`
          : `HTTPRoute "${p.name}" has no parent status for "${p.parentRefName ?? "*"}".`;
      return { passed: false, feedback: msg };
    }
    for (const entry of candidates) {
      const observed =
        entry.conditions?.find?.((c) => c.observedGeneration !== undefined)?.observedGeneration ??
        entry.observedGeneration;
      if (observed !== undefined && observed < generation)
        return {
          passed: false,
          feedback: `HTTPRoute "${p.name}" parent "${entry.parentRef?.name ?? "(unknown)"}" status is stale (generation ${generation}, observed ${observed}).`,
        };
      const conditions = entry.conditions ?? [];
      const accepted = conditions.find((c) => c.type === "Accepted");
      const resolved = conditions.find((c) => c.type === "ResolvedRefs");
      if (!accepted || accepted.status !== "True")
        return {
          passed: false,
          feedback: `HTTPRoute "${p.name}" is not Accepted by gateway "${entry.parentRef?.name ?? "(unknown)"}" (${accepted?.reason ?? "no status"}).`,
        };
      if (!resolved || resolved.status !== "True")
        return {
          passed: false,
          feedback: `HTTPRoute "${p.name}" has unresolved references (${resolved?.reason ?? "no status"}). Check backend Service names and namespaces.`,
        };
    }
    return {
      passed: true,
      feedback: `HTTPRoute "${p.name}" is Accepted with resolved references.`,
    };
  },
};

// Traefik ClusterIP address (hardcoded — never derived from learner content).
// Format: <service>.<namespace>.svc.cluster.local
const TRAEFIK_HTTP_ADDR = "traefik.traefik-system.svc.cluster.local:80";
const TRAEFIK_HTTPS_ADDR = "traefik.traefik-system.svc.cluster.local:443";

// Hostname for routing probe: lowercase letters, digits, dots, hyphens. No IPs, no external hosts.
// Must start and end with a letter or digit.
const SAFE_ROUTING_HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;

/**
 * k8s.routing-probe — executes a curl request inside a named client Pod that reaches the
 * platform Traefik proxy with a controlled Host header.
 *
 * The request always goes to the hardcoded Traefik ClusterIP — learner-supplied hostnames
 * only set the HTTP Host header and TLS SNI; they never become network targets. This
 * prevents the grader from acting as a network-scanning utility.
 *
 * Params:
 *   clientPod   — Pod in the exercise namespace that runs curl (must have curlimages/curl)
 *   namespace   — exercise namespace containing the client Pod
 *   host        — hostname for the HTTP Host header (and SNI for HTTPS)
 *   path        — HTTP path (default: /)
 *   https       — true for HTTPS (connects to port 443, skips cert verification); false/absent for HTTP
 *   contains    — expected substring in the response body
 *   statusCode  — expected HTTP status code (default: 200); pass 301/302 to check redirects
 *   locationContains — for redirects: substring expected in the Location response header
 */
const routingProbe = {
  type: "k8s.routing-probe",
  track: "kubernetes",
  validateParams(p, { problems }) {
    rejectUnknown(
      p,
      [
        "clientPod",
        "namespace",
        "host",
        "path",
        "https",
        "contains",
        "statusCode",
        "locationContains",
      ],
      problems,
    );
    check(p.clientPod, NAME, "clientPod", problems);
    check(
      p.namespace,
      { type: "string", required: true, pattern: DNS_LABEL },
      "namespace",
      problems,
    );
    check(
      p.host,
      { type: "string", required: true, pattern: SAFE_ROUTING_HOST, maxLength: 253 },
      "host",
      problems,
    );
    if (p.path !== undefined)
      check(p.path, { type: "string", pattern: SAFE_HTTP_PATH, maxLength: 200 }, "path", problems);
    if (p.https !== undefined) check(p.https, { type: "boolean" }, "https", problems);
    if (p.contains !== undefined)
      check(p.contains, { type: "string", minLength: 1, maxLength: 300 }, "contains", problems);
    if (p.statusCode !== undefined)
      check(p.statusCode, { type: "integer", min: 100, max: 599 }, "statusCode", problems);
    if (p.locationContains !== undefined)
      check(
        p.locationContains,
        { type: "string", minLength: 1, maxLength: 500 },
        "locationContains",
        problems,
      );
    if (!p.contains && !p.statusCode && !p.locationContains)
      problems.add("", "set at least one of contains, statusCode, or locationContains");
  },
  async run(p, ctx) {
    const ref = { kind: "Pod", name: p.clientPod, namespace: p.namespace };
    const pod = await ctx.query.get(ref);
    if (!pod)
      return {
        passed: false,
        feedback: `Client Pod "${p.clientPod}" was not found in namespace "${p.namespace}".`,
      };
    if (pod.status?.phase !== "Running")
      return { passed: false, feedback: `Client Pod "${p.clientPod}" is not Running.` };

    const path = p.path ?? "/";
    const addr = p.https ? TRAEFIK_HTTPS_ADDR : TRAEFIK_HTTP_ADDR;
    const url = `${p.https ? "https" : "http"}://${p.host}${path}`;
    const expectedStatus = p.statusCode ?? 200;

    // Build the curl argv. All elements are hardcoded or content-load-validated.
    // --connect-to routes the connection to the fixed Traefik address without resolving the hostname.
    // --no-location prevents following redirects so callers can assert on status 3xx.
    const argv = [
      "curl",
      "--silent",
      "--max-time",
      "8",
      "--max-filesize",
      "65536",
      "--no-location",
      "--proto",
      p.https ? "=https" : "=http",
      "--connect-to",
      `${p.host}::${addr}`,
      "-w",
      "\\n---HTTP-STATUS:%{http_code}---",
    ];

    if (p.https) {
      // Skip certificate verification: proves TLS transport and routing, not cert trust.
      // TLS certificate correctness is checked separately via k8s.tls-secret-config.
      argv.push("--insecure");
    }

    if (p.locationContains) {
      // Request the Location header
      argv.push("-D", "-"); // dump response headers to stdout
    }

    argv.push(url);

    const result = await ctx.query.execArgv({
      podName: p.clientPod,
      namespace: p.namespace,
      argv,
      timeoutMs: 20_000,
    });

    // curl exit codes: 6=DNS, 7=connect, 28=timeout, 35/60=TLS; only 0 is success.
    if (result.exitCode !== 0) {
      const curlError = {
        6: "DNS resolution failed — check that the controller is running",
        7: "TCP connection refused — check that the routing controller is ready",
        28: "Request timed out — check the backend Service and Pods",
        35: "TLS handshake failed",
        60: "TLS certificate verification failed",
      };
      const hint = curlError[result.exitCode] ?? `curl exit ${result.exitCode}`;
      return {
        passed: false,
        feedback: `Routing probe to "${url}" failed: ${hint}.`,
        details: { url, exitCode: result.exitCode },
      };
    }

    const output = result.stdout ?? "";
    const statusMatch = output.match(/---HTTP-STATUS:(\d+)---/);
    const actualStatus = statusMatch ? parseInt(statusMatch[1], 10) : 0;

    if (actualStatus !== expectedStatus) {
      return {
        passed: false,
        feedback: `Routing probe to "${url}" returned HTTP ${actualStatus}, expected ${expectedStatus}.`,
        details: { url, actualStatus, expectedStatus },
      };
    }

    if (p.locationContains !== undefined) {
      const locationHeader = output.match(/^[Ll]ocation:\s*(.+)$/m)?.[1]?.trim() ?? "";
      if (!locationHeader.includes(p.locationContains)) {
        return {
          passed: false,
          feedback: `Routing probe to "${url}" did not find "${p.locationContains}" in the Location header.`,
          details: { url },
        };
      }
    }

    if (p.contains !== undefined) {
      // Strip the status sentinel appended by -w, then optionally strip response headers
      // (present only when -D - is passed for locationContains checks).
      // Use non-greedy .*? so the header/body split stops at the FIRST blank line, not the last.
      let body = output.replace(/---HTTP-STATUS:\d+---\s*$/, "");
      if (p.locationContains !== undefined) body = body.replace(/^.*?\r?\n\r?\n/s, "");
      if (!body.includes(p.contains)) {
        return {
          passed: false,
          feedback: `Routing probe to "${url}" returned HTTP ${actualStatus} but the response body did not contain the expected content.`,
          details: { url },
        };
      }
    }

    return {
      passed: true,
      feedback: `Routing probe to "${url}" returned HTTP ${actualStatus} as expected.`,
    };
  },
};

/**
 * k8s.httproute-weights — checks that an HTTPRoute has (at minimum) two backendRefs with
 * the given relative weights. Verifies configuration only; actual traffic distribution
 * requires behavioral verification (see level6 scenarios).
 *
 * `backends` is an array of {name, weight} pairs; at least two must be specified.
 * Only the listed backends are checked; additional ones are ignored.
 */
const httpRouteWeights = resourceValidator({
  type: "k8s.httproute-weights",
  kinds: ["HTTPRoute"],
  params: {
    backends: {
      type: "array",
      required: true,
      minItems: 2,
      items: {
        type: "object",
        open: true,
        properties: {
          name: NAME,
          weight: { type: "integer", min: 0, max: 1_000_000 },
        },
      },
    },
  },
  evaluate(route, p, ref) {
    const rules = route.spec?.rules ?? [];
    const allBackends = rules.flatMap((r) => r.backendRefs ?? []);
    const failures = [];
    for (const required of p.backends) {
      const match = allBackends.find(
        (b) =>
          b.name === required.name &&
          (required.weight === undefined || b.weight === required.weight),
      );
      if (!match) {
        const desc =
          required.weight !== undefined
            ? `backend "${required.name}" with weight ${required.weight}`
            : `backend "${required.name}"`;
        failures.push(`no ${desc}`);
      }
    }
    return {
      passed: failures.length === 0,
      feedback:
        failures.length === 0
          ? `${describe(ref)} has the required backend weights.`
          : `${describe(ref)} is missing: ${failures.join("; ")}.`,
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
  configMapData,
  secretType,
  secretKeys,
  containerEnvFrom,
  secretMounted,
  containerSecurityContext,
  serviceSelects,
  deploymentStrategy,
  deploymentNotPaused,
  podTemplateLabelsCheck,
  containerRuntimeEnv,
  initContainer,
  jobComplete,
  jobConfig,
  cronJobConfig,
  daemonSetStatus,
  sharedEmptyDir,
  execFile,
  // Level 4 validators
  podQosClass,
  resourceQuota,
  limitRange,
  nodeSelector,
  podTolerations,
  nodeAffinity,
  hpaConfig,
  // Level 5 validators
  serviceSpec,
  endpointReady,
  httpProbe,
  dnsResolve,
  // Level 6 validators — Ingress, Gateway API and HTTP routing
  ingressSpec,
  gatewayReady,
  httpRouteAccepted,
  routingProbe,
  httpRouteWeights,
]);
