// `featherlab --version` / `-V` — print the package version and exit 0.

/**
 * @param {{ version: string }} ctx
 */
export function run({ version }) {
  console.log(version);
}
