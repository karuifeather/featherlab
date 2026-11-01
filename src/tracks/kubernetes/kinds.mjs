/**
 * Kubernetes kinds FeatherLab exercises may reference. This allow-list is a security
 * boundary: exercise content can only create, query or delete these kinds. To support a
 * new kind, add one entry here.
 *
 * `podSpecPath` locates the PodSpec for kinds that run containers.
 * `queryOnly` marks kinds that validators may read but that must never appear in exercise
 * setup manifests. This applies to both cluster-scoped kinds (Node) and namespaced kinds
 * that exercises must not create or modify directly (EndpointSlice — controller-managed).
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
  CronJob: {
    resource: "cronjobs.batch",
    namespaced: true,
    podSpecPath: ["spec", "jobTemplate", "spec", "template", "spec"],
  },
  Service: { resource: "services", namespaced: true },
  ConfigMap: { resource: "configmaps", namespaced: true },
  Secret: { resource: "secrets", namespaced: true },
  Namespace: { resource: "namespaces", namespaced: false },
  // Level 4 additions — resource management and scheduling
  ResourceQuota: { resource: "resourcequotas", namespaced: true },
  LimitRange: { resource: "limitranges", namespaced: true },
  HorizontalPodAutoscaler: { resource: "horizontalpodautoscalers.autoscaling", namespaced: true },
  // Node is cluster-scoped and query-only: validators may read nodes but setup manifests cannot
  // create or delete them (lifecycle.mjs already blocks all cluster-scoped objects in manifests).
  Node: { resource: "nodes", namespaced: false, queryOnly: true },
  // Level 5 additions — services, DNS, and traffic routing
  // EndpointSlice is namespaced but controller-managed: exercises observe them, never create them.
  EndpointSlice: {
    resource: "endpointslices.discovery.k8s.io",
    namespaced: true,
    queryOnly: true,
  },
  // Level 6 additions — Ingress, Gateway API, and HTTP routing (profile: kind-routing)
  // Exercises may create Ingress resources; controller must be installed by the platform.
  Ingress: { resource: "ingresses.networking.k8s.io", namespaced: true },
  // IngressClass is cluster-scoped and platform-owned: exercises inspect it, never create it.
  IngressClass: {
    resource: "ingressclasses.networking.k8s.io",
    namespaced: false,
    queryOnly: true,
  },
  // Gateway API core kinds (gateway.networking.k8s.io/v1).
  // GatewayClass is cluster-scoped and platform-owned: exercises inspect it, never create it.
  GatewayClass: {
    resource: "gatewayclasses.gateway.networking.k8s.io",
    namespaced: false,
    queryOnly: true,
  },
  // Gateway and HTTPRoute are namespaced: exercises own and create them in exercise namespaces.
  Gateway: { resource: "gateways.gateway.networking.k8s.io", namespaced: true },
  HTTPRoute: { resource: "httproutes.gateway.networking.k8s.io", namespaced: true },
  // ReferenceGrant (v1beta1) allows cross-namespace backend references in exercise-owned namespaces.
  ReferenceGrant: { resource: "referencegrants.gateway.networking.k8s.io", namespaced: true },
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
  // Level 6: the routing controller namespace is platform-owned.
  "traefik-system",
]);

export const DNS_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
export const DNS_SUBDOMAIN = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;

export const KIND_NAMES = Object.freeze(Object.keys(KINDS));

export function podSpecOf(resource, kind) {
  const path = KINDS[kind]?.podSpecPath;
  if (!path) return undefined;
  return path.reduce((node, key) => node?.[key], resource);
}
