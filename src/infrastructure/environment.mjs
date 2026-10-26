import os from "node:os";
import path from "node:path";
import pkg from "../../package.json" with { type: "json" };

/**
 * Names of the Docker/kind resources that make up one practice environment.
 *
 * The defaults describe the learner's real environment. Anything that must not touch it
 * (the integration and browser test harnesses) passes an explicit configuration instead of
 * relying on globals, so a test can never target these names by accident.
 */
export const DEFAULT_CLUSTER = "featherlab";
export const DEFAULT_WORKSTATION = "featherlab-workstation";
export const DEFAULT_STATE_DIR = path.join(os.homedir(), ".featherlab");
export const DEFAULT_IMAGE =
  process.env.FEATHERLAB_IMAGE || `ghcr.io/karuifeather/featherlab-workstation:${pkg.version}`;

/**
 * @typedef {Object} EnvironmentConfig
 * @property {string} cluster       kind cluster name
 * @property {string} workstation   learner workstation container name
 * @property {string} stateDir      holds the kubeconfigs mounted into the workstation
 * @property {string} image         workstation image
 * @property {Record<string,string>} labels  extra Docker labels for created containers
 */
export function resolveEnvironment(overrides = {}) {
  return Object.freeze({
    cluster: DEFAULT_CLUSTER,
    workstation: DEFAULT_WORKSTATION,
    stateDir: DEFAULT_STATE_DIR,
    image: DEFAULT_IMAGE,
    labels: {},
    ...overrides,
  });
}
