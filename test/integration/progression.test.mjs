/**
 * End-to-end learning progression test.
 *
 * Verifies the complete M4.2 learning loop:
 *   select → grade → persist → unlock → restart → resume
 *
 * Uses a real SQLite database in a temporary directory, a fake cluster (no Docker / kind),
 * and custom exercises with prerequisites. Never touches ~/.featherlab or real clusters.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/app.mjs";
import { createFakeCluster, readyPod } from "../helpers/fake-cluster.mjs";
import { makeContent, exerciseFiles } from "../helpers/content.mjs";
import { LockedError } from "../../src/core/errors.mjs";

const quiet = { warn() {}, error() {} };

// Two exercises: k8s-0002 requires k8s-0001.
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

// ── Full lifecycle integration test ──────────────────────────────────────────

test("full progression lifecycle: grade → unlock → restart → resume", async () => {
  const contentRoot = makeContent(CONTENT_FILES);
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-prog-"));
  const cluster = createFakeCluster({
    resources: [
      readyPod({ name: "demo", namespace: "default" }),
      readyPod({ name: "demo2", namespace: "default" }),
    ],
  });

  try {
    // ── Phase 1: initial state ────────────────────────────────────────────────
    const app1 = createApp({ runner: cluster, contentRoot, stateDir, logger: quiet });
    const svc1 = app1.service;

    // demo-0001 is available (no prerequisites)
    const p1 = svc1.getExerciseProgress("demo-0001");
    assert.equal(p1.state, "available");
    assert.equal(p1.completed, false);

    // demo-0002 is locked (demo-0001 not completed)
    const p2 = svc1.getExerciseProgress("demo-0002");
    assert.equal(p2.state, "locked");
    assert.deepEqual(p2.unmetPrerequisites, ["demo-0001"]);

    // Cannot activate or grade demo-0002 while locked
    await assert.rejects(() => svc1.check("demo-0002"), LockedError);
    await assert.rejects(() => svc1.activate("demo-0002"), LockedError);

    // ── Phase 2: select and grade demo-0001 ──────────────────────────────────
    svc1.select("demo-0001");
    const resume1 = svc1.getResume();
    assert.equal(resume1.exerciseId, "demo-0001");
    assert.equal(resume1.fallback, false);

    // Grade demo-0001 successfully
    const result1 = await svc1.check("demo-0001");
    assert.equal(result1.outcome, "passed");
    assert.ok(result1.progress !== undefined);
    assert.equal(result1.progress.completed, true);
    assert.equal(result1.progress.attemptCount, 1);

    // demo-0002 is now unlocked
    const p2after = svc1.getExerciseProgress("demo-0002");
    assert.equal(p2after.state, "available");
    assert.deepEqual(p2after.unmetPrerequisites, []);

    // ── Phase 3: select and grade demo-0002 ──────────────────────────────────
    svc1.select("demo-0002");
    const result2 = await svc1.check("demo-0002");
    assert.equal(result2.outcome, "passed");
    assert.equal(result2.progress.completed, true);

    app1.persistence.close();

    // ── Phase 4: restart with same stateDir ──────────────────────────────────
    const cluster2 = createFakeCluster({
      resources: [
        readyPod({ name: "demo", namespace: "default" }),
        readyPod({ name: "demo2", namespace: "default" }),
      ],
    });
    const app2 = createApp({ runner: cluster2, contentRoot, stateDir, logger: quiet });
    const svc2 = app2.service;

    // Completion persisted across restart
    assert.equal(svc2.getExerciseProgress("demo-0001").state, "completed");
    assert.equal(svc2.getExerciseProgress("demo-0002").state, "completed");

    // Resume state persisted
    const resume2 = svc2.getResume();
    assert.equal(resume2.exerciseId, "demo-0002");
    assert.equal(resume2.fallback, false);

    // Attempt history persisted
    const attempts1 = app2.persistence.attempts.byExercise("demo-0001");
    assert.equal(attempts1.length, 1);
    assert.equal(attempts1[0].outcome, "passed");

    // Track progress
    const trackProgress = svc2.getTrackProgress("kubernetes");
    assert.equal(trackProgress.length, 2);
    assert.ok(trackProgress.every((e) => e.completed));

    app2.persistence.close();
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

// ── Locked exercise cannot be graded ─────────────────────────────────────────

test("locked exercise cannot be graded; error names the unmet prerequisites", async () => {
  const contentRoot = makeContent(CONTENT_FILES);
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-lock-"));
  const cluster = createFakeCluster({ resources: [readyPod({ name: "demo2" })] });
  try {
    const { service, persistence } = createApp({
      runner: cluster,
      contentRoot,
      stateDir,
      logger: quiet,
    });
    let err;
    try {
      await service.check("demo-0002");
    } catch (error) {
      err = error;
    }
    assert.ok(err instanceof LockedError);
    assert.deepEqual(err.details.unmetPrerequisites, ["demo-0001"]);
    // No attempt recorded for a locked exercise
    assert.equal(persistence.attempts.byExercise("demo-0002").length, 0);
    persistence.close();
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

// ── Failed attempt does not mark completion ───────────────────────────────────

test("failed grading: attempt recorded, exercise remains incomplete", async () => {
  const contentRoot = makeContent(CONTENT_FILES);
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-fail-"));
  const cluster = createFakeCluster({ resources: [] }); // no pods → fail
  try {
    const { service, persistence } = createApp({
      runner: cluster,
      contentRoot,
      stateDir,
      logger: quiet,
    });
    const result = await service.check("demo-0001");
    assert.equal(result.outcome, "failed");
    assert.equal(result.progress.completed, false);
    assert.equal(result.progress.attemptCount, 1);
    // demo-0002 is still locked
    assert.equal(service.getExerciseProgress("demo-0002").state, "locked");
    persistence.close();
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

// ── Incomplete (infra error) not recorded ─────────────────────────────────────

test("incomplete grading result is not recorded as a learning attempt", async () => {
  const contentRoot = makeContent(CONTENT_FILES);
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-incomplete-"));
  const cluster = createFakeCluster({ resources: [] });
  cluster.down = true; // simulate unreachable cluster
  try {
    const { service, persistence } = createApp({
      runner: cluster,
      contentRoot,
      stateDir,
      logger: quiet,
    });
    const result = await service.check("demo-0001");
    assert.equal(result.outcome, "incomplete");
    assert.equal(result.progress, undefined); // no progress field
    assert.equal(persistence.attempts.byExercise("demo-0001").length, 0);
    persistence.close();
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

// ── Resume fallback on locked exercise ───────────────────────────────────────

test("getResume falls back when stored exercise is locked after restart", async () => {
  const contentRoot = makeContent(CONTENT_FILES);
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-resume-"));
  const cluster = createFakeCluster({ resources: [] });
  try {
    // Store resume pointing to the locked demo-0002 directly via the persistence layer.
    const app1 = createApp({ runner: cluster, contentRoot, stateDir, logger: quiet });
    app1.persistence.resume.set({ trackId: "kubernetes", exerciseId: "demo-0002" });
    app1.persistence.close();

    // On restart, demo-0002 is still locked → fall back to demo-0001.
    const app2 = createApp({ runner: cluster, contentRoot, stateDir, logger: quiet });
    const resume = app2.service.getResume();
    assert.equal(resume.exerciseId, "demo-0001");
    assert.equal(resume.fallback, true);
    app2.persistence.close();
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

// ── getTrackProgress summary ──────────────────────────────────────────────────

test("track progress summary counts reflect actual states", async () => {
  const contentRoot = makeContent(CONTENT_FILES);
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-track-"));
  const cluster = createFakeCluster({
    resources: [readyPod({ name: "demo", namespace: "default" })],
  });
  try {
    const { service, persistence } = createApp({
      runner: cluster,
      contentRoot,
      stateDir,
      logger: quiet,
    });
    await service.check("demo-0001"); // passes → completed
    const trackProgress = service.getTrackProgress("kubernetes");
    const states = trackProgress.map((e) => e.state);
    assert.ok(states.includes("completed"), "demo-0001 should be completed");
    assert.ok(states.includes("available"), "demo-0002 should be available after demo-0001 passes");
    persistence.close();
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});
