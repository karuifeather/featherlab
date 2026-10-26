import test from "node:test";
import assert from "node:assert/strict";
import { ContentError } from "../../src/core/errors.mjs";
import { appFor, exerciseFiles } from "../helpers/content.mjs";
import { createFakeCluster } from "../helpers/fake-cluster.mjs";

const build = (files) => appFor(files, createFakeCluster());

function problemsFor(files) {
  try {
    build(files);
  } catch (error) {
    assert.ok(error instanceof ContentError, `expected ContentError, got ${error}`);
    return error.problems;
  }
  assert.fail("expected the content to be rejected");
}

const has = (problems, path, text) =>
  problems.some((p) => p.path === path && p.message.includes(text));

test("a valid definition loads and is normalized", () => {
  const { registry } = build(exerciseFiles("001-demo", { tags: ["a-tag"], hints: ["Try this"] }));
  const exercise = registry.get("demo-0001");
  assert.equal(exercise.title, "Demo");
  assert.equal(exercise.description, "Demo description.");
  assert.deepEqual(exercise.tags, ["a-tag"]);
  assert.equal(exercise.checks[0].weight, 1);
  assert.equal(Object.isFrozen(exercise), true);
});

test("errors name the file and the invalid property", () => {
  const problems = problemsFor(exerciseFiles("001-demo", { title: "", level: "zero" }));
  assert.ok(problems.every((p) => p.file === "kubernetes/level-0/001-demo/exercise.yaml"));
  assert.ok(has(problems, "title", "at least 1"));
  assert.ok(has(problems, "level", "must be an integer"));
});

test("unknown properties are rejected, not ignored", () => {
  const problems = problemsFor(exerciseFiles("001-demo", { colour: "red" }));
  assert.ok(has(problems, "colour", "unknown property"));
});

test("an unsupported schemaVersion is rejected", () => {
  const problems = problemsFor(exerciseFiles("001-demo", { schemaVersion: 2 }));
  assert.ok(has(problems, "schemaVersion", "must be one of 1"));
});

test("ids are constrained", () => {
  for (const id of ["Has Space", "../etc", "UPPER", "a".repeat(64)]) {
    const problems = problemsFor(exerciseFiles("001-demo", { id }));
    assert.ok(
      problems.some((p) => p.path === "id"),
      `id ${JSON.stringify(id)} should be rejected`,
    );
  }
});

test("unknown track and unknown profile are reported", () => {
  assert.ok(
    has(problemsFor(exerciseFiles("001-demo", { track: "postgres" })), "track", "unknown track"),
  );
  assert.ok(
    has(
      problemsFor(exerciseFiles("001-demo", { environment: { profile: "multi-node" } })),
      "environment.profile",
      "does not provide profile",
    ),
  );
});

test("unknown validators and bad params are reported with their location", () => {
  const checks = [
    { id: "a", type: "k8s.nope", label: "x" },
    {
      id: "b",
      type: "k8s.pod-ready",
      label: "x",
      params: { name: "BAD NAME", namespace: "default" },
    },
    {
      id: "c",
      type: "k8s.replicas-desired",
      label: "x",
      params: { kind: "Pod", name: "x", namespace: "d", replicas: 1 },
    },
  ];
  const problems = problemsFor(exerciseFiles("001-demo", { checks }));
  assert.ok(has(problems, "checks[0].type", 'unknown validator "k8s.nope"'));
  assert.ok(has(problems, "checks[1].params.name", "must match"));
  assert.ok(has(problems, "checks[2].params.kind", "must be one of"));
});

test("a required namespace is enforced for namespaced kinds only", () => {
  const checks = [
    { id: "a", type: "k8s.resource-exists", label: "x", params: { kind: "Pod", name: "p" } },
    {
      id: "b",
      type: "k8s.resource-exists",
      label: "x",
      params: { kind: "Namespace", name: "n", namespace: "x" },
    },
  ];
  const problems = problemsFor(exerciseFiles("001-demo", { checks }));
  assert.ok(has(problems, "checks[0].params.namespace", "required"));
  assert.ok(has(problems, "checks[1].params.namespace", "cluster-scoped"));
});

test("duplicate check ids are rejected", () => {
  const check = {
    id: "same",
    type: "k8s.resource-exists",
    label: "x",
    params: { kind: "Pod", name: "p", namespace: "default" },
  };
  const problems = problemsFor(exerciseFiles("001-demo", { checks: [check, check] }));
  assert.ok(has(problems, "checks[1].id", "duplicate check id"));
});

test("combinators validate their nested checks", () => {
  const checks = [
    {
      id: "either",
      type: "any-of",
      label: "x",
      params: { checks: [{ type: "k8s.pod-ready", params: { name: "x" } }] },
    },
  ];
  const problems = problemsFor(exerciseFiles("001-demo", { checks }));
  assert.ok(has(problems, "checks[0].params.checks[0].params.namespace", "required"));
});

test("a missing description file is reported", () => {
  const files = exerciseFiles("001-demo");
  delete files["kubernetes/level-0/001-demo/description.md"];
  assert.ok(has(problemsFor(files), "content.description", "does not exist"));
});

test("content paths cannot traverse out of the exercise directory", () => {
  for (const description of ["../description.md", "/etc/passwd", "a/../../b.md"]) {
    const problems = problemsFor(exerciseFiles("001-demo", { content: { description } }));
    assert.ok(has(problems, "content.description", "relative path"), description);
  }
});

test("malformed YAML is reported with its file", () => {
  const problems = problemsFor({
    "kubernetes/level-0/001-demo/exercise.yaml": "id: [unterminated",
    "kubernetes/level-0/001-demo/description.md": "x",
  });
  assert.equal(problems[0].file, "kubernetes/level-0/001-demo/exercise.yaml");
  assert.match(problems[0].message, /invalid YAML/);
});

test("every problem across every exercise is reported together", () => {
  const files = {
    ...exerciseFiles("001-a", { id: "demo-0001", title: "" }),
    ...exerciseFiles("002-b", { id: "demo-0002", level: -1 }),
  };
  const problems = problemsFor(files);
  assert.ok(problems.some((p) => p.file.includes("001-a")));
  assert.ok(problems.some((p) => p.file.includes("002-b")));
});
