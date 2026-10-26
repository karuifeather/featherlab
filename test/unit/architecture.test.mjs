import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");

/**
 * Dependency rules (see docs/architecture.md):
 *
 *   api -> application -> core <- tracks        infrastructure implements core contracts
 *
 * `infrastructure/environment.mjs` is plain configuration (resource names) and may be read
 * by any layer. The composition roots (app.mjs, server.mjs, lib/) may import anything.
 */
const ALLOWED = {
  core: ["core"],
  tracks: ["core", "tracks"],
  application: ["core", "application"],
  infrastructure: ["core", "infrastructure"],
  api: ["application", "core/errors.mjs", "api"],
};
const SHARED = ["infrastructure/environment.mjs"];

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (entry.name.endsWith(".mjs")) yield full;
  }
}

function importsOf(file) {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

test("layers only depend on the layers they are allowed to", () => {
  const violations = [];
  for (const file of files(src)) {
    const rel = path.relative(src, file).split(path.sep).join("/");
    const layer = rel.split("/")[0];
    if (!(layer in ALLOWED)) continue;
    for (const spec of importsOf(file)) {
      if (!spec.startsWith(".")) continue;
      const target = path
        .relative(src, path.resolve(path.dirname(file), spec))
        .split(path.sep)
        .join("/");
      if (target === "../package.json") continue; // version for the default image tag
      if (target.startsWith("..")) {
        violations.push(`${rel} imports outside src: ${spec}`);
        continue;
      }
      if (SHARED.includes(target)) continue;
      const ok = ALLOWED[layer].some(
        (allowed) => target === allowed || target.startsWith(`${allowed}/`),
      );
      if (!ok) violations.push(`${rel} (${layer}) must not import ${target}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("the core never learns about Kubernetes, Docker, HTTP or the filesystem", () => {
  const forbidden = /kubectl|kubernetes|docker|node:http|node:fs|node:child_process|\bk8s\./i;
  const offenders = [];
  for (const file of files(path.join(src, "core"))) {
    const code = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    if (forbidden.test(code)) offenders.push(path.relative(src, file));
  }
  assert.deepEqual(offenders, []);
});

test("only the composition root wires concrete tracks and runners together", () => {
  const wiring = [];
  for (const file of files(src)) {
    const rel = path.relative(src, file).split(path.sep).join("/");
    if (importsOf(file).some((s) => /tracks\/kubernetes\/index\.mjs$/.test(s))) wiring.push(rel);
  }
  assert.deepEqual(wiring, ["app.mjs"]);
});
