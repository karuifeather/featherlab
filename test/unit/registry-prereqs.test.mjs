import test from "node:test";
import assert from "node:assert/strict";
import { ContentError } from "../../src/core/errors.mjs";
import { createApp } from "../../src/app.mjs";
import { appFor, exerciseFiles } from "../helpers/content.mjs";
import { createFakeCluster } from "../helpers/fake-cluster.mjs";

const quiet = { warn() {}, error() {} };

function expectContentError(fn, ...patterns) {
  let caught;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof ContentError, "expected ContentError");
  const text = caught.problems.map((p) => `${p.path ?? ""} ${p.message}`).join("\n");
  for (const pattern of patterns) {
    assert.match(text, pattern, `error message did not match ${pattern}`);
  }
}

// ── Self-dependency ───────────────────────────────────────────────────────────

test("exercise listing itself as a prerequisite is a content error", () => {
  expectContentError(
    () => appFor(exerciseFiles("001-a", { prerequisites: ["demo-0001"] }), createFakeCluster()),
    /cannot list itself/,
  );
});

// ── Duplicate prerequisites ───────────────────────────────────────────────────

test("duplicate prerequisite id within the same exercise is a content error", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", {
      id: "demo-0002",
      prerequisites: ["demo-0001", "demo-0001"],
    }),
  };
  expectContentError(
    () => appFor(files, createFakeCluster()),
    /duplicate prerequisite "demo-0001"/,
  );
});

// ── Unknown prerequisite ──────────────────────────────────────────────────────

test("unknown prerequisite id is a content error (regression)", () => {
  expectContentError(
    () => appFor(exerciseFiles("001-a", { prerequisites: ["ghost-0001"] }), createFakeCluster()),
    /unknown prerequisite "ghost-0001"/,
  );
});

// ── Cycle detection ───────────────────────────────────────────────────────────

test("two-exercise cycle A → B → A is detected", () => {
  const files = {
    ...exerciseFiles("001-a", { prerequisites: ["demo-0002"] }),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
  };
  expectContentError(() => appFor(files, createFakeCluster()), /circular dependency/);
});

test("three-exercise cycle A → B → C → A is detected", () => {
  const files = {
    ...exerciseFiles("001-a", { prerequisites: ["demo-0003"] }),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
    ...exerciseFiles("003-c", { id: "demo-0003", prerequisites: ["demo-0002"] }),
  };
  expectContentError(() => appFor(files, createFakeCluster()), /circular dependency/);
});

test("cycle error message includes the cycle path", () => {
  const files = {
    ...exerciseFiles("001-a", { prerequisites: ["demo-0002"] }),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
  };
  let caught;
  try {
    appFor(files, createFakeCluster());
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof ContentError);
  const messages = caught.problems.map((p) => p.message).join("\n");
  // Should name both exercises in the cycle path.
  assert.match(messages, /demo-0001/);
  assert.match(messages, /demo-0002/);
});

// ── Valid prerequisite chains ─────────────────────────────────────────────────

test("linear chain A → B → C loads without errors", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
    ...exerciseFiles("003-c", { id: "demo-0003", prerequisites: ["demo-0002"] }),
  };
  assert.doesNotThrow(() => appFor(files, createFakeCluster()));
});

test("diamond pattern (shared prerequisite) loads without errors", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
    ...exerciseFiles("003-c", { id: "demo-0003", prerequisites: ["demo-0001"] }),
    ...exerciseFiles("004-d", {
      id: "demo-0004",
      prerequisites: ["demo-0002", "demo-0003"],
    }),
  };
  assert.doesNotThrow(() => appFor(files, createFakeCluster()));
});

test("exercises without prerequisites remain available (no error, empty prereqs)", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002" }),
  };
  const { registry } = appFor(files, createFakeCluster());
  assert.equal(registry.get("demo-0001").prerequisites.length, 0);
  assert.equal(registry.get("demo-0002").prerequisites.length, 0);
});

// ── Packaged exercises ────────────────────────────────────────────────────────

test("packaged exercises (k8s-0002 prerequisites: [k8s-0001]) load without errors", () => {
  assert.doesNotThrow(
    () => createApp({ runner: createFakeCluster(), logger: quiet }),
    "packaged exercises should load cleanly",
  );
});

test("packaged k8s-0002 has k8s-0001 as prerequisite", () => {
  const { registry } = createApp({ runner: createFakeCluster(), logger: quiet });
  assert.deepEqual(registry.get("k8s-0002").prerequisites, ["k8s-0001"]);
});
