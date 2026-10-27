import { randomUUID } from "node:crypto";
import { KINDS } from "../../src/tracks/kubernetes/kinds.mjs";

const KIND_BY_RESOURCE = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [v.resource, k]));

/**
 * In-memory stand-in for `docker exec <workstation> kubectl ...`, implementing the
 * CommandRunner contract. It understands just the kubectl invocations FeatherLab makes
 * (get/list/create/apply/delete, raw namespace DELETE with a UID precondition, the default
 * ServiceAccount, current-context, --raw readyz) and records every call, so tests can
 * assert on both resulting state and which commands ran.
 *
 * Namespace semantics follow Kubernetes: `create` refuses an existing object, deleting a
 * namespace removes everything in it, and a namespace listed in `stuckNamespaces` stays
 * Terminating (as if a finalizer never completed). `default` and `kube-system` exist from
 * the start so tests can prove they survive.
 */
export function createFakeCluster({ resources = [], context = "kind-featherlab" } = {}) {
  const store = new Map();
  const calls = [];
  const key = (kind, namespace, name) => `${kind}/${namespace ?? ""}/${name}`;
  const cluster = {
    calls,
    down: false,
    context,
    stuckNamespaces: new Set(),
    failNextApplyAfter: undefined, // number of successful creates/applies before one fails
    put(resource) {
      const { kind, metadata } = resource;
      const copy = structuredClone(resource);
      copy.metadata.uid ??= randomUUID();
      store.set(key(kind, metadata.namespace, metadata.name), copy);
      return resource;
    },
    find(kind, name, namespace) {
      return store.get(key(kind, namespace, name));
    },
    remove(kind, name, namespace) {
      store.delete(key(kind, namespace, name));
    },
    all() {
      return [...store.values()];
    },
    commands() {
      return calls.map((c) => c.argv.join(" "));
    },
    /** Commands that could change state (everything except reads). */
    mutations() {
      return cluster
        .commands()
        .filter((c) => /^kubectl (create|apply|delete|replace|patch|label|scale)\b/.test(c));
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
      if (verb === "config" && args[2] === "current-context") return ok(`${cluster.context}\n`);
      if (verb === "get" && args[2] === "--raw") return ok("ok");
      if (verb === "get" && args[2] === "serviceaccount") {
        const namespace = flag("-n");
        return cluster.find("Namespace", namespace)
          ? ok("serviceaccount/default")
          : fail(`Error from server (NotFound): serviceaccounts "default" not found`);
      }
      if (verb === "delete" && args[2] === "--raw") return deleteNamespaceRaw(args[3], options);
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
      if (verb === "create" || verb === "apply") {
        if (cluster.failNextApplyAfter !== undefined) {
          if (cluster.failNextApplyAfter-- <= 0) {
            cluster.failNextApplyAfter = undefined;
            return fail("error: admission webhook denied the request");
          }
        }
        const incoming = JSON.parse(options.stdin);
        const { kind: k, metadata } = incoming;
        const previous = cluster.find(k, metadata.name, metadata.namespace);
        if (metadata.namespace && !cluster.find("Namespace", metadata.namespace))
          return fail(`Error from server (NotFound): namespaces "${metadata.namespace}" not found`);
        if (
          metadata.namespace &&
          cluster.find("Namespace", metadata.namespace).metadata.deletionTimestamp
        )
          return fail(
            `Error from server (Forbidden): namespace ${metadata.namespace} is being terminated`,
          );
        if (verb === "create" && previous)
          return fail(`Error from server (AlreadyExists): ${k} "${metadata.name}" already exists`);
        cluster.put({ ...previous, ...incoming, status: previous?.status ?? incoming.status });
        return ok(verb === "create" ? "created" : "applied");
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

  function deleteNamespaceRaw(url, { stdin }) {
    const match = /^\/api\/v1\/namespaces\/([a-z0-9-]+)$/.exec(url ?? "");
    if (!match) return fail(`unsupported raw delete ${url}`);
    const name = match[1];
    const ns = cluster.find("Namespace", name);
    if (!ns) return fail(`Error from server (NotFound): namespaces "${name}" not found`);
    const uid = JSON.parse(stdin ?? "{}").preconditions?.uid;
    if (uid !== undefined && uid !== ns.metadata.uid)
      return fail(
        `Error from server (Conflict): Operation cannot be fulfilled on namespaces "${name}": Precondition failed: UID in precondition: ${uid}, UID in object meta: ${ns.metadata.uid}`,
      );
    if (cluster.stuckNamespaces.has(name)) {
      ns.metadata.deletionTimestamp ??= new Date().toISOString();
      ns.status = {
        phase: "Terminating",
        conditions: [
          {
            type: "NamespaceFinalizersRemaining",
            status: "True",
            message:
              "Some content in the namespace has finalizers remaining: example.com/hold in 1 resource instances",
          },
        ],
      };
      return ok(JSON.stringify(ns));
    }
    for (const [k, r] of store) if (r.metadata.namespace === name) store.delete(k);
    store.delete(key("Namespace", undefined, name));
    return ok(JSON.stringify(ns));
  }

  for (const name of ["default", "kube-system"])
    cluster.put({ apiVersion: "v1", kind: "Namespace", metadata: { name } });
  resources.forEach((r) => cluster.put(r));
  return cluster;
}

const ok = (stdout) => ({ stdout, stderr: "", exitCode: 0 });
const fail = (stderr) => ({ stdout: "", stderr, exitCode: 1 });

export function readyPod({ name = "web", namespace = "fl-k8s-0001", image = "nginx:1.27" } = {}) {
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name, namespace },
    spec: { containers: [{ name: "c", image }] },
    status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
  };
}

/** A Deployment whose rollout is complete (`available` < `replicas` leaves it unfinished). */
export function deployment({
  name = "api",
  namespace = "fl-k8s-0002",
  image = "nginx:1.27",
  replicas = 2,
  available = replicas,
  labels = { tier: "backend" },
} = {}) {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name, namespace, labels, generation: 1 },
    spec: { replicas, template: { spec: { containers: [{ name: "c", image }] } } },
    status: {
      observedGeneration: 1,
      replicas,
      updatedReplicas: replicas,
      availableReplicas: available,
      readyReplicas: available,
    },
  };
}

/** Namespace object carrying FeatherLab's ownership labels for `exerciseId`. */
export function ownedNamespace(name, exerciseId) {
  return {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name,
      labels: {
        "app.kubernetes.io/managed-by": "featherlab",
        "featherlab.dev/exercise": exerciseId,
      },
    },
  };
}
