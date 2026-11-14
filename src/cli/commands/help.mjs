// `featherlab help` / `--help` / `-h` — print usage text and exit 0.

/**
 * @param {object} _ctx  unused
 */
export function run() {
  console.log(
    "featherlab [start|doctor|status|exercises|reset [id]|validate-content [dir]|stop|update] [--no-open]\n" +
      "featherlab --version\n\n" +
      "Commands:\n" +
      "  start                 Start workstation and browser UI (default)\n" +
      "  stop                  Gracefully stop a running featherlab or stop resources directly\n" +
      "  update                Upgrade to the latest version and upgrade the workstation image\n" +
      "  upgrade-workstation   Upgrade the workstation container to the current image,\n" +
      "                        preserving all files in /home/learner\n" +
      "  doctor                Check Docker and kind prerequisites\n" +
      "  status                Show runtime status\n" +
      "  exercises             List available exercises\n" +
      "  reset [id] [--yes]    Reset an exercise to its initial state (default: k8s-0001);\n" +
      "                        --yes also resets another exercise that holds the environment\n" +
      "  validate-content      Validate exercise definitions offline (no Docker needed)\n\n" +
      "Environment: FEATHERLAB_IMAGE, FEATHERLAB_PORT, FEATHERLAB_STATE_DIR",
  );
}
