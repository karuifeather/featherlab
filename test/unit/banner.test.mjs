import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BANNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docker/banner.sh");

const bash = (script) => spawnSync("bash", ["-c", script, "bash", BANNER], { encoding: "utf8" });

// Scripts, `bash -c` and CI must never see the banner: only interactive login shells do.
test("the welcome banner prints nothing in a non-interactive shell", () => {
  const out = bash('. "$1"');
  assert.equal(out.status, 0);
  assert.equal(out.stdout, "");
});

test("the welcome banner leaves nothing behind in the shell", () => {
  const out = bash('. "$1"; declare -F __fl_banner');
  assert.notEqual(out.status, 0);
  assert.equal(out.stdout, "");
});
