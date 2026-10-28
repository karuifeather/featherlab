import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../../src/server.mjs";
import { appFor, exerciseFiles } from "../helpers/content.mjs";
import { createApp } from "../../src/app.mjs";
import { createFakeCluster, readyPod } from "../helpers/fake-cluster.mjs";
import { CURRICULUM_ORDER } from "../helpers/curriculum.mjs";

const quiet = { warn() {}, error() {} };
const SOLUTION = "SOLUTION-MARKER-kubectl-run-secret";
const EXPECTED = "EXPECTED-IMAGE-MARKER:9.9";
const MANIFEST = "MANIFEST-MARKER";

let cluster;
let server;
let base;

async function boot(service) {
  server = await startServer(0, { service });
  base = `http://127.0.0.1:${server.port}`;
}

const call = async (path, init) => {
  const response = await fetch(base + path, init);
  const text = await response.text();
  return { status: response.status, text, body: text ? safeJson(text) : undefined };
};
const safeJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

before(async () => {
  cluster = createFakeCluster();
  await boot(createApp({ runner: cluster, logger: quiet }).service);
});
after(() => server.close());

test("GET /api/status", async () => {
  const { status, body } = await call("/api/status");
  assert.equal(status, 200);
  // The v0.1 `track`/`exercise` fields were removed with the /api/check alias (M5.1).
  assert.deepEqual(body, { ready: true, cluster: "featherlab", exercises: 18 });
});

test("GET /api/exercises lists summaries and supports filters", async () => {
  const { body } = await call("/api/exercises");
  assert.deepEqual(
    body.exercises.map((e) => e.id),
    CURRICULUM_ORDER,
    "the API returns curriculum order, which is not id order",
  );
  assert.deepEqual(Object.keys(body.exercises[0]).sort(), [
    "activityType",
    "difficulty",
    "estimatedMinutes",
    "id",
    "level",
    "order",
    "prerequisites",
    "summary",
    "tags",
    "title",
    "track",
    "type",
  ]);
  const byTag = await call("/api/exercises?tag=labels");
  assert.deepEqual(
    byTag.body.exercises.map((e) => e.id),
    [
      "k8s-0011",
      "k8s-0012",
      "k8s-0014",
      "k8s-0002",
      "k8s-0016",
      "k8s-0017",
      "k8s-0018",
      "k8s-0003",
      "k8s-0007",
    ],
  );
  assert.deepEqual(
    (await call("/api/exercises?level=1")).body.exercises.map((e) => e.id),
    ["k8s-0003", "k8s-0006"],
  );
  assert.equal((await call("/api/exercises?level=3")).body.exercises.length, 0);
  assert.equal((await call("/api/exercises?level=abc")).status, 400);
});

test("GET /api/exercises/:id returns the learner-facing detail", async () => {
  const { status, body } = await call("/api/exercises/k8s-0001");
  assert.equal(status, 200);
  assert.equal(body.exercise.title, "Your first Pod");
  assert.ok(body.exercise.requirements.length >= 3);
  assert.equal(body.exercise.hintCount, 3);
  assert.match(body.exercise.requirements[0], /fl-k8s-0001/, "the namespace is stated first");
  assert.match(body.exercise.description, /terminal/);
  assert.equal(body.exercise.hints, undefined);
});

test("hints are served one at a time, 1-based, in range", async () => {
  const first = await call("/api/exercises/k8s-0001/hints/1");
  assert.deepEqual(Object.keys(first.body.hint).sort(), ["exerciseId", "index", "text", "total"]);
  assert.equal(first.body.hint.index, 1);
  assert.equal(first.body.hint.total, 3);
  assert.equal((await call("/api/exercises/k8s-0001/hints/4")).status, 404);
  assert.equal((await call("/api/exercises/k8s-0001/hints/0")).status, 404);
});

test("unknown and malformed ids are 404 with a structured error", async () => {
  for (const path of [
    "/api/exercises/nope",
    "/api/exercises/..%2f..%2fetc",
    "/api/exercises/UPPER",
  ]) {
    const { status, body } = await call(path);
    assert.equal(status, 404, path);
    assert.equal(typeof body.error, "string");
    assert.equal(typeof body.code, "string");
  }
});

test("POST /api/exercises/:id/check returns a structured result", async () => {
  await call("/api/exercises/k8s-0001/activate", { method: "POST" });
  cluster.put(readyPod());
  const { status, body } = await call("/api/exercises/k8s-0001/check", { method: "POST" });
  assert.equal(status, 200);
  const { result } = body;
  assert.equal(result.success, true);
  assert.equal(result.outcome, "passed");
  assert.deepEqual(result.score, { earned: 4, possible: 4, percent: 100 });
  assert.deepEqual(Object.keys(result.checks[0]).sort(), [
    "feedback",
    "id",
    "label",
    "passed",
    "status",
    "weight",
  ]);
});

test("POST activate and reset follow the lifecycle", async () => {
  // k8s-0001 holds the environment from the previous test: switching must be confirmed.
  const refused = await call("/api/exercises/k8s-0002/activate", { method: "POST" });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "ENVIRONMENT_IN_USE");
  assert.equal(refused.body.details.activeExerciseId, "k8s-0001");

  const activated = await call("/api/exercises/k8s-0002/activate?discardActive=true", {
    method: "POST",
  });
  assert.equal(activated.status, 200);
  assert.equal(activated.body.environment, "fresh");
  assert.ok(activated.body.steps.includes("create Namespace/fl-k8s-0002"));
  assert.equal(activated.body.exercise.id, "k8s-0002");

  const reopened = await call("/api/exercises/k8s-0002/activate", { method: "POST" });
  assert.equal(reopened.body.environment, "resumed");
  assert.deepEqual(reopened.body.steps, [], "resuming changes nothing");

  const reset = await call("/api/exercises/k8s-0001/reset?discardActive=true", {
    method: "POST",
  });
  assert.equal(reset.status, 200);
  assert.equal(cluster.find("Pod", "web", "fl-k8s-0001"), undefined);
});

test("methods are enforced and unknown endpoints are JSON 404s", async () => {
  assert.equal((await call("/api/exercises/k8s-0001/check")).status, 405);
  assert.equal((await call("/api/exercises", { method: "POST" })).status, 405);
  const missing = await call("/api/nothing");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "NOT_FOUND");
});

test("cross-origin mutating requests are rejected; same-origin and no-origin pass", async () => {
  await call("/api/exercises/k8s-0001/activate", { method: "POST" });
  const evil = await call("/api/exercises/k8s-0001/check", {
    method: "POST",
    headers: { Origin: "http://evil.example" },
  });
  assert.equal(evil.status, 403);
  const same = await call("/api/exercises/k8s-0001/check", {
    method: "POST",
    headers: { Origin: base },
  });
  assert.equal(same.status, 200);
});

test("the removed v0.1 endpoints /api/check and /api/reset are 404s", async () => {
  await call("/api/exercises/k8s-0001/activate?discardActive=true", { method: "POST" });
  cluster.put(readyPod());
  for (const path of ["/api/check", "/api/reset"]) {
    const removed = await call(path, { method: "POST" });
    assert.equal(removed.status, 404, path);
    assert.equal(removed.body.code, "NOT_FOUND");
  }
  // The canonical endpoint grades the same work.
  const check = await call("/api/exercises/k8s-0001/check", { method: "POST" });
  assert.equal(check.body.result.outcome, "passed");
});

test("a cluster outage is a 503 with a code, not a stack trace", async () => {
  cluster.down = true;
  const reset = await call("/api/exercises/k8s-0001/reset", { method: "POST" });
  cluster.down = false;
  assert.equal(reset.status, 503);
  assert.equal(reset.body.code, "ENVIRONMENT_UNAVAILABLE");
  assert.doesNotMatch(reset.text, /connection refused|stderr|\bat \w+/);
});

test("busy exercises answer 409", async () => {
  const slow = createFakeCluster();
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const original = slow.run;
  slow.run = async (...args) => {
    await gate;
    return original(...args);
  };
  const other = await startServer(0, {
    service: createApp({ runner: slow, logger: quiet }).service,
  });
  try {
    const url = `http://127.0.0.1:${other.port}/api/exercises/k8s-0001`;
    const pending = fetch(`${url}/reset`, { method: "POST" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const conflict = await fetch(`${url}/check`, { method: "POST" });
    assert.equal(conflict.status, 409);
    release();
    assert.equal((await pending).status, 200);
  } finally {
    release();
    await other.close();
  }
});

test("no response ever leaks solutions, grader config, manifests or internals", async () => {
  const files = exerciseFiles(
    "001-leak",
    {
      content: { description: "description.md", solution: "solution.md" },
      hints: ["A hint"],
      lifecycle: { namespaces: ["fl-demo-0001"], setup: { manifests: ["setup/config.yaml"] } },
      checks: [
        {
          id: "image",
          type: "k8s.container-image",
          label: "Container image is right",
          hidden: true,
          params: { kind: "Pod", name: "demo", namespace: "fl-demo-0001", image: EXPECTED },
        },
      ],
    },
    {
      "solution.md": SOLUTION,
      "setup/config.yaml": `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: config\n  namespace: fl-demo-0001\n  annotations:\n    note: ${MANIFEST}\n`,
    },
  );
  const leakCluster = createFakeCluster();
  const leaky = await startServer(0, { service: appFor(files, leakCluster).service });
  try {
    const root = `http://127.0.0.1:${leaky.port}`;
    const paths = [
      ["GET", "/api/status"],
      ["GET", "/api/exercises"],
      ["GET", "/api/exercises/demo-0001"],
      ["GET", "/api/exercises/demo-0001/hints/1"],
      ["POST", "/api/exercises/demo-0001/activate"],
      ["POST", "/api/exercises/demo-0001/check"],
      ["POST", "/api/exercises/demo-0001/reset"],
      ["GET", "/api/exercises/demo-0001/solution"],
      ["GET", "/api/exercises/demo-0001/checks"],
    ];
    for (const [method, path] of paths) {
      const text = await (await fetch(root + path, { method })).text();
      for (const secret of [
        SOLUTION,
        EXPECTED,
        MANIFEST,
        "lifecycle",
        "solution",
        "manifests",
        "params",
        "stderr",
      ])
        assert.ok(!text.includes(secret), `${method} ${path} leaked ${secret}: ${text}`);
    }
  } finally {
    await leaky.close();
  }
});
