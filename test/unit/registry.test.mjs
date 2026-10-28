import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ContentError, NotFoundError } from "../../src/core/errors.mjs";
import { createApp } from "../../src/app.mjs";
import { createFsContentSource } from "../../src/infrastructure/content/fs-loader.mjs";
import { appFor, exerciseFiles, makeContent } from "../helpers/content.mjs";
import { createFakeCluster } from "../helpers/fake-cluster.mjs";
import { CURRICULUM, CURRICULUM_ORDER, FOUNDATIONS_CHALLENGE } from "../helpers/curriculum.mjs";

const quiet = { warn() {}, error() {} };

const packagedRegistry = () => createApp({ runner: createFakeCluster(), logger: quiet }).registry;

test("the packaged exercises load in curriculum order, not id order", () => {
  const registry = packagedRegistry();
  assert.deepEqual(
    registry.list().map((e) => e.id),
    CURRICULUM_ORDER,
  );
  for (const [level, ids] of Object.entries(CURRICULUM))
    assert.deepEqual(
      registry.list({ level: Number(level) }).map((e) => e.id),
      ids,
      `level ${level}`,
    );
});

test("the prerequisite graph is the designed curriculum, not one linear chain", () => {
  const graph = Object.fromEntries(
    packagedRegistry()
      .list()
      .map((e) => [e.id, e.prerequisites]),
  );
  assert.deepEqual(graph, {
    // Level 0: three strands open after the first Pod, then they join.
    "k8s-0001": [],
    "k8s-0011": ["k8s-0001"],
    "k8s-0012": ["k8s-0001"],
    "k8s-0013": ["k8s-0001"],
    "k8s-0014": ["k8s-0011"],
    "k8s-0002": ["k8s-0012"],
    "k8s-0015": ["k8s-0002"],
    "k8s-0016": ["k8s-0014", "k8s-0015"],
    "k8s-0017": ["k8s-0013", "k8s-0016"],
    "k8s-0018": ["k8s-0017"],
    // Level 1: M5.3 deployment lifecycle sequence, chained from the challenge.
    "k8s-0019": ["k8s-0018"],
    "k8s-0020": ["k8s-0019"],
    "k8s-0021": ["k8s-0020"],
    "k8s-0022": ["k8s-0021"],
    "k8s-0023": ["k8s-0022"],
    "k8s-0024": ["k8s-0023"],
    "k8s-0025": ["k8s-0024"],
    "k8s-0026": ["k8s-0025"],
    "k8s-0027": ["k8s-0026"],
    "k8s-0028": ["k8s-0027"],
    "k8s-0029": ["k8s-0028"],
    "k8s-0030": ["k8s-0029"],
    "k8s-0031": ["k8s-0030"],
    "k8s-0032": ["k8s-0031"],
    "k8s-0033": ["k8s-0032"],
    "k8s-0034": ["k8s-0033"],
    // Pre-existing Level 1 labs still gated only behind the challenge.
    "k8s-0003": ["k8s-0018"],
    "k8s-0006": ["k8s-0018"],
    // Level 2: the M5.1 recovery labs.
    "k8s-0004": ["k8s-0018"],
    "k8s-0005": ["k8s-0004"],
    "k8s-0007": ["k8s-0003"],
    "k8s-0008": ["k8s-0004"],
    "k8s-0009": ["k8s-0005", "k8s-0008"],
    "k8s-0010": ["k8s-0003", "k8s-0006", "k8s-0007", "k8s-0009"],
  });
});

/** Every exercise reachable through prerequisites (excluding the start). */
function requiredBy(registry, id, seen = new Set()) {
  for (const prereq of registry.get(id).prerequisites)
    if (!seen.has(prereq)) {
      seen.add(prereq);
      requiredBy(registry, prereq, seen);
    }
  return seen;
}

test("the Foundations Challenge cannot be bypassed and covers all of Level 0", () => {
  const registry = packagedRegistry();
  const levelZero = CURRICULUM[0].filter((id) => id !== FOUNDATIONS_CHALLENGE);
  assert.deepEqual(
    [...requiredBy(registry, FOUNDATIONS_CHALLENGE)].sort(),
    [...levelZero].sort(),
    "the challenge requires every other Level 0 exercise",
  );
  for (const exercise of registry.list().filter((e) => e.level > 0))
    assert.ok(
      requiredBy(registry, exercise.id).has(FOUNDATIONS_CHALLENGE),
      `${exercise.id} requires the Foundations Challenge`,
    );
});

test("each level only builds on itself and earlier levels; difficulty never drops", () => {
  const registry = packagedRegistry();
  const rank = { beginner: 0, intermediate: 1, advanced: 2 };
  for (const exercise of registry.list())
    for (const prereq of exercise.prerequisites)
      assert.ok(registry.get(prereq).level <= exercise.level, `${exercise.id} <- ${prereq}`);
  // Level 1 and 2 are never labelled beginner; Level 0 has nothing advanced.
  for (const exercise of registry.list()) {
    if (exercise.level > 0) assert.ok(rank[exercise.difficulty] >= 1, exercise.id);
    if (exercise.level === 0) assert.ok(rank[exercise.difficulty] <= 1, exercise.id);
  }
});

test("relocated exercises keep their identity: id, namespace and checks", () => {
  const registry = packagedRegistry();
  for (const id of [...CURRICULUM[1], ...CURRICULUM[2]]) {
    const exercise = registry.get(id);
    assert.equal(exercise.lifecycle.namespaces[0], `fl-${id}`);
    assert.ok(exercise.checks.length > 0);
  }
  assert.equal(registry.get("k8s-0010").title, "Workload Recovery Mastery");
});

test("explicit order wins over id order; a duplicate order in a level is rejected", () => {
  const ordered = (id, order) => exerciseFiles(`${id}`, { id, order });
  const { registry } = appFor(
    {
      ...ordered("demo-0001", 2),
      ...ordered("demo-0002", 1),
      ...exerciseFiles("x", { id: "demo-0003" }),
    },
    createFakeCluster(),
  );
  assert.deepEqual(
    registry.list().map((e) => e.id),
    ["demo-0002", "demo-0001", "demo-0003"],
    "ordered first by `order`, then exercises without one by id",
  );
  assert.throws(
    () => appFor({ ...ordered("demo-0001", 1), ...ordered("demo-0002", 1) }, createFakeCluster()),
    /order 1 in level 0 is already used by "demo-0001"/,
  );
});

test("a prerequisite at a higher level is rejected", () => {
  assert.throws(
    () =>
      appFor(
        {
          ...exerciseFiles("a", { id: "demo-0001", level: 1 }),
          ...exerciseFiles("b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
        },
        createFakeCluster(),
      ),
    /prerequisite "demo-0001" is at level 1, above this exercise's level 0/,
  );
});

test("every packaged exercise owns fl-<id> and states its namespace in the first requirement", () => {
  const { registry } = createApp({ runner: createFakeCluster(), logger: quiet });
  for (const exercise of registry.list()) {
    assert.equal(exercise.lifecycle.namespaces[0], `fl-${exercise.id}`);
    assert.match(exercise.requirements[0], new RegExp(`\`fl-${exercise.id}\``), exercise.id);
    assert.equal(exercise.hints.length, 3, `${exercise.id} has three graduated hints`);
    assert.ok(exercise.solution, `${exercise.id} has a private reference solution`);
  }
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
