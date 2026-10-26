import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ContentError, NotFoundError } from "../../src/core/errors.mjs";
import { createApp } from "../../src/app.mjs";
import { createFsContentSource } from "../../src/infrastructure/content/fs-loader.mjs";
import { appFor, exerciseFiles, makeContent } from "../helpers/content.mjs";
import { createFakeCluster } from "../helpers/fake-cluster.mjs";

const quiet = { warn() {}, error() {} };

test("the packaged exercises load without any hardcoded imports", () => {
  const { registry } = createApp({ runner: createFakeCluster(), logger: quiet });
  assert.deepEqual(
    registry.list().map((e) => e.id),
    ["k8s-0001", "k8s-0002"],
  );
});

test("duplicate exercise ids are rejected and both files are named", () => {
  try {
    appFor({ ...exerciseFiles("001-a"), ...exerciseFiles("002-b") }, createFakeCluster());
    assert.fail("expected ContentError");
  } catch (error) {
    assert.ok(error instanceof ContentError);
    const message = error.problems.map((p) => `${p.file} ${p.message}`).join("\n");
    assert.match(message, /duplicate exercise id "demo-0001"/);
    assert.match(message, /001-a/);
    assert.match(message, /002-b/);
  }
});

test("lookup by id, and NotFoundError from require()", () => {
  const { registry } = appFor(exerciseFiles("001-a"), createFakeCluster());
  assert.equal(registry.get("demo-0001").id, "demo-0001");
  assert.equal(registry.get("nope"), undefined);
  assert.throws(() => registry.require("nope"), NotFoundError);
});

test("filtering by track, level, difficulty and tags; stable ordering", () => {
  const files = {
    ...exerciseFiles("010-late", { id: "demo-0010", level: 1, tags: ["x", "y"] }),
    ...exerciseFiles("002-early", {
      id: "demo-0002",
      level: 0,
      tags: ["x"],
      difficulty: "advanced",
    }),
    ...exerciseFiles("001-first", { id: "demo-0001", level: 0, tags: ["y"] }),
  };
  const { registry } = appFor(files, createFakeCluster());
  const ids = (filter) => registry.list(filter).map((e) => e.id);
  assert.deepEqual(ids(), ["demo-0001", "demo-0002", "demo-0010"]);
  assert.deepEqual(ids({ level: 0 }), ["demo-0001", "demo-0002"]);
  assert.deepEqual(ids({ tags: ["x"] }), ["demo-0002", "demo-0010"]);
  assert.deepEqual(ids({ tags: ["x", "y"] }), ["demo-0010"]);
  assert.deepEqual(ids({ difficulty: "advanced" }), ["demo-0002"]);
  assert.deepEqual(ids({ track: "kubernetes", level: 1 }), ["demo-0010"]);
  assert.deepEqual(ids({ track: "postgres" }), []);
});

test("an unknown prerequisite is a content error", () => {
  assert.throws(
    () => appFor(exerciseFiles("001-a", { prerequisites: ["ghost-0001"] }), createFakeCluster()),
    /unknown prerequisite "ghost-0001"/,
  );
});

test("the loader skips symlinks instead of following them", () => {
  const root = makeContent(exerciseFiles("001-a"));
  const outside = makeContent(exerciseFiles("999-evil", { id: "evil-0001" }));
  symlinkSync(path.join(outside, "kubernetes"), path.join(root, "linked"));
  const ids = createFsContentSource({ root })
    .discover()
    .map((e) => e.data.id);
  assert.deepEqual(ids, ["demo-0001"]);
});

test("the reader refuses traversal, absolute paths and symlinked files", () => {
  const root = makeContent(exerciseFiles("001-a"));
  const dir = path.join(root, "kubernetes/level-0/001-a");
  writeFileSync(path.join(root, "outside.txt"), "outside");
  symlinkSync(path.join(root, "outside.txt"), path.join(dir, "link.md"));
  mkdirSync(path.join(dir, "sub"));
  const { reader } = createFsContentSource({ root }).discover()[0];
  assert.equal(reader.readText("description.md"), "Demo description.");
  for (const bad of [
    "../../../outside.txt",
    "/etc/passwd",
    "sub/../../x",
    "link.md",
    "sub",
    "..",
    "",
  ])
    assert.throws(() => reader.readText(bad), undefined, `should reject ${JSON.stringify(bad)}`);
});

test("a missing content directory fails loudly", () => {
  assert.throws(
    () => createFsContentSource({ root: "/nonexistent/featherlab" }).discover(),
    /not found/,
  );
});
