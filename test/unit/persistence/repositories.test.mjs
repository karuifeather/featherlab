import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseAdapter } from "../../../src/infrastructure/persistence/database.mjs";
import { runMigrations } from "../../../src/infrastructure/persistence/migrate.mjs";
import { AttemptsRepository } from "../../../src/infrastructure/persistence/repositories/attempts.mjs";
import { ProgressRepository } from "../../../src/infrastructure/persistence/repositories/progress.mjs";
import { ResumeRepository } from "../../../src/infrastructure/persistence/repositories/resume.mjs";

function migratedDb() {
  const db = new DatabaseAdapter(":memory:");
  runMigrations(db);
  return db;
}

// ── AttemptsRepository ────────────────────────────────────────────────────────

test("AttemptsRepository.insert returns a numeric id", () => {
  const db = migratedDb();
  const repo = new AttemptsRepository(db);
  const id = repo.insert({ exerciseId: "k8s-0001", trackId: "kubernetes", outcome: "passed" });
  assert.equal(typeof id, "number");
  assert.ok(id > 0);
  db.close();
});

test("AttemptsRepository.byExercise returns attempts oldest-first", () => {
  const db = migratedDb();
  const repo = new AttemptsRepository(db);
  repo.insert({
    exerciseId: "k8s-0001",
    trackId: "kubernetes",
    attemptedAt: "2024-01-01T00:00:00.000Z",
    outcome: "failed",
  });
  repo.insert({
    exerciseId: "k8s-0001",
    trackId: "kubernetes",
    attemptedAt: "2024-01-02T00:00:00.000Z",
    outcome: "passed",
  });
  const attempts = repo.byExercise("k8s-0001");
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].outcome, "failed");
  assert.equal(attempts[1].outcome, "passed");
  db.close();
});

test("AttemptsRepository.byExercise returns empty array for unknown exercise", () => {
  const db = migratedDb();
  const repo = new AttemptsRepository(db);
  assert.deepEqual(repo.byExercise("no-such-exercise"), []);
  db.close();
});

test("AttemptsRepository.insert stores all optional fields", () => {
  const db = migratedDb();
  const repo = new AttemptsRepository(db);
  repo.insert({
    exerciseId: "k8s-0002",
    trackId: "kubernetes",
    attemptedAt: "2024-06-15T12:00:00.000Z",
    outcome: "passed",
    scoreEarned: 7,
    scorePossible: 7,
    hintsUsed: 2,
    durationMs: 45000,
  });
  const [a] = repo.byExercise("k8s-0002");
  assert.equal(a.scoreEarned, 7);
  assert.equal(a.scorePossible, 7);
  assert.equal(a.hintsUsed, 2);
  assert.equal(a.durationMs, 45000);
  assert.equal(a.attemptedAt, "2024-06-15T12:00:00.000Z");
  db.close();
});

test("AttemptsRepository.recent returns newest first, up to limit", () => {
  const db = migratedDb();
  const repo = new AttemptsRepository(db);
  for (let i = 1; i <= 5; i++) {
    repo.insert({
      exerciseId: `k8s-000${i}`,
      trackId: "kubernetes",
      attemptedAt: `2024-01-0${i}T00:00:00.000Z`,
      outcome: "passed",
    });
  }
  const recent = repo.recent(3);
  assert.equal(recent.length, 3);
  assert.equal(recent[0].exerciseId, "k8s-0005");
  assert.equal(recent[2].exerciseId, "k8s-0003");
  db.close();
});

test("AttemptsRepository.recent returns all rows when fewer than limit exist", () => {
  const db = migratedDb();
  const repo = new AttemptsRepository(db);
  repo.insert({ exerciseId: "x", trackId: "k", outcome: "failed" });
  assert.equal(repo.recent(100).length, 1);
  db.close();
});

test("AttemptsRepository.recent returns empty array on an empty database", () => {
  const db = migratedDb();
  const repo = new AttemptsRepository(db);
  assert.deepEqual(repo.recent(), []);
  db.close();
});

test("AttemptsRepository returned shape has camelCase keys", () => {
  const db = migratedDb();
  const repo = new AttemptsRepository(db);
  repo.insert({ exerciseId: "k8s-0001", trackId: "kubernetes", outcome: "passed" });
  const [a] = repo.byExercise("k8s-0001");
  assert.ok("exerciseId" in a);
  assert.ok("trackId" in a);
  assert.ok("attemptedAt" in a);
  assert.ok("outcome" in a);
  db.close();
});

// ── ProgressRepository ────────────────────────────────────────────────────────

test("ProgressRepository.get returns null for an exercise with no record", () => {
  const db = migratedDb();
  const repo = new ProgressRepository(db);
  assert.equal(repo.get("k8s-0001", "kubernetes"), null);
  db.close();
});

test("ProgressRepository.upsert inserts a new record", () => {
  const db = migratedDb();
  const repo = new ProgressRepository(db);
  repo.upsert({
    exerciseId: "k8s-0001",
    trackId: "kubernetes",
    bestScoreEarned: 4,
    bestScorePossible: 4,
    completed: true,
    firstCompletedAt: "2024-01-01T00:00:00.000Z",
    lastAttemptedAt: "2024-01-01T00:00:00.000Z",
    attemptCount: 1,
  });
  const p = repo.get("k8s-0001", "kubernetes");
  assert.ok(p !== null);
  assert.equal(p.exerciseId, "k8s-0001");
  assert.equal(p.bestScoreEarned, 4);
  assert.equal(p.completed, true);
  assert.equal(p.attemptCount, 1);
  db.close();
});

test("ProgressRepository.upsert replaces an existing record", () => {
  const db = migratedDb();
  const repo = new ProgressRepository(db);
  repo.upsert({ exerciseId: "k8s-0001", trackId: "kubernetes", attemptCount: 1 });
  repo.upsert({ exerciseId: "k8s-0001", trackId: "kubernetes", attemptCount: 2 });
  const p = repo.get("k8s-0001", "kubernetes");
  assert.equal(p.attemptCount, 2);
  db.close();
});

test("ProgressRepository.forTrack returns all records for a track", () => {
  const db = migratedDb();
  const repo = new ProgressRepository(db);
  repo.upsert({ exerciseId: "k8s-0001", trackId: "kubernetes", attemptCount: 1 });
  repo.upsert({ exerciseId: "k8s-0002", trackId: "kubernetes", attemptCount: 2 });
  repo.upsert({ exerciseId: "other-001", trackId: "postgres", attemptCount: 1 });
  const k8s = repo.forTrack("kubernetes");
  assert.equal(k8s.length, 2);
  assert.ok(k8s.every((p) => p.trackId === "kubernetes"));
  db.close();
});

test("ProgressRepository.forTrack returns empty array for unknown track", () => {
  const db = migratedDb();
  const repo = new ProgressRepository(db);
  assert.deepEqual(repo.forTrack("no-such-track"), []);
  db.close();
});

test("ProgressRepository completed boolean round-trips correctly", () => {
  const db = migratedDb();
  const repo = new ProgressRepository(db);
  repo.upsert({ exerciseId: "a", trackId: "k", completed: true });
  repo.upsert({ exerciseId: "b", trackId: "k", completed: false });
  assert.equal(repo.get("a", "k").completed, true);
  assert.equal(repo.get("b", "k").completed, false);
  db.close();
});

test("ProgressRepository upsert defaults make a minimal insert valid", () => {
  const db = migratedDb();
  const repo = new ProgressRepository(db);
  assert.doesNotThrow(() => repo.upsert({ exerciseId: "x", trackId: "k" }));
  const p = repo.get("x", "k");
  assert.equal(p.completed, false);
  assert.equal(p.attemptCount, 0);
  assert.equal(p.bestScoreEarned, null);
  db.close();
});

// ── ResumeRepository ──────────────────────────────────────────────────────────

test("ResumeRepository.get returns null on an empty database", () => {
  const db = migratedDb();
  const repo = new ResumeRepository(db);
  assert.equal(repo.get(), null);
  db.close();
});

test("ResumeRepository.set stores and retrieves the resume state", () => {
  const db = migratedDb();
  const repo = new ResumeRepository(db);
  repo.set({
    trackId: "kubernetes",
    exerciseId: "k8s-0001",
    updatedAt: "2024-06-01T08:00:00.000Z",
  });
  const state = repo.get();
  assert.equal(state.trackId, "kubernetes");
  assert.equal(state.exerciseId, "k8s-0001");
  assert.equal(state.updatedAt, "2024-06-01T08:00:00.000Z");
  db.close();
});

test("ResumeRepository.set replaces previous state (at most one row)", () => {
  const db = migratedDb();
  const repo = new ResumeRepository(db);
  repo.set({ trackId: "kubernetes", exerciseId: "k8s-0001" });
  repo.set({ trackId: "kubernetes", exerciseId: "k8s-0002" });
  const state = repo.get();
  assert.equal(state.exerciseId, "k8s-0002");

  const count = db.prepare("SELECT COUNT(*) AS n FROM resume_state").get();
  assert.equal(count.n, 1);
  db.close();
});

test("ResumeRepository.set uses current time when updatedAt is omitted", () => {
  const db = migratedDb();
  const repo = new ResumeRepository(db);
  const before = new Date().toISOString();
  repo.set({ trackId: "kubernetes", exerciseId: "k8s-0001" });
  const after = new Date().toISOString();
  const state = repo.get();
  assert.ok(state.updatedAt >= before);
  assert.ok(state.updatedAt <= after);
  db.close();
});
