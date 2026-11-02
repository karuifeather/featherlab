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
        params: { kind: "Pod", name: "demo2", namespace: "fl-demo-0002" },
      },
    ],
  }),
};

let stateDir;
let contentRoot;
let cluster;
let server;
let persistence;
let base;

before(async () => {
  stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-http-"));
  contentRoot = makeContent(CONTENT_FILES);
  cluster = createFakeCluster();
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
  await call("/api/exercises/demo-0001/activate", { method: "POST" });
  cluster.put(readyPod({ name: "demo", namespace: "fl-demo-0001" })); // the learner's work
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

// ── Phase 4: monotonic completion — failing after passing doesn't reset ────────

test("POST /check after completion: outcome=failed, progress.completed stays true", async () => {
  // demo-0001 is already completed from Phase 1. Grade it again against an empty cluster.
  // It is still the active exercise (persisted in SQLite), so grading is allowed. It must fail, but completion must remain true and attemptCount must increase.
  const failCluster = createFakeCluster({ resources: [] }); // no pods → all checks fail
  await server.close();
  persistence.close();

  const app3 = createApp({ runner: failCluster, contentRoot, stateDir, logger: quiet });
  persistence = app3.persistence;
  server = await startServer(0, { service: app3.service });
  base = `http://127.0.0.1:${server.port}`;

  const { status, body } = await call("/api/exercises/demo-0001/check", { method: "POST" });
  assert.equal(status, 200);
  assert.equal(body.result.outcome, "failed");
  assert.ok(
    body.result.progress !== undefined,
    "progress field must be present after a failed attempt",
  );
  assert.equal(body.result.progress.completed, true, "completion must not revert after a failure");
  assert.equal(body.result.progress.attemptCount, 2, "attempt count must increment");
});

// ── Phase 5: locked exercise returns 403 from /check and /select ───────────────

test("POST /select returns 403 for a locked exercise", async () => {
  // demo-0002 is available (demo-0001 is completed). We need a fresh isolated state
  // where demo-0001 is NOT completed so demo-0002 is locked.
  const lockedDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-locked-"));
  const lockedContent = makeContent(CONTENT_FILES);
  try {
    const lockedCluster = createFakeCluster({ resources: [] });
    const lockedApp = createApp({
      runner: lockedCluster,
      contentRoot: lockedContent,
      stateDir: lockedDir,
      logger: quiet,
    });
    const lockedServer = await startServer(0, { service: lockedApp.service });
    const lockedBase = `http://127.0.0.1:${lockedServer.port}`;
    const lockedCall = async (p, init) => {
      const res = await fetch(lockedBase + p, init);
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : undefined };
    };

    const { status, body } = await lockedCall("/api/exercises/demo-0002/select", {
      method: "POST",
    });
    assert.equal(status, 403);
    assert.equal(body.code, "EXERCISE_LOCKED");
    assert.ok(body.details?.unmetPrerequisites?.includes("demo-0001"));

    await lockedServer.close();
    lockedApp.persistence.close();
  } finally {
    rmSync(lockedDir, { recursive: true, force: true });
    rmSync(lockedContent, { recursive: true, force: true });
  }
});

// ── Phase 6: GET /resume when no exercise has been selected ───────────────────

test("GET /resume returns a fallback (not null) when no selection has been stored", async () => {
  // Use the current server which has completed exercises; this tests the fallback
  // when the route is called on a fresh database (before any select() call).
  // The current state: demo-0001 is completed so demo-0002 is available. Neither was
  // explicitly selected, so resume returns a fallback to the first available exercise.
  //
  // To get a truly fresh state, create a separate app with an empty SQLite db.
  const freshDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-fresh-"));
  const freshContent = makeContent(CONTENT_FILES);
  try {
    const freshCluster = createFakeCluster({ resources: [] });
    const freshApp = createApp({
      runner: freshCluster,
      contentRoot: freshContent,
      stateDir: freshDir,
      logger: quiet,
    });
    const freshServer = await startServer(0, { service: freshApp.service });
    const freshBase = `http://127.0.0.1:${freshServer.port}`;
    const freshCall = async (p) => {
      const res = await fetch(freshBase + p);
      return { status: res.status, body: JSON.parse(await res.text()) };
    };

    const { status, body } = await freshCall("/api/resume");
    assert.equal(status, 200);
    // When persistence is configured but nothing has been selected,
    // the API returns a fallback (never null).
    assert.ok(body.resume !== null, "resume must not be null when persistence is configured");
    assert.equal(body.resume.fallback, true, "fresh state must be a fallback");
    assert.equal(
      body.resume.exerciseId,
      "demo-0001",
      "fallback must point to first available exercise",
    );

    await freshServer.close();
    freshApp.persistence.close();
  } finally {
    rmSync(freshDir, { recursive: true, force: true });
    rmSync(freshContent, { recursive: true, force: true });
  }
});
