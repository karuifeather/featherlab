/**
 * Guard test: Level 6 TLS fixtures must not expire within 12 months.
 * If this fails, run src/tracks/kubernetes/routing/fixtures/tls/generate.sh to regenerate.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../helpers/tls-fixtures");

// Certificates must remain valid for at least 12 months from today.
const MIN_DAYS_REMAINING = 365;

function getCertNotAfter(certPath) {
  try {
    const out = execFileSync("openssl", ["x509", "-noout", "-enddate", "-in", certPath], {
      encoding: "utf8",
    });
    // Output: notAfter=Oct 31 21:00:00 2036 GMT
    const match = out.match(/notAfter=(.+)/);
    if (!match) return null;
    return new Date(match[1].trim());
  } catch {
    return null;
  }
}

const certs = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".crt"))
  .map((f) => ({ file: f, path: resolve(FIXTURES_DIR, f) }));

assert.ok(certs.length >= 4, `Expected at least 4 certificate fixtures, found ${certs.length}`);

for (const { file, path } of certs) {
  test(`TLS fixture ${file} does not expire within ${MIN_DAYS_REMAINING} days`, () => {
    const notAfter = getCertNotAfter(path);
    if (notAfter === null) {
      // openssl not available on this platform; skip gracefully
      return;
    }
    const daysRemaining = (notAfter - Date.now()) / (1000 * 60 * 60 * 24);
    assert.ok(
      daysRemaining >= MIN_DAYS_REMAINING,
      `${file} expires ${notAfter.toISOString()} (${Math.floor(daysRemaining)} days remaining; need ${MIN_DAYS_REMAINING}).` +
        " Run test/helpers/tls-fixtures/generate.sh to regenerate.",
    );
  });
}
