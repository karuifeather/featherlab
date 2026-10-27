/**
 * Kubernetes kinds FeatherLab exercises may reference. This allow-list is a security
 * boundary: exercise content can only create, query or delete these kinds. To support a
 * new kind, add one entry here.
 *
 * `podSpecPath` locates the PodSpec for kinds that run containers.
 */
export const KINDS = Object.freeze({
  Pod: { resource: "pods", namespaced: true, podSpecPath: ["spec"] },
  Deployment: {
    resource: "deployments.apps",
    namespaced: true,
    podSpecPath: ["spec", "template", "spec"],
  },
  ReplicaSet: {
    resource: "replicasets.apps",
    namespaced: true,
    podSpecPath: ["spec", "template", "spec"],
  },
  StatefulSet: {
    resource: "statefulsets.apps",
    namespaced: true,
    podSpecPath: ["spec", "template", "spec"],
  },
  DaemonSet: {
    resource: "daemonsets.apps",
    namespaced: true,
    podSpecPath: ["spec", "template", "spec"],
  },
  Job: { resource: "jobs.batch", namespaced: true, podSpecPath: ["spec", "template", "spec"] },
  Service: { resource: "services", namespaced: true },
  ConfigMap: { resource: "configmaps", namespaced: true },
  Namespace: { resource: "namespaces", namespaced: false },
});

/**
 * Namespaces owned by the cluster or the learner; lifecycle operations must never manage
 * them. (Exercise namespaces must also be named `fl-<id>`, which excludes these anyway.)
 */
export const PROTECTED_NAMESPACES = Object.freeze([
  "default",
  "kube-system",
  "kube-public",
  "kube-node-lease",
]);

export const DNS_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
export const DNS_SUBDOMAIN = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;

export const KIND_NAMES = Object.freeze(Object.keys(KINDS));

export function podSpecOf(resource, kind) {
  const path = KINDS[kind]?.podSpecPath;
  if (!path) return undefined;
  return path.reduce((node, key) => node?.[key], resource);
}
