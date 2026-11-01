import { KubernetesQuery } from "./query.mjs";
import { compileLifecycle, createDriver, validateCheckScope } from "./lifecycle.mjs";
import { kubernetesValidators } from "./validators.mjs";

/**
 * The Kubernetes track. `runner` is a CommandRunner (see infrastructure/docker) that
 * executes `kubectl` against the practice cluster with the application's privileges.
 *
 * `cluster` names the kind cluster the workstation must be connected to. When given, every
 * lifecycle operation first verifies that the kubeconfig's current context is
 * `kind-<cluster>`, so a misconfigured workstation can never point a reset at another cluster.
 */
export function createKubernetesTrack({ runner, cluster, driverOptions = {} }) {
  const createQuery = ({ signal }) => new KubernetesQuery({ runner, signal });
  return {
    id: "kubernetes",
    // Each profile names an environment shape.
    // kind-default: plain single-node kind cluster (Levels 0–5).
    // kind-routing: kind cluster with Traefik v3 + Gateway API CRDs pre-installed (Level 6+).
    // kind-networkpolicy: same base cluster; kindnet CNI enforces NetworkPolicy (Level 7).
    profiles: ["kind-default", "kind-routing", "kind-networkpolicy"],
    validators: kubernetesValidators,
    compileLifecycle,
    validateCheckScope,
    driver: createDriver({
      runner,
      createQuery,
      expectedContext: cluster ? `kind-${cluster}` : undefined,
      ...driverOptions,
    }),
  };
}
