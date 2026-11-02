#!/usr/bin/env node
// Entry point — parse argv, dispatch to a command, print any queued update notice.
// All business logic lives in src/cli/commands/; this file must stay at bin/featherlab.mjs
// because isFeatherLabProcess() matches argv elements ending with that exact path.

import { resolveEnvironment } from "../src/infrastructure/environment.mjs";
import { readCachedUpdateInfo } from "../src/lib/update-check.mjs";
import { printError, printUpdateNotice } from "../src/cli/output.mjs";
import { COMMANDS, NO_UPDATE_NOTICE } from "../src/cli/commands/index.mjs";
import pkg from "../package.json" with { type: "json" };

const { version } = pkg;
const args = process.argv.slice(2);
const noOpen = args.includes("--no-open");
const cmdArgs = args.filter((a) => a !== "--no-open");
const cmd = cmdArgs[0] || "start";
const port = Number(process.env.FEATHERLAB_PORT || 4317);
const stateDir = resolveEnvironment().stateDir;

// Passive update notice: read the cache synchronously — zero I/O overhead, never delays exit.
// Short-lived commands never make network requests; they only read a cache warmed by `start`.
// `featherlab update` always force-fetches and awaits explicitly.
const cachedUpdateInfo = NO_UPDATE_NOTICE.has(cmd) ? null : readCachedUpdateInfo(stateDir, version);

/** Shared context passed to every command. */
const ctx = { version, stateDir, port, noOpen, cmdArgs };

try {
  const runCmd = COMMANDS.get(cmd);
  if (!runCmd) throw new Error(`Unknown command: ${cmd}`);
  await runCmd(ctx);
} catch (error) {
  const hint = error.code === "EADDRINUSE" ? "Try: FEATHERLAB_PORT=<other-port> featherlab" : "";
  printError(error.message, { hint });
  process.exitCode = 1;
}

if (cachedUpdateInfo?.isOutdated)
  printUpdateNotice(cachedUpdateInfo.current, cachedUpdateInfo.latest);
