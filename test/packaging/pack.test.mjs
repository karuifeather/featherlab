import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPackedFiles, contentFiles } from "../../scripts/check-package.mjs";
import { CURRICULUM_ORDER } from "../helpers/curriculum.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Packs the project exactly as `npm publish` would, unpacks it somewhere unrelated to the
 * repository, and loads the exercises from there with a different working directory. This
 * proves exercise assets ship in the tarball and resolve from the install location rather
 * than from the developer's checkout or cwd.
 */
test("exercises ship in the npm tarball and load from an installed location", () => {
  const work = mkdtempSync(path.join(os.tmpdir(), "featherlab-pack-"));
  const packed = JSON.parse(
    execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", work], {
      cwd: repo,
      encoding: "utf8",
    }),
  )[0];

  const files = packed.files.map((f) => f.path);
  const content = contentFiles();
  assert.ok(content.length >= 40, "every Level 0 exercise file is enumerated");
  for (const expected of [...content, "src/app.mjs", "src/tracks/kubernetes/quantity.mjs"])
    assert.ok(files.includes(expected), `tarball is missing ${expected}`);
  assert.ok(!files.some((f) => f.startsWith("test/")), "tests must not be published");

  const install = path.join(work, "install");
  execFileSync("mkdir", [install]);
  execFileSync("tar", ["-xzf", path.join(work, packed.filename), "-C", install]);
  const pkg = path.join(install, "package");
  // The tarball carries no node_modules; reuse the repo's for runtime dependencies only.
  symlinkSync(path.join(repo, "node_modules"), path.join(pkg, "node_modules"));

  const elsewhere = mkdtempSync(path.join(os.tmpdir(), "featherlab-cwd-"));
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { createApp } from ${JSON.stringify(path.join(pkg, "src/app.mjs"))};
       const { registry } = createApp({ runner: { run: async () => { throw new Error("unused"); } } });
       console.log(JSON.stringify(registry.list().map((e) => e.id)));`,
    ],
    { cwd: elsewhere, encoding: "utf8" },
  );
  assert.deepEqual(JSON.parse(output), CURRICULUM_ORDER);
  assert.ok(readdirSync(pkg).includes("exercises"));

  // The installed CLI works from an unrelated directory, offline, without Docker or kind.
  const cli = (...args) =>
    spawnSync(process.execPath, [path.join(pkg, "bin/featherlab.mjs"), ...args], {
      cwd: elsewhere,
      encoding: "utf8",
      env: { ...process.env, PATH: path.dirname(process.execPath), FEATHERLAB_IMAGE: "" },
    });
  const validated = cli("validate-content");
  assert.equal(validated.status, 0, validated.stderr);
  assert.match(validated.stdout, /Validated 34 exercises: OK/);
  const listed = cli("exercises");
  assert.equal(listed.status, 0, listed.stderr);
  // Listed in curriculum order (k8s-0011 is taught before k8s-0002), not id order.
  assert.match(listed.stdout, /k8s-0001[\s\S]*k8s-0011[\s\S]*k8s-0002[\s\S]*k8s-0010/);
  assert.match(cli("help").stdout, /validate-content/);
  assert.equal(cli("no-such-command").status, 1);

  // The workstation image tag is derived from the installed package.json version.
  const image = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { IMAGE } from ${JSON.stringify(path.join(pkg, "src/lib/runtime.mjs"))}; console.log(IMAGE);`,
    ],
    { cwd: elsewhere, encoding: "utf8", env: { ...process.env, FEATHERLAB_IMAGE: "" } },
  ).trim();
  assert.equal(image, `ghcr.io/karuifeather/featherlab-workstation:${packed.version}`);

  // Nothing but runtime files ships (no tests, secrets, notes or editor config).
  const problems = checkPackedFiles(files.filter((f) => !f.startsWith("dist/web/")));
  assert.deepEqual(
    problems.filter((p) => !p.startsWith("missing from tarball: dist/web")),
    [],
  );
});

test("the package gate flags missing, stray and sensitive files", () => {
  const good = [
    "package.json",
    "README.md",
    "LICENSE",
    "bin/featherlab.mjs",
    "src/app.mjs",
    "src/server.mjs",
    "dist/web/index.html",
    ...contentFiles(),
  ];
  assert.deepEqual(checkPackedFiles(good), []);
  assert.match(
    checkPackedFiles(good.filter((f) => f !== "dist/web/index.html")).join(),
    /dist\/web/,
  );
  const manifest = "exercises/kubernetes/level-2/005-why-not-ready/setup/status-page.yaml";
  assert.match(checkPackedFiles(good.filter((f) => f !== manifest)).join(), /status-page\.yaml/);
  for (const extra of [
    ".env",
    "notes/audit.md",
    "test/unit/a.test.mjs",
    "src/x.test.mjs",
    "dist/web/app.js.map",
    ".claude/settings.json",
  ])
    assert.ok(checkPackedFiles([...good, extra]).length > 0, extra);
});
