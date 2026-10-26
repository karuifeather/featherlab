import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateContent } from "../../src/app.mjs";
import { exerciseFiles, makeContent } from "../helpers/content.mjs";

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../bin/featherlab.mjs");

const validate = (files) => validateContent({ contentRoot: makeContent(files) });
const messages = (result) => result.problems.map((p) => `${p.file} [${p.path ?? ""}] ${p.message}`);
const FILE = "kubernetes/level-0/demo/exercise.yaml";

/** Assert that exactly this defect is reported for this file and property. */
function assertProblem(result, pathPart, messagePart) {
  assert.equal(result.ok, false, "content should be rejected");
  assert.ok(
    result.problems.some(
      (p) =>
        p.file === FILE &&
        (p.path ?? "").includes(pathPart) &&
        new RegExp(messagePart, "i").test(p.message),
    ),
    `expected ${FILE} [${pathPart}] ~ /${messagePart}/ in:\n${messages(result).join("\n")}`,
  );
}

test("the packaged exercises are valid", () => {
  const result = validateContent();
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
});

test("valid content passes", () => {
  const result = validate(exerciseFiles("demo"));
  assert.deepEqual(result, { ok: true, count: 1, problems: [] });
});

const invalid = [
  ["invalid YAML syntax", { file: "a: [unclosed" }, "", "invalid YAML"],
  ["unsupported schemaVersion", { o: { schemaVersion: 2 } }, "schemaVersion", "must be one of"],
  ["a missing mandatory field", { o: { title: undefined } }, "title", "is required"],
  ["an unsupported exercise type", { o: { type: "quiz" } }, "type", "must be one of"],
  ["an invalid exercise id", { o: { id: "Bad_ID" } }, "id", ""],
  ["a path-traversal id", { o: { id: "../../etc/passwd" } }, "id", ""],
  ["an unknown track", { o: { track: "oracle" } }, "track", "unknown track"],
  [
    "an invalid environment profile",
    { o: { environment: { profile: "gpu-farm" } } },
    "environment.profile",
    "does not provide profile",
  ],
  [
    "an unknown validator",
    { o: { checks: [check({ type: "k8s.does-not-exist" })] } },
    "checks[0].type",
    "unknown validator",
  ],
  [
    "invalid validator params",
    { o: { checks: [check({ params: { kind: "Pod", name: "UPPER", namespace: "default" } })] } },
    "checks[0].params.name",
    "",
  ],
  [
    "a validator param that does not exist",
    {
      o: {
        checks: [check({ params: { kind: "Pod", name: "x", namespace: "default", sudo: true } })],
      },
    },
    "checks[0].params.sudo",
    "unknown property",
  ],
  ["a non-positive weight", { o: { checks: [check({ weight: 0 })] } }, "checks[0].weight", ">="],
  ["an absurd weight", { o: { checks: [check({ weight: 1e9 })] } }, "checks[0].weight", "<="],
  [
    "an unsupported lifecycle operation",
    { o: { lifecycle: { run: ["rm -rf /"] } } },
    "lifecycle.run",
    "unknown property",
  ],
  [
    "a reset target in a protected namespace",
    {
      o: {
        lifecycle: { reset: { delete: [{ kind: "Pod", name: "x", namespace: "kube-system" }] } },
      },
    },
    "reset.delete[0]",
    "protected",
  ],
  [
    "a reset target of a kind that is not allowed",
    {
      o: {
        lifecycle: { reset: { delete: [{ kind: "ClusterRole", name: "x" }] } },
      },
    },
    "reset.delete[0].kind",
    "must be one of",
  ],
  [
    "a reset that would delete a namespace",
    { o: { lifecycle: { reset: { delete: [{ kind: "Namespace", name: "demo" }] } } } },
    "reset.delete[0]",
    "cannot be deleted",
  ],
  [
    "a reset target without a namespace",
    { o: { lifecycle: { reset: { delete: [{ kind: "Pod", name: "x" }] } } } },
    "reset.delete[0]",
    "requires an explicit namespace",
  ],
  [
    "a missing setup manifest",
    { o: { lifecycle: { setup: { manifests: ["setup/missing.yaml"] } } } },
    "lifecycle.setup.manifests[0]",
    "cannot read",
  ],
  [
    "a manifest path that escapes the exercise",
    { o: { lifecycle: { setup: { manifests: ["../../../etc/passwd"] } } } },
    "lifecycle.setup.manifests[0]",
    "",
  ],
  [
    "a missing description file",
    { o: { content: { description: "nope.md" } } },
    "content.description",
    "cannot read",
  ],
  [
    "a missing solution file",
    { o: { content: { solution: "solution.md" } } },
    "content.solution",
    "cannot read",
  ],
  [
    "an absolute description path",
    { o: { content: { description: "/etc/passwd" } } },
    "content.description",
    "",
  ],
];

function check(overrides) {
  return {
    id: "exists",
    type: "k8s.resource-exists",
    label: "Pod demo exists",
    params: { kind: "Pod", name: "demo", namespace: "default" },
    ...overrides,
  };
}

for (const [name, spec, pathPart, messagePart] of invalid) {
  test(`rejects ${name}, naming the file and property`, () => {
    const files = spec.file !== undefined ? { [FILE]: spec.file } : exerciseFiles("demo", spec.o);
    assertProblem(validate(files), pathPart, messagePart);
  });
}

test("duplicate ids across exercises name both files", () => {
  const result = validate({
    ...exerciseFiles("a"),
    ...exerciseFiles("b"),
  });
  assert.equal(result.ok, false);
  assert.match(
    messages(result).join("\n"),
    /kubernetes\/level-0\/b\/exercise\.yaml \[id\] duplicate exercise id "demo-0001" \(also defined in kubernetes\/level-0\/a\/exercise\.yaml\)/,
  );
});

test("an empty content directory is a failure, not a pass", () => {
  const result = validate({ "README.md": "nothing here" });
  assert.equal(result.ok, false);
  assert.match(result.problems[0].message, /no exercises/);
});

test("a missing content directory is reported, not thrown", () => {
  const result = validateContent({ contentRoot: "/definitely/not/here" });
  assert.equal(result.ok, false);
  assert.match(result.problems[0].message, /not found/);
});

test("validation never uses the environment runner", () => {
  // validateContent substitutes a runner that throws; valid content still passes, proving
  // load-time validation does not need Docker or a cluster.
  assert.equal(validate(exerciseFiles("demo")).ok, true);
});

function cli(...args) {
  return spawnSync(process.execPath, [bin, "validate-content", ...args], {
    encoding: "utf8",
    // Fail loudly if the command ever tried Docker or kind: they are unreachable here.
    env: { ...process.env, PATH: "/nonexistent" },
  });
}

test("CLI: exits 0 for the packaged content, without docker or kind on PATH", () => {
  const out = cli();
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /Validated 2 exercises: OK/);
});

test("CLI: exits non-zero and prints file, property and message for bad content", () => {
  const root = makeContent(exerciseFiles("demo", { checks: [check({ type: "k8s.nope" })] }));
  const out = cli(root);
  assert.equal(out.status, 1);
  assert.match(out.stderr, /kubernetes\/level-0\/demo\/exercise\.yaml \[checks\[0\]\.type\]/);
  assert.match(out.stderr, /unknown validator "k8s\.nope"/);
});

test("CLI: a missing directory exits non-zero", () => {
  assert.equal(cli("/definitely/not/here").status, 1);
});
