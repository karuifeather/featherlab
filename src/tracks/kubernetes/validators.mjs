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
]);
