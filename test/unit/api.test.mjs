import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../../src/server.mjs";
import { appFor, exerciseFiles } from "../helpers/content.mjs";
import { createApp } from "../../src/app.mjs";
import { createFakeCluster, deployment, readyPod } from "../helpers/fake-cluster.mjs";

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
  cluster = createFakeCluster({ resources: [readyPod(), deployment()] });
  await boot(createApp({ runner: cluster, logger: quiet }).service);
});
after(() => server.close());

test("GET /api/status", async () => {
  const { status, body } = await call("/api/status");
  assert.equal(status, 200);
  // v0.1 fields (`track`, `exercise`) stay; `exercises` is the v0.2 addition.
  assert.deepEqual(body, {
    ready: true,
    cluster: "featherlab",
    track: "kubernetes",
    exercise: {
      id: "k8s-0001",
      title: "Your first Pod",
      name: "web",
      namespace: "default",
      image: "nginx:1.27",
    },
    exercises: 2,
  });
});

test("GET /api/exercises lists summaries and supports filters", async () => {
  const { body } = await call("/api/exercises");
  assert.deepEqual(
    body.exercises.map((e) => e.id),
    ["k8s-0001", "k8s-0002"],
  );
  assert.deepEqual(Object.keys(body.exercises[0]).sort(), [
    "difficulty",
    "estimatedMinutes",
    "id",
    "level",
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
    ["k8s-0002"],
  );
  assert.equal((await call("/api/exercises?level=1")).body.exercises.length, 0);
  assert.equal((await call("/api/exercises?level=abc")).status, 400);
});

test("GET /api/exercises/:id returns the learner-facing detail", async () => {
  const { status, body } = await call("/api/exercises/k8s-0001");
  assert.equal(status, 200);
  assert.equal(body.exercise.title, "Your first Pod");
  assert.ok(body.exercise.requirements.length >= 3);
  assert.equal(body.exercise.hintCount, 2);
  assert.match(body.exercise.description, /terminal/);
  assert.equal(body.exercise.hints, undefined);
});

test("hints are served one at a time, 1-based, in range", async () => {
  const first = await call("/api/exercises/k8s-0001/hints/1");
  assert.deepEqual(Object.keys(first.body.hint).sort(), ["exerciseId", "index", "text", "total"]);
  assert.equal(first.body.hint.index, 1);
  assert.equal(first.body.hint.total, 2);
  assert.equal((await call("/api/exercises/k8s-0001/hints/3")).status, 404);
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
  const activated = await call("/api/exercises/k8s-0002/activate", { method: "POST" });
  assert.equal(activated.status, 200);
  assert.deepEqual(activated.body.steps, ["apply Namespace/staging"]);
  assert.equal(activated.body.exercise.id, "k8s-0002");

  const reset = await call("/api/exercises/k8s-0001/reset", { method: "POST" });
  assert.equal(reset.status, 200);
  assert.equal(cluster.find("Pod", "web", "default"), undefined);
});

test("methods are enforced and unknown endpoints are JSON 404s", async () => {
  assert.equal((await call("/api/exercises/k8s-0001/check")).status, 405);
  assert.equal((await call("/api/exercises", { method: "POST" })).status, 405);
  const missing = await call("/api/nothing");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "NOT_FOUND");
});

test("cross-origin mutating requests are rejected; same-origin and no-origin pass", async () => {
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

test("legacy /api/check and /api/reset keep their v0.1 response shapes", async () => {
  cluster.put(readyPod());
  const check = await call("/api/check", { method: "POST" });
  assert.deepEqual(Object.keys(check.body).sort(), ["checks", "passed", "success", "total"]);
  assert.equal(check.body.success, true);
  assert.deepEqual(Object.keys(check.body.checks[0]).sort(), ["id", "label", "pass"]);
  assert.deepEqual((await call("/api/reset", { method: "POST" })).body, { reset: true });
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
      lifecycle: { setup: { manifests: ["setup/ns.yaml"] } },
      checks: [
        {
          id: "image",
          type: "k8s.container-image",
          label: "Container image is right",
          hidden: true,
          params: { kind: "Pod", name: "demo", namespace: "default", image: EXPECTED },
        },
      ],
    },
    {
      "solution.md": SOLUTION,
      "setup/ns.yaml": `apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ns\n  annotations:\n    note: ${MANIFEST}\n`,
    },
  );
  const leakCluster = createFakeCluster({
    resources: [readyPod({ name: "demo", image: "busybox" })],
  });
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
