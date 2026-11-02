/**
 * Test reporter: exit 1 on the first test failure.
 *
 * Use alongside a display reporter (spec) via two --test-reporter flags.
 * IsolatedEnvironment's process.once('exit') handler tears down the kind cluster.
 */
export default async function* bail(source) {
  // eslint-disable-line require-yield
  for await (const event of source) {
    if (event.type === "test:fail") {
      process.exitCode = 1;
      process.exit(1);
    }
  }
}
