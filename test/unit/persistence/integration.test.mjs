/**
 * End-to-end persistence integration test.
 *
 * Verifies that data written through the repository APIs to a real disk-backed SQLite
 * database survives a close-and-reopen cycle, and that test cleanup only removes the
 * test-owned temporary directory.
 *
 * This test never touches ~/.featherlab or any production state.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPersistence } from "../../../src/infrastructure/persistence/index.mjs";
import {
  CURRENT_VERSION,
  runMigrations,
} from "../../../src/infrastructure/persistence/migrate.mjs";
import { DatabaseAdapter } from "../../../src/infrastructure/persistence/database.mjs";
import { AttemptsRepository } from "../../../src/infrastructure/persistence/repositories/attempts.mjs";
import { ProgressRepository } from "../../../src/infrastructure/persistence/repositories/progress.mjs";

// ── Full lifecycle: create → write → close → reopen → verify ─────────────────

test("full persistence lifecycle: data survives close and reopen", () => {
  const tmpStateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-integration-"));
  try {
    const ATTEMPT_TIME = "2024-09-01T10:00:00.000Z";
    const PROGRESS_TIME = "2024-09-01T10:05:00.000Z";
    const RESUME_TIME = "2024-09-01T10:10:00.000Z";

    // --- Phase 1: write ---
    {
      const p = createPersistence({ stateDir: tmpStateDir });

      const id1 = p.attempts.insert({
        exerciseId: "k8s-0001",
        trackId: "kubernetes",
        attemptedAt: ATTEMPT_TIME,
        outcome: "passed",
        scoreEarned: 4,
        scorePossible: 4,
        hintsUsed: 1,
        durationMs: 30000,
      });
      assert.equal(typeof id1, "number");

      p.attempts.insert({
        exerciseId: "k8s-0001",
        trackId: "kubernetes",
        attemptedAt: "2024-09-01T09:00:00.000Z",
        outcome: "failed",
        scoreEarned: 2,
        scorePossible: 4,
      });

      p.attempts.insert({
        exerciseId: "k8s-0002",
        trackId: "kubernetes",
        attemptedAt: ATTEMPT_TIME,
        outcome: "passed",
        scoreEarned: 7,
        scorePossible: 7,
      });

      p.progress.upsert({
        exerciseId: "k8s-0001",
        trackId: "kubernetes",
        bestScoreEarned: 4,
        bestScorePossible: 4,
        completed: true,
        firstCompletedAt: PROGRESS_TIME,
        lastAttemptedAt: PROGRESS_TIME,
        attemptCount: 2,
      });

      p.progress.upsert({
        exerciseId: "k8s-0002",
        trackId: "kubernetes",
        bestScoreEarned: 7,
        bestScorePossible: 7,
        completed: true,
        firstCompletedAt: ATTEMPT_TIME,
        lastAttemptedAt: ATTEMPT_TIME,
        attemptCount: 1,
      });

      p.resume.set({ trackId: "kubernetes", exerciseId: "k8s-0002", updatedAt: RESUME_TIME });

      p.close();
    }

    // --- Phase 2: verify the file exists ---
    const dbPath = path.join(tmpStateDir, "progress.sqlite");
    assert.ok(existsSync(dbPath), "progress.sqlite was not created");

    // --- Phase 3: reopen and verify ---
    {
      const p = createPersistence({ stateDir: tmpStateDir });

      // Attempts
      const k8s0001Attempts = p.attempts.byExercise("k8s-0001");
      assert.equal(k8s0001Attempts.length, 2, "k8s-0001 should have 2 attempts");
      assert.equal(k8s0001Attempts[0].outcome, "failed"); // oldest first
      assert.equal(k8s0001Attempts[1].outcome, "passed");
      assert.equal(k8s0001Attempts[1].scoreEarned, 4);
      assert.equal(k8s0001Attempts[1].hintsUsed, 1);
      assert.equal(k8s0001Attempts[1].durationMs, 30000);

      const k8s0002Attempts = p.attempts.byExercise("k8s-0002");
      assert.equal(k8s0002Attempts.length, 1);
      assert.equal(k8s0002Attempts[0].scorePossible, 7);

      // Recent (all three attempts)
      const recent = p.attempts.recent(10);
      assert.equal(recent.length, 3);

      // Progress
      const prog1 = p.progress.get("k8s-0001", "kubernetes");
      assert.ok(prog1 !== null);
      assert.equal(prog1.bestScoreEarned, 4);
      assert.equal(prog1.completed, true);
      assert.equal(prog1.firstCompletedAt, PROGRESS_TIME);
      assert.equal(prog1.attemptCount, 2);

      const prog2 = p.progress.get("k8s-0002", "kubernetes");
      assert.equal(prog2.completed, true);
      assert.equal(prog2.bestScoreEarned, 7);

      const trackProgress = p.progress.forTrack("kubernetes");
      assert.equal(trackProgress.length, 2);

      // Resume
      const resume = p.resume.get();
      assert.ok(resume !== null);
      assert.equal(resume.trackId, "kubernetes");
      assert.equal(resume.exerciseId, "k8s-0002");
      assert.equal(resume.updatedAt, RESUME_TIME);

      p.close();
    }
  } finally {
    // Only the test-owned temp directory is removed — never ~/.featherlab.
    rmSync(tmpStateDir, { recursive: true, force: true });
  }
});

// ── createPersistence: initialization safety ──────────────────────────────────

test("createPersistence is idempotent across multiple calls on the same stateDir", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "featherlab-idempotent-"));
  try {
    const p1 = createPersistence({ stateDir: dir });
    p1.attempts.insert({ exerciseId: "x", trackId: "k", outcome: "passed" });
    p1.close();

    const p2 = createPersistence({ stateDir: dir });
    const attempts = p2.attempts.byExercise("x");
    assert.equal(attempts.length, 1, "data should survive re-open without duplication");
    p2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createPersistence schema version equals CURRENT_VERSION after init", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "featherlab-ver-"));
  try {
    const p = createPersistence({ stateDir: dir });
    p.close();

    // Open the raw database to check user_version.
    const db = new DatabaseAdapter(path.join(dir, "progress.sqlite"));
    assert.equal(db.getUserVersion(), CURRENT_VERSION);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createPersistence throws and closes db on a future-schema database", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "featherlab-future-"));
  try {
    // Bootstrap a database then bump its version beyond current.
    const db = new DatabaseAdapter(path.join(dir, "progress.sqlite"));
    runMigrations(db);
    db.setUserVersion(CURRENT_VERSION + 99);
    db.close();

    assert.throws(() => createPersistence({ stateDir: dir }), /newer than this version/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Transactional writes across repositories ──────────────────────────────────

test("related attempt + progress write is transactionally atomic", () => {
  const db = new DatabaseAdapter(":memory:");
  runMigrations(db);
  const attempts = new AttemptsRepository(db);
  const progress = new ProgressRepository(db);

  // Write both inside a single transaction and verify commit.
  db.transaction(() => {
    attempts.insert({ exerciseId: "k8s-0001", trackId: "kubernetes", outcome: "passed" });
    progress.upsert({
      exerciseId: "k8s-0001",
      trackId: "kubernetes",
      completed: true,
      attemptCount: 1,
    });
  });

  assert.equal(attempts.byExercise("k8s-0001").length, 1);
  assert.ok(progress.get("k8s-0001", "kubernetes").completed);
  db.close();
});

test("failed transaction rolls back attempt and progress together", () => {
  const db = new DatabaseAdapter(":memory:");
  runMigrations(db);
  const attempts = new AttemptsRepository(db);
  const progress = new ProgressRepository(db);

  assert.throws(() => {
    db.transaction(() => {
      attempts.insert({ exerciseId: "k8s-0001", trackId: "kubernetes", outcome: "passed" });
      throw new Error("simulated failure");
    });
  });

  assert.deepEqual(attempts.byExercise("k8s-0001"), []);
  assert.equal(progress.get("k8s-0001", "kubernetes"), null);
  db.close();
});
