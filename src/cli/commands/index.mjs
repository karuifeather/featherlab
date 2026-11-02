// Command registry — maps every CLI command name (and alias) to its run function.
// To add a new command: import its module and add one entry here; dispatch in bin/ is untouched.

import { run as runVersion } from "./version.mjs";
import { run as runHelp } from "./help.mjs";
import { run as runDoctor } from "./doctor.mjs";
import { run as runStatus } from "./status.mjs";
import { run as runExercises } from "./exercises.mjs";
import { run as runValidateContent } from "./validate-content.mjs";
import { run as runReset } from "./reset.mjs";
import { run as runStop } from "./stop.mjs";
import { run as runUpdate } from "./update.mjs";
import { run as runStart } from "./start.mjs";

/**
 * Commands that must NOT show the cached update notice after they run.
 * `start` warms the cache itself; the others are meta-commands where the notice is noise.
 */
export const NO_UPDATE_NOTICE = new Set([
  "start",
  "update",
  "--version",
  "-V",
  "--help",
  "-h",
  "help",
]);

/**
 * Map of command name → async run(ctx) function.
 * Short-running commands export a synchronous `run`; the registry wraps all as async-compatible.
 *
 * @type {Map<string, (ctx: object) => void | Promise<void>>}
 */
export const COMMANDS = new Map([
  ["--version", runVersion],
  ["-V", runVersion],
  ["--help", runHelp],
  ["-h", runHelp],
  ["help", runHelp],
  ["doctor", runDoctor],
  ["status", runStatus],
  ["exercises", runExercises],
  ["validate-content", runValidateContent],
  ["reset", runReset],
  ["stop", runStop],
  ["update", runUpdate],
  ["start", runStart],
]);
