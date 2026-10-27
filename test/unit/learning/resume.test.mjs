import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseAdapter } from "../../../src/infrastructure/persistence/database.mjs";
import { runMigrations } from "../../../src/infrastructure/persistence/migrate.mjs";
import { ProgressRepository } from "../../../src/infrastructure/persistence/repositories/progress.mjs";
import { ResumeRepository } from "../../../src/infrastructure/persistence/repositories/resume.mjs";
import { ProgressionService } from "../../../src/application/learning/progression-service.mjs";
import { ResumeService } from "../../../src/application/learning/resume-service.mjs";
import { LockedError, NotFoundError } from "../../../src/core/errors.mjs";
import { appFor, exerciseFiles } from "../../helpers/content.mjs";
import { createFakeCluster } from "../../helpers/fake-cluster.mjs";

function setup(registryOrFiles) {
  const registry =
    typeof registryOrFiles === "object" && "get" in registryOrFiles
      ? registryOrFiles
      : appFor(registryOrFiles, createFakeCluster()).registry;

  const db = new DatabaseAdapter(":memory:");
  runMigrations(db);
  const progress = new ProgressRepository(db);
  const resume = new ResumeRepository(db);
  const progression = new ProgressionService({ registry, progress });
  const svc = new ResumeService({ resume, registry, progression });
  return { svc, progress, resume, progression, db };
}

// ── getResume with no history ─────────────────────────────────────────────────

test("getResume returns the first available exercise as fallback when no selection stored", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
  };
  const { svc, db } = setup(files);
  const resume = svc.getResume();
  assert.ok(resume !== null);
  assert.equal(resume.exerciseId, "demo-0001");
  assert.equal(resume.fallback, true);
  assert.equal(resume.updatedAt, null);
  db.close();
});

test("getResume returns null when no exercises exist", () => {
  // Use a registry that has no exercises via a minimal stub.
  const emptyRegistry = {
    get: () => null,
    require: () => {
      throw new NotFoundError("not found");
    },
    list: () => [],
  };
  const db = new DatabaseAdapter(":memory:");
  runMigrations(db);
  const resume = new ResumeRepository(db);
  const progression = new ProgressionService({
    registry: emptyRegistry,
    progress: new ProgressRepository(db),
  });
  const svc = new ResumeService({ resume, registry: emptyRegistry, progression });
  assert.equal(svc.getResume(), null);
  db.close();
});

// ── select and getResume ──────────────────────────────────────────────────────

test("select stores the exercise selection; getResume returns it", () => {
  const { svc, db } = setup(exerciseFiles("001-a"));
  svc.select("demo-0001");
  const resume = svc.getResume();
  assert.equal(resume.exerciseId, "demo-0001");
  assert.equal(resume.trackId, "kubernetes");
  assert.equal(resume.fallback, false);
  assert.ok(resume.updatedAt !== null);
  db.close();
});

test("selecting a different exercise replaces the previous selection", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002" }),
  };
  const { svc, db } = setup(files);
  svc.select("demo-0001");
  svc.select("demo-0002");
  assert.equal(svc.getResume().exerciseId, "demo-0002");
  db.close();
});

// ── Lock enforcement in select ────────────────────────────────────────────────

test("select throws LockedError for a locked exercise", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
  };
  const { svc, db } = setup(files);
  assert.throws(() => svc.select("demo-0002"), LockedError);
  db.close();
});

test("select throws NotFoundError for an unknown exercise", () => {
  const { svc, db } = setup(exerciseFiles("001-a"));
  assert.throws(() => svc.select("ghost-0001"), NotFoundError);
  db.close();
});

// ── Fallback when stored selection is invalid ─────────────────────────────────

test("getResume falls back when stored exercise is now locked", () => {
  const files = {
    ...exerciseFiles("001-a"),
    ...exerciseFiles("002-b", { id: "demo-0002", prerequisites: ["demo-0001"] }),
  };
  const { svc, resume, db } = setup(files);
  // Store a selection for demo-0002 by writing directly (bypassing lock check).
  resume.set({ trackId: "kubernetes", exerciseId: "demo-0002" });
  // demo-0002 is locked (demo-0001 not completed) → should fall back to demo-0001.
  const result = svc.getResume();
  assert.equal(result.exerciseId, "demo-0001");
  assert.equal(result.fallback, true);
  db.close();
});

test("getResume falls back when stored exercise is removed from registry (unknown id)", () => {
  // Registry only has demo-0001, but resume stores a removed exercise.
  const { svc, resume, db } = setup(exerciseFiles("001-a"));
  resume.set({ trackId: "kubernetes", exerciseId: "removed-0001" });
  const result = svc.getResume();
  // Falls back to demo-0001 (the only available exercise).
  assert.equal(result.exerciseId, "demo-0001");
  assert.equal(result.fallback, true);
  db.close();
});

// ── Restart preserves selection ───────────────────────────────────────────────

test("resume state survives close and reopen of the repository", () => {
  // Simulate re-creating the repository on top of the same DB.
  const { svc, db } = setup(exerciseFiles("001-a"));
  svc.select("demo-0001");

  // Verify the stored selection using a fresh repository instance on the same DB.
  const raw = new ResumeRepository(db);
  const stored = raw.get();
  assert.equal(stored.exerciseId, "demo-0001");
  db.close();
});
