/**
 * Test reporter: exit 1 on the first test failure.
 *
 * Use alongside a display reporter (spec) via two --test-reporter flags.
 * IsolatedEnvironment's process.once('exit') handler tears down the kind cluster.
 */
// eslint-disable-next-line require-yield
export default async function* bail(source) {
  for await (const event of source) {
    if (event.type === "test:fail") {
      const err = event.data?.details?.error;
      if (err) process.stderr.write(`\n[bail] ${err.message ?? err}\n`);
      process.exitCode = 1;
      process.exit(1);
    }
  }
}
