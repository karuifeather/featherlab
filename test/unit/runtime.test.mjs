import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { IMAGE } from "../../src/lib/runtime.mjs";

const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../package.json");
const { version } = JSON.parse(readFileSync(pkgPath, "utf8"));

test("IMAGE default derives from package.json version", () => {
  if (!process.env.FEATHERLAB_IMAGE) {
    assert.ok(
      IMAGE.endsWith(`:${version}`),
      `Expected IMAGE to end with ":${version}", got: "${IMAGE}"`,
    );
  }
});

test("FEATHERLAB_IMAGE env var override is respected when set", () => {
  if (process.env.FEATHERLAB_IMAGE) {
    assert.equal(IMAGE, process.env.FEATHERLAB_IMAGE);
  }
});
