import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseAdapter } from "../../../src/infrastructure/persistence/database.mjs";
import { runMigrations } from "../../../src/infrastructure/persistence/migrate.mjs";
import { ProgressRepository } from "../../../src/infrastructure/persistence/repositories/progress.mjs";
import { ProgressionService } from "../../../src/application/learning/progression-service.mjs";
import { appFor, exerciseFiles } from "../../helpers/content.mjs";
import { createFakeCluster } from "../../helpers/fake-cluster.mjs";

function migratedDb() {
  const db = new DatabaseAdapter(":memory:");
  runMigrations(db);
  return db;
}

function makeProgression(registry, db) {
  const progress = new ProgressRepository(db);
  return { progression: new ProgressionService({ registry, progress }), progress, db };
}

function markCompleted(progress, exerciseId, trackId) {
  progress.upsert({ exerciseId, trackId, completed: true, attemptCount: 1 });
}

// ── Exercises without prerequisites ──────────────────────────────────────────

test("no-prerequisite exercise is available when no history exists", () => {
  const { registry } = appFor(exerciseFiles("001-a"), createFakeCluster());
  const db = migratedDb();
  const { progression } = makeProgression(registry, db);
  const avail = progression.getAvailability("demo-0001");
  assert.equal(avail.state, "available");
  assert.deepEqual(avail.unmetPrerequisites, []);
  db.close();
});

test("no-prerequisite exercise becomes completed after a successful attempt", () => {
  const { registry } = appFor(exerciseFiles("001-a"), createFakeCluster());
  const db = migratedDb();
  const { progression, progress } = makeProgression(registry, db);
  markCompleted(progress, "demo-0001", "kubernetes");
  assert.equal(progression.getAvailability("demo-0001").state, "completed");
  db.close();
});

// ── Exercises with prerequisites ──────────────────────────────────────────────

test("exercise with unmet prerequisite is locked", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
  };
  const { registry } = appFor(files, createFakeCluster());
  const db = migratedDb();
  const { progression } = makeProgression(registry, db);
  const avail = progression.getAvailability("demo-0002");
  assert.equal(avail.state, "locked");
  assert.deepEqual(avail.unmetPrerequisites, ["demo-0001"]);
  db.close();
});

test("exercise unlocks when its prerequisite is completed", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
  };
  const { registry } = appFor(files, createFakeCluster());
  const db = migratedDb();
  const { progression, progress } = makeProgression(registry, db);
  markCompleted(progress, "demo-0001", "kubernetes");
  assert.equal(progression.getAvailability("demo-0002").state, "available");
  db.close();
});

test("exercise with multiple prerequisites: partially satisfied stays locked", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002" }),
    ...exerciseFiles("003-c", { id: "demo-0003", prerequisites: ["demo-0001", "demo-0002"] }),
  };
  const { registry } = appFor(files, createFakeCluster());
  const db = migratedDb();
  const { progression, progress } = makeProgression(registry, db);
  markCompleted(progress, "demo-0001", "kubernetes");
  const avail = progression.getAvailability("demo-0003");
  assert.equal(avail.state, "locked");
  assert.deepEqual(avail.unmetPrerequisites, ["demo-0002"]);
  db.close();
});

test("exercise with multiple prerequisites: all satisfied becomes available", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002" }),
    ...exerciseFiles("003-c", { id: "demo-0003", prerequisites: ["demo-0001", "demo-0002"] }),
  };
  const { registry } = appFor(files, createFakeCluster());
  const db = migratedDb();
  const { progression, progress } = makeProgression(registry, db);
  markCompleted(progress, "demo-0001", "kubernetes");
  markCompleted(progress, "demo-0002", "kubernetes");
  assert.equal(progression.getAvailability("demo-0003").state, "available");
  db.close();
});

test("completed exercise remains completed even after a further failed attempt", () => {
  const { registry } = appFor(exerciseFiles("001-a"), createFakeCluster());
  const db = migratedDb();
  const { progression, progress } = makeProgression(registry, db);
  markCompleted(progress, "demo-0001", "kubernetes");
  // Simulate a subsequent failed attempt (still completed=true in the record)
  progress.upsert({
    exerciseId: "demo-0001",
    trackId: "kubernetes",
    completed: true,
    attemptCount: 2,
  });
  assert.equal(progression.getAvailability("demo-0001").state, "completed");
  db.close();
});

test("getAvailability returns null for unknown exercise id", () => {
  const { registry } = appFor(exerciseFiles("001-a"), createFakeCluster());
  const db = migratedDb();
  const { progression } = makeProgression(registry, db);
  assert.equal(progression.getAvailability("ghost-0001"), null);
  db.close();
});

// ── getTrackProgress ──────────────────────────────────────────────────────────

test("getTrackProgress returns all exercises in registry order", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
  };
  const { registry } = appFor(files, createFakeCluster());
  const db = migratedDb();
  const { progression } = makeProgression(registry, db);
  const list = progression.getTrackProgress("kubernetes");
  assert.equal(list.length, 2);
  assert.equal(list[0].exerciseId, "demo-0001");
  assert.equal(list[0].state, "available");
  assert.equal(list[1].exerciseId, "demo-0002");
  assert.equal(list[1].state, "locked");
  db.close();
});

test("getTrackProgress reflects completion after marking", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
  };
  const { registry } = appFor(files, createFakeCluster());
  const db = migratedDb();
  const { progression, progress } = makeProgression(registry, db);
  markCompleted(progress, "demo-0001", "kubernetes");
  const list = progression.getTrackProgress("kubernetes");
  assert.equal(list[0].state, "completed");
  assert.equal(list[0].completed, true);
  assert.equal(list[1].state, "available");
  db.close();
});

test("getExerciseDetails returns full progress record", () => {
  const { registry } = appFor(exerciseFiles("001-a"), createFakeCluster());
  const db = migratedDb();
  const { progression, progress } = makeProgression(registry, db);
  progress.upsert({
    exerciseId: "demo-0001",
    trackId: "kubernetes",
    completed: true,
    attemptCount: 3,
    bestScoreEarned: 4,
    bestScorePossible: 4,
    firstCompletedAt: "2024-01-01T00:00:00.000Z",
    lastAttemptedAt: "2024-01-02T00:00:00.000Z",
  });
  const details = progression.getExerciseDetails("demo-0001");
  assert.equal(details.state, "completed");
  assert.equal(details.completed, true);
  assert.equal(details.attemptCount, 3);
  assert.equal(details.bestScoreEarned, 4);
  assert.equal(details.firstCompletedAt, "2024-01-01T00:00:00.000Z");
  db.close();
});
