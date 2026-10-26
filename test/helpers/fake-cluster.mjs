import { KINDS } from "../../src/tracks/kubernetes/kinds.mjs";

const KIND_BY_RESOURCE = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v.resource, k]));

/**
 * In-memory stand-in for `docker exec <workstation> kubectl ...`, implementing the
 * CommandRunner contract. It understands just the kubectl invocations FeatherLab makes
 * (get/list/apply/delete/--raw) and records every call, so tests can assert on both
 * resulting state and which commands ran.
 */
export function createFakeCluster({ resources = [] } = {}) {
  const store = new Map();
  const calls = [];
  const key = (kind, namespace, name) => `${kind}/${namespace ?? ""}/${name}`;
  const cluster = {
    calls,
    down: false,
    failNextApplyAfter: undefined, // number of successful applies before one fails
    put(resource) {
      const { kind, metadata } = resource;
      store.set(key(kind, metadata.namespace, metadata.name), structuredClone(resource));
      return resource;
    },
    find(kind, name, namespace) {
      return store.get(key(kind, namespace, name));
    },
    all() {
      return [...store.values()];
    },
    commands() {
      return calls.map((c) => c.argv.join(" "));
    },
    async run(argv, options = {}) {
      calls.push({ argv, stdin: options.stdin });
      if (cluster.down) {
        return {
          stdout: "",
          stderr: "Unable to connect to the server: connection refused",
          exitCode: 1,
        };
      }
      const args = argv.filter((a) => !a.startsWith("--request-timeout"));
      const flag = (name) => {
        const i = args.indexOf(name);
        return i >= 0 ? args[i + 1] : undefined;
      };
      const [, verb] = args;
      if (verb === "get" && args[2] === "--raw") return ok("ok");
      const resourceName = args[2];
      const kind = KIND_BY_RESOURCE[resourceName];
      if (verb === "get") {
        const namespace = flag("-n");
        const name = args[3] && !args[3].startsWith("-") ? args[3] : undefined;
        if (name) {
          const found = store.get(key(kind, namespace, name));
          if (!found || (found.metadata.namespace ?? "") !== (namespace ?? ""))
            return fail(`Error from server (NotFound): ${resourceName} "${name}" not found`);
          return ok(JSON.stringify(found));
        }
        const selector = flag("--field-selector")?.replace("metadata.name=", "");
        const items = cluster
          .all()
          .filter((r) => r.kind === kind)
          .filter((r) => !namespace || r.metadata.namespace === namespace)
          .filter((r) => !selector || r.metadata.name === selector);
        return ok(JSON.stringify({ items }));
      }
      if (verb === "apply") {
        if (cluster.failNextApplyAfter !== undefined) {
          if (cluster.failNextApplyAfter-- <= 0) {
            cluster.failNextApplyAfter = undefined;
            return fail("error: admission webhook denied the request");
          }
        }
        const incoming = JSON.parse(options.stdin);
        const previous = cluster.find(
          incoming.kind,
          incoming.metadata.name,
          incoming.metadata.namespace,
        );
        cluster.put({ ...previous, ...incoming, status: previous?.status ?? incoming.status });
        return ok("applied");
      }
      if (verb === "delete") {
        const name = args[3];
        const namespace = flag("-n");
        store.delete(key(kind, namespace, name));
        return ok("deleted");
      }
      return fail(`unsupported fake kubectl invocation: ${args.join(" ")}`);
    },
  };
  resources.forEach((r) => cluster.put(r));
  return cluster;
}

const ok = (stdout) => ({ stdout, stderr: "", exitCode: 0 });
const fail = (stderr) => ({ stdout: "", stderr, exitCode: 1 });

export function readyPod({ name = "web", namespace = "default", image = "nginx:1.27" } = {}) {
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name, namespace },
    spec: { containers: [{ name: "c", image }] },
    status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
  };
}

export function deployment({
  name = "api",
  namespace = "staging",
  image = "nginx:1.27",
  replicas = 2,
  available = replicas,
  labels = { tier: "backend" },
} = {}) {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name, namespace, labels },
    spec: { replicas, template: { spec: { containers: [{ name: "c", image }] } } },
    status: { availableReplicas: available, readyReplicas: available },
  };
}
