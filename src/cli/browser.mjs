// Opens the given URL in the system's default browser, detached from the CLI process.

import { spawn } from "node:child_process";

/**
 * Launch the user's default browser to `url`. Fire-and-forget — errors are silently
 * ignored because a browser-open failure must never crash the server startup.
 *
 * @param {string} url
 */
export function openBrowser(url) {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const flags = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const proc = spawn(command, flags, { detached: true, stdio: "ignore" });
  proc.on("error", () => {});
  proc.unref();
}
