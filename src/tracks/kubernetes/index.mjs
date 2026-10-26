import { KubernetesQuery } from "./query.mjs";
import { compileLifecycle, createDriver } from "./lifecycle.mjs";
import { kubernetesValidators } from "./validators.mjs";

/**
 * The Kubernetes track. `runner` is a CommandRunner (see infrastructure/docker) that
 * executes `kubectl` against the practice cluster with the application's privileges.
 */
export function createKubernetesTrack({ runner }) {
  const createQuery = ({ signal }) => new KubernetesQuery({ runner, signal });
  return {
    id: "kubernetes",
    // Each profile names an environment shape. v1 ships the single-node kind cluster.
    profiles: ["kind-default"],
    validators: kubernetesValidators,
    compileLifecycle,
    driver: createDriver({ runner, createQuery }),
  };
}
