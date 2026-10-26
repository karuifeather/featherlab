import { EnvironmentError } from "../../core/errors.mjs";
import { KINDS } from "./kinds.mjs";

const REQUEST_TIMEOUT = "--request-timeout=8s";
const NOT_FOUND = /\(NotFound\)|not found/i;

/**
 * Read-only view of cluster state for validators (`ctx.query`).
 *
 * All access goes through an injected CommandRunner (see infrastructure/docker), so
 * validators never shell out and tests substitute a fake runner. One instance serves a
 * single grading pass and memoizes lookups so several checks on one resource cost one
 * kubectl call.
 *
 * Contract:
 *  - `get` resolves to the resource object, or `null` when it does not exist.
 *  - Anything else that goes wrong (cluster down, timeout, garbage output) rejects with
 *    EnvironmentError so it is reported as "could not check", never as a wrong answer.
 */
export class KubernetesQuery {
  #runner;
  #signal;
  #cache = new Map();

  constructor({ runner, signal }) {
    this.#runner = runner;
    this.#signal = signal;
  }

  get({ kind, name, namespace }) {
    const spec = kindSpec(kind);
    const args = ["get", spec.resource, name];
    if (spec.namespaced) args.push("-n", namespace);
    return this.#memo(["get", kind, namespace, name], async () => {
      const result = await this.#kubectl([...args, "-o", "json"], { allowNotFound: true });
      return result === null ? null : parseJson(result.stdout);
    });
  }

  /** List resources of a kind. Provide `namespace` or set `allNamespaces`. */
  list({ kind, namespace, allNamespaces = false, labelSelector, fieldSelector }) {
    const spec = kindSpec(kind);
    const args = ["get", spec.resource];
    if (spec.namespaced) args.push(...(allNamespaces ? ["--all-namespaces"] : ["-n", namespace]));
    if (labelSelector) args.push("-l", labelSelector);
    if (fieldSelector) args.push("--field-selector", fieldSelector);
    return this.#memo(
      ["list", kind, namespace, allNamespaces, labelSelector, fieldSelector],
      async () => {
        const result = await this.#kubectl([...args, "-o", "json"]);
        return parseJson(result.stdout).items ?? [];
      },
    );
  }

  #memo(key, load) {
    const id = JSON.stringify(key);
    if (!this.#cache.has(id)) this.#cache.set(id, load());
    return this.#cache.get(id);
  }

  async #kubectl(args, { allowNotFound = false } = {}) {
    const result = await this.#runner.run(["kubectl", ...args, REQUEST_TIMEOUT], {
      signal: this.#signal,
      timeoutMs: 15_000,
    });
    if (result.exitCode === 0) return result;
    if (allowNotFound && NOT_FOUND.test(result.stderr)) return null;
    throw new EnvironmentError(
      "Could not read the cluster state. Is the practice cluster running?",
      {
        reason: "unavailable",
        details: { stderr: result.stderr.slice(0, 500) },
      },
    );
  }
}

function kindSpec(kind) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`Unsupported Kubernetes kind "${kind}".`);
  return spec;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new EnvironmentError("The cluster returned an unreadable response.", {
      reason: "bad-response",
      cause,
    });
  }
}
