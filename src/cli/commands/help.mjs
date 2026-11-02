// `featherlab help` / `--help` / `-h` — print usage text and exit 0.

/**
 * @param {object} _ctx  unused
 */
export function run() {
  console.log(
    "featherlab [start|doctor|status|exercises|reset [id]|validate-content [dir]|stop|update] [--no-open]\n" +
      "featherlab --version\n\n" +
      "Commands:\n" +
      "  start              Start workstation and browser UI (default)\n" +
      "  stop               Gracefully stop a running featherlab or stop resources directly\n" +
      "  update             Remove stale files and upgrade to the latest version\n" +
      "  doctor             Check Docker and kind prerequisites\n" +
      "  status             Show runtime status\n" +
      "  exercises          List available exercises\n" +
      "  reset [id] [--yes] Reset an exercise to its initial state (default: k8s-0001);\n" +
      "                     --yes also resets another exercise that holds the environment\n" +
      "  validate-content   Validate exercise definitions offline (no Docker needed)\n\n" +
      "Environment: FEATHERLAB_IMAGE, FEATHERLAB_PORT, FEATHERLAB_STATE_DIR",
  );
}
