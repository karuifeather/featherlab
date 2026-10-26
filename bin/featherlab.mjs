#!/usr/bin/env node
import { spawn } from "node:child_process";
import { doctor, provision, stop, status, resetExercise } from "../src/lib/runtime.mjs";
import { startServer } from "../src/server.mjs";

const args = process.argv.slice(2);
const cmd = args[0] || "start";
const port = Number(process.env.featherlab_PORT || 4317);

function openBrowser(url) {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const flags = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const proc = spawn(command, flags, { detached: true, stdio: "ignore" });
  proc.on("error", () => {});
  proc.unref();
}

try {
  switch (cmd) {
    case "doctor":
      process.exitCode = doctor() ? 0 : 1;
      break;
    case "status":
      status();
      break;
    case "stop":
      stop();
      break;
    case "reset":
      resetExercise();
      break;
    case "start": {
      if (!Number.isInteger(port) || port < 1024 || port > 65535)
        throw new Error("featherlab_PORT must be a non-privileged TCP port.");
      provision();
      await startServer(port);
      console.log(`\nfeatherlab is running at http://127.0.0.1:${port}`);
      console.log("Press Ctrl+C to stop the UI; the practice cluster persists.\n");
      if (!args.includes("--no-open")) openBrowser(`http://127.0.0.1:${port}`);
      break;
    }
    case "--help":
    case "help":
      console.log("featherlab [start|doctor|status|reset|stop] [--no-open]");
      console.log("Environment: FEATHERLAB_IMAGE, featherlab_PORT");
      break;
    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
} catch (error) {
  console.error(`\nfeatherlab: ${error.message}`);
  process.exitCode = 1;
}
