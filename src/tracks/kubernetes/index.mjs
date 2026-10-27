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
    // Each profile names an environment shape. v1 ships the single-node kind cluster.
    profiles: ["kind-default"],
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
