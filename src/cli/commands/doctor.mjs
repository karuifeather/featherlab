// `featherlab doctor` — check Docker and kind prerequisites.

import { createRuntime } from "../../lib/runtime.mjs";

/**
 * @param {object} _ctx  unused
 */
export function run() {
  process.exitCode = createRuntime().doctor() ? 0 : 1;
}
