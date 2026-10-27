import path from "node:path";
import { stopClusterNodes, waitForClusterReady } from "../infrastructure/docker/kind-nodes.mjs";

/**
 * Lifecycle states:
 *   stopped  — nothing is running (initial state)
 *   starting — startup sequence is in progress
 *   running  — fully operational
 *   stopping — shutdown sequence is in progress
 *   failed   — startup failed and cleanup is complete
 */

const silent = { log() {}, warn() {}, error() {} };

/**
 * Orchestrates FeatherLab startup and graceful shutdown.
 *
 * One instance per process invocation. Signal handlers call requestShutdown(),
 * which is safe to call multiple times (idempotent) — concurrent calls wait for the
 * single in-flight shutdown to complete rather than starting a second one.
 *
 * The coordinator does not own infrastructure directly. It delegates to the injected
 * runtime and server handle. Dependencies are injected for testability.
 */
export class LifecycleCoordinator {
  #state = "stopped";
  #runtime;
  #log;
  #onShutdownComplete;
  #serverHandle = null;
  // The single in-flight shutdown promise. Concurrent requestShutdown() calls share it.
  #shutdownPromise = null;

  /**
   * @param {{
   *   runtime: {
   *     provision(): void,
   *     stop(): void,
   *     config: { stateDir: string, cluster: string, workstation: string }
   *   },
   *   log?: { log: Function, warn: Function, error: Function },
   *   onShutdownComplete?: () => void
   * }} options
   */
  constructor({ runtime, log = silent, onShutdownComplete } = {}) {
    this.#runtime = runtime;
    this.#log = log;
    this.#onShutdownComplete = onShutdownComplete;
  }

  get state() {
    return this.#state;
  }

  /**
   * Run the full startup sequence.
   *
   * 1. Validate no conflicting state.
   * 2. Transition to 'starting'.
   * 3. runtime.provision() — creates/resumes cluster and workstation.
   * 4. Wait for Kubernetes API readiness.
   * 5. Start HTTP server via serverFactory.
   * 6. Transition to 'running'.
   * 7. Return { port }.
   *
   * On failure, attempts cleanup of partially initialized resources, then transitions
   * to 'failed'.
   *
   * @param {{ serverFactory: (port: number) => Promise<{port: number, close: Function, closeSessions: Function}>, port?: number }} options
   * @returns {Promise<{port: number}>}
   */
  async start({ serverFactory, port = 0 }) {
    if (this.#state !== "stopped") {
      throw new Error(`Cannot start in state "${this.#state}".`);
    }
    this.#state = "starting";

    let serverHandle = null;
    try {
      this.#log.log("Provisioning FeatherLab environment...");
      this.#runtime.provision();

      // The host kubeconfig is written to stateDir during provision().
      const kubeconfigPath = path.join(this.#runtime.config.stateDir, "host-kubeconfig");
      this.#log.log("Waiting for Kubernetes API server...");
      await waitForClusterReady(kubeconfigPath, { log: this.#log });

      this.#log.log("Starting HTTP server...");
      serverHandle = await serverFactory(port);
      this.#serverHandle = serverHandle;

      this.#state = "running";
      return { port: serverHandle.port };
    } catch (error) {
      // Best-effort cleanup of whatever did start.
      if (serverHandle) {
        try {
          await serverHandle.close();
        } catch (e) {
          this.#log.error(`Could not close server during startup failure: ${e.message}`);
        }
      }
      this.#state = "failed";
      throw error;
    }
  }

  /**
   * Register the handle returned by startServer() so requestShutdown() can close it.
   * Call this after start() returns when you need to set the handle separately.
   *
   * @param {{ close: Function, closeSessions: Function }} handle
   */
  setServerHandle(handle) {
    this.#serverHandle = handle;
  }

  /**
   * Request graceful shutdown. Idempotent — safe to call from multiple SIGINT deliveries.
   * The second and subsequent calls return the same Promise as the first.
   *
   * Shutdown sequence:
   *   1. Transition to 'stopping'.
   *   2. Close active WebSocket sessions and HTTP server.
   *   3. runtime.stop() — stop workstation container.
   *   4. stopClusterNodes() — stop kind node containers.
   *   5. Transition to 'stopped'.
   *   6. Invoke onShutdownComplete() if provided.
   *
   * Each step is attempted even if earlier steps fail. Errors are logged with
   * recovery hints, not thrown.
   *
   * @returns {Promise<void>}
   */
  async requestShutdown() {
    // Idempotency: if shutdown is already running, return the same Promise.
    if (this.#shutdownPromise) return this.#shutdownPromise;
    // Nothing to shut down: already stopped, or startup failed before any resources were acquired.
    if (this.#state === "stopped" || this.#state === "failed") return 0;

    this.#shutdownPromise = this.#runShutdown();
    return this.#shutdownPromise;
  }

  async #runShutdown() {
    this.#state = "stopping";
    let errorCount = 0;
    const { workstation, cluster } = this.#runtime.config ?? {};

    // Step 1: Close WebSocket sessions.
    if (this.#serverHandle?.closeSessions) {
      this.#log.log("Closing terminal sessions...");
      try {
        await this.#serverHandle.closeSessions();
        this.#log.log("Terminal sessions closed.");
      } catch (error) {
        this.#log.error(`Could not close terminal sessions: ${error.message}`);
        errorCount++;
      }
    }

    // Step 2: Close HTTP server.
    if (this.#serverHandle?.close) {
      this.#log.log("Stopping HTTP server...");
      try {
        await this.#serverHandle.close();
        this.#log.log("HTTP server stopped.");
      } catch (error) {
        this.#log.error(`Could not stop HTTP server: ${error.message}`);
        errorCount++;
      }
    }

    // Step 3: Stop workstation container.
    this.#log.log("Stopping workstation...");
    try {
      this.#runtime.stop();
      this.#log.log("Workstation stopped. Learner filesystem preserved.");
    } catch (error) {
      this.#log.error(
        `Could not stop workstation: ${error.message}\n` +
          `  To stop it manually: docker stop ${workstation ?? "featherlab-workstation"}`,
      );
      errorCount++;
    }

    // Step 4: Stop kind cluster nodes.
    this.#log.log("Stopping cluster nodes...");
    try {
      const result = await stopClusterNodes(cluster, { log: this.#log });
      if (result.stopped.length > 0) {
        this.#log.log(
          `Cluster nodes stopped (${result.stopped.length}). Kubernetes resources preserved.`,
        );
      }
      if (result.errors.length > 0) {
        for (const { node, error } of result.errors) {
          this.#log.error(
            `Could not stop cluster node "${node}": ${error.message}\n` +
              `  To stop it manually: docker stop ${node}`,
          );
          errorCount++;
        }
      }
    } catch (error) {
      this.#log.error(
        `Could not stop cluster nodes: ${error.message}\n` +
          `  To stop them manually: docker ps --filter label=io.x-k8s.kind.cluster=${cluster}`,
      );
      errorCount++;
    }

    this.#state = "stopped";
    this.#log.log("FeatherLab stopped.");

    try {
      this.#onShutdownComplete?.();
    } catch {
      // Ignore errors from the completion callback.
    }

    return errorCount;
  }
}
