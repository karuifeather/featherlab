// `featherlab reset [id] [--yes]` — reset an exercise to its initial state.
// Routes through the running server when one is alive (single mutator); falls back to
// a local app instance when no server is running.

import { createApp } from "../../app.mjs";
import { resolveEnvironment } from "../../infrastructure/environment.mjs";
import { resetExercise } from "../reset.mjs";
import { isFeatherLabProcess } from "../process-identity.mjs";
import { printError, printInfo } from "../output.mjs";

/**
 * @param {{ cmdArgs: string[], stateDir: string }} ctx
 */
export async function run({ cmdArgs, stateDir }) {
  const id = cmdArgs[1] && !cmdArgs[1].startsWith("-") ? cmdArgs[1] : "k8s-0001";
  try {
    const { steps } = await resetExercise({
      id,
      discardActive: cmdArgs.includes("--yes") || cmdArgs.includes("-y"),
      stateDir,
      isAlive: isFeatherLabProcess,
      createLocalApp: () => {
        const { cluster, workstation } = resolveEnvironment();
        return createApp({ stateDir, workstation, cluster });
      },
    });
    console.log(`Exercise ${id} reset (${steps.length} step${steps.length === 1 ? "" : "s"}).`);
  } catch (error) {
    if (error.code !== "ENVIRONMENT_IN_USE") throw error;
    printError(error.message);
    printInfo(`Re-run with --yes to reset it anyway: featherlab reset ${id} --yes`);
    process.exitCode = 1;
  }
}
