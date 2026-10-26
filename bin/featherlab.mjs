#!/usr/bin/env node
import { spawn } from "node:child_process";
import { doctor, provision, stop, status } from "../src/lib/runtime.mjs";
import { createApp, validateContent } from "../src/app.mjs";
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
    case "reset": {
      // `featherlab reset [exercise-id]`; defaults to the original first exercise.
      const id = args[1] && !args[1].startsWith("-") ? args[1] : "k8s-0001";
      const { steps } = await createApp().service.reset(id);
      console.log(`Exercise ${id} reset (${steps.length} step${steps.length === 1 ? "" : "s"}).`);
      break;
    }
    case "exercises":
      for (const e of createApp().service.list())
        console.log(`${e.id}  L${e.level}  ${e.difficulty.padEnd(12)} ${e.title}`);
      break;
    case "validate-content": {
      // Offline: needs no Docker, kind or workstation. Optional argument: a content directory.
      const dir = args[1] && !args[1].startsWith("-") ? args[1] : undefined;
      const result = validateContent({ contentRoot: dir });
      if (!result.ok) {
        console.error("Invalid exercise content:");
        for (const p of result.problems)
          console.error(`  - ${p.file}${p.path ? ` [${p.path}]` : ""}: ${p.message}`);
        process.exitCode = 1;
      } else {
        console.log(`Validated ${result.count} exercise${result.count === 1 ? "" : "s"}: OK`);
      }
      break;
    }
    case "start": {
      if (!Number.isInteger(port) || port < 1024 || port > 65535)
        throw new Error("featherlab_PORT must be a non-privileged TCP port.");
      // Build the app first: invalid exercise content must fail before any Docker/kind work.
      const { service } = createApp();
      provision();
      await startServer(port, { service });
      console.log(`\nfeatherlab is running at http://127.0.0.1:${port}`);
      console.log("Press Ctrl+C to stop the UI; the practice cluster persists.\n");
      if (!args.includes("--no-open")) openBrowser(`http://127.0.0.1:${port}`);
      break;
    }
    case "--help":
    case "help":
      console.log(
        "featherlab [start|doctor|status|exercises|reset [id]|validate-content [dir]|stop] [--no-open]",
      );
      console.log("Environment: FEATHERLAB_IMAGE, featherlab_PORT");
      break;
    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
} catch (error) {
  console.error(`\nfeatherlab: ${error.message}`);
  process.exitCode = 1;
}
