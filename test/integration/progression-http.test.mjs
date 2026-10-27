/**
 * HTTP → SQLite integration test for M4.2.
 *
 * Drives the full learning progression loop through actual HTTP calls:
 *   POST /check → attempt in SQLite → unlock → GET /progress → restart → persistence
 *
 * Uses a real SQLite database in a temp directory and a fake cluster.
 * Never touches ~/.featherlab or real Docker/kind resources.
 */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer } from "../../src/server.mjs";
import { createApp } from "../../src/app.mjs";
import { createFakeCluster, readyPod } from "../helpers/fake-cluster.mjs";
import { makeContent, exerciseFiles } from "../helpers/content.mjs";

const quiet = { warn() {}, error() {} };

// Two exercises: demo-0002 requires demo-0001 to be completed first.
const CONTENT_FILES = {
  ...exerciseFiles("001-first", { id: "demo-0001" }),
  ...exerciseFiles("002-second", {
    id: "demo-0002",
    prerequisites: ["demo-0001"],
    checks: [
      {
        id: "exists",
        type: "k8s.resource-exists",
        label: "Pod demo2 exists",
        params: { kind: "Pod", name: "demo2", namespace: "default" },
      },
    ],
  }),
};

let stateDir;
let contentRoot;
let server;
let persistence;
let base;

before(async () => {
  stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-http-"));
  contentRoot = makeContent(CONTENT_FILES);
  const cluster = createFakeCluster({
    resources: [
      readyPod({ name: "demo", namespace: "default" }),
      readyPod({ name: "demo2", namespace: "default" }),
    ],
  });
  const app = createApp({ runner: cluster, contentRoot, stateDir, logger: quiet });
  persistence = app.persistence;
  server = await startServer(0, { service: app.service });
  base = `http://127.0.0.1:${server.port}`;
});

after(async () => {
  await server?.close();
  persistence?.close();
  rmSync(stateDir, { recursive: true, force: true });
  rmSync(contentRoot, { recursive: true, force: true });
});

const call = async (urlPath, init) => {
  const res = await fetch(base + urlPath, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
};

// ── Phase 1: grade demo-0001 via HTTP ─────────────────────────────────────────

test("POST /check returns passed outcome with progress field", async () => {
  const { status, body } = await call("/api/exercises/demo-0001/check", { method: "POST" });
  assert.equal(status, 200);
  assert.equal(body.result.outcome, "passed");
  assert.ok(body.result.progress !== undefined, "progress field missing from check response");
  assert.equal(body.result.progress.completed, true);
  assert.equal(body.result.progress.attemptCount, 1);
});

test("attempt is written to SQLite after successful /check", () => {
  const attempts = persistence.attempts.byExercise("demo-0001");
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].outcome, "passed");
});

// ── Phase 2: verify unlock via /progress ──────────────────────────────────────

test("GET /progress shows demo-0001 as completed", async () => {
  const { status, body } = await call("/api/exercises/demo-0001/progress");
  assert.equal(status, 200);
  assert.equal(body.progress.state, "completed");
  assert.equal(body.progress.completed, true);
  assert.equal(body.progress.attemptCount, 1);
});

test("GET /progress shows demo-0002 as available after demo-0001 passes", async () => {
  const { body } = await call("/api/exercises/demo-0002/progress");
  assert.equal(body.progress.state, "available");
  assert.deepEqual(body.progress.unmetPrerequisites, []);
});

test("GET /progress/track/:trackId summary reflects one completed, one available", async () => {
  const { status, body } = await call("/api/progress/track/kubernetes");
  assert.equal(status, 200);
  const demo1 = body.exercises.find((e) => e.exerciseId === "demo-0001");
  assert.ok(demo1, "demo-0001 missing from track progress");
  assert.equal(demo1.state, "completed");
  assert.equal(body.summary.completed, 1);
  assert.equal(body.summary.available, 1);
  assert.equal(body.summary.locked, 0);
});

// ── Phase 3: persistence across restart ───────────────────────────────────────

test("completion persists across app restart; /progress still shows completed", async () => {
  await server.close();
  persistence.close();

  // Reopen with same stateDir and empty cluster — persistence must come from SQLite.
  const emptyCluster = createFakeCluster({ resources: [] });
  const app2 = createApp({ runner: emptyCluster, contentRoot, stateDir, logger: quiet });
  persistence = app2.persistence;
  server = await startServer(0, { service: app2.service });
  base = `http://127.0.0.1:${server.port}`;

  const { body } = await call("/api/exercises/demo-0001/progress");
  assert.equal(body.progress.state, "completed");
  assert.equal(body.progress.attemptCount, 1);

  // demo-0002 still unlocked after restart.
  const { body: body2 } = await call("/api/exercises/demo-0002/progress");
  assert.equal(body2.progress.state, "available");
});
