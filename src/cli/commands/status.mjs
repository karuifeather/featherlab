// `featherlab status` — print runtime status (workstation, cluster).

import { createRuntime } from "../../lib/runtime.mjs";

/**
 * @param {object} _ctx  unused
 */
export function run() {
  createRuntime().status();
}
