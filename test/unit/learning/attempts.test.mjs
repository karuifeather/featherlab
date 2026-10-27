import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseAdapter } from "../../../src/infrastructure/persistence/database.mjs";
import { runMigrations } from "../../../src/infrastructure/persistence/migrate.mjs";
import { AttemptsRepository } from "../../../src/infrastructure/persistence/repositories/attempts.mjs";
import { ProgressRepository } from "../../../src/infrastructure/persistence/repositories/progress.mjs";
import { ResumeRepository } from "../../../src/infrastructure/persistence/repositories/resume.mjs";
import { AttemptsService } from "../../../src/application/learning/attempts-service.mjs";

function migratedPersistence() {
  const db = new DatabaseAdapter(":memory:");
  runMigrations(db);
  return {
    attempts: new AttemptsRepository(db),
    progress: new ProgressRepository(db),
    resume: new ResumeRepository(db),
    transaction(fn) {
      return db.transaction(fn);
    },
    close() {
      db.close();
    },
    _db: db,
  };
}

const exercise = { id: "k8s-0001", track: "kubernetes" };
const passed = { outcome: "passed", score: { earned: 4, possible: 4 } };
const failed = { outcome: "failed", score: { earned: 2, possible: 4 } };
const incomplete = { outcome: "incomplete", score: { earned: 0, possible: 4 } };

// ── Passed attempt ────────────────────────────────────────────────────────────

test("AttemptsService records a passed attempt and returns updated progress", () => {
  const p = migratedPersistence();
  const svc = new AttemptsService({ persistence: p });
  const prog = svc.record({ exercise, gradingResult: passed });
  assert.ok(prog !== null);
  assert.equal(prog.completed, true);
  assert.equal(prog.attemptCount, 1);
  assert.equal(prog.bestScoreEarned, 4);
  assert.equal(p.attempts.byExercise(exercise.id).length, 1);
  p.close();
});

// ── Failed attempt ────────────────────────────────────────────────────────────

test("AttemptsService records a failed attempt; completed stays false", () => {
  const p = migratedPersistence();
  const svc = new AttemptsService({ persistence: p });
  const prog = svc.record({ exercise, gradingResult: failed });
  assert.ok(prog !== null);
  assert.equal(prog.completed, false);
  assert.equal(prog.attemptCount, 1);
  assert.equal(p.attempts.byExercise(exercise.id).length, 1);
  p.close();
});

// ── Incomplete not recorded ───────────────────────────────────────────────────

test("AttemptsService does not record incomplete (infra error) results", () => {
  const p = migratedPersistence();
  const svc = new AttemptsService({ persistence: p });
  const result = svc.record({ exercise, gradingResult: incomplete });
  assert.equal(result, null);
  assert.equal(p.attempts.byExercise(exercise.id).length, 0);
  assert.equal(p.progress.get(exercise.id, exercise.track), null);
  p.close();
});

// ── Repeated attempts ─────────────────────────────────────────────────────────

test("repeated attempts each create a separate history record", () => {
  const p = migratedPersistence();
  const svc = new AttemptsService({ persistence: p });
  svc.record({ exercise, gradingResult: failed });
  svc.record({ exercise, gradingResult: passed });
  const attempts = p.attempts.byExercise(exercise.id);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].outcome, "failed");
  assert.equal(attempts[1].outcome, "passed");
  p.close();
});

// ── Completion is monotonic ───────────────────────────────────────────────────

test("failure after success does not reverse completion", () => {
  const p = migratedPersistence();
  const svc = new AttemptsService({ persistence: p });
  svc.record({ exercise, gradingResult: passed });
  const prog = svc.record({ exercise, gradingResult: failed });
  assert.equal(prog.completed, true);
  assert.equal(prog.attemptCount, 2);
  p.close();
});

// ── Correct fields stored ─────────────────────────────────────────────────────

test("attempt record stores correct exercise id, track, outcome, score", () => {
  const p = migratedPersistence();
  const svc = new AttemptsService({ persistence: p });
  svc.record({ exercise, gradingResult: passed, durationMs: 5000 });
  const [a] = p.attempts.byExercise(exercise.id);
  assert.equal(a.exerciseId, exercise.id);
  assert.equal(a.trackId, exercise.track);
  assert.equal(a.outcome, "passed");
  assert.equal(a.scoreEarned, 4);
  assert.equal(a.scorePossible, 4);
  assert.equal(a.durationMs, 5000);
  p.close();
});

// ── Atomicity ─────────────────────────────────────────────────────────────────

test("transaction failure leaves attempt and progress tables both empty", () => {
  const p = migratedPersistence();
  // Corrupt the progress table to force the upsert to fail.
  p._db.exec("DROP TABLE exercise_progress");
  const svc = new AttemptsService({ persistence: p });
  assert.throws(() => svc.record({ exercise, gradingResult: passed }));
  // exercise_attempts should also be empty (rolled back).
  p._db.exec(`
    CREATE TABLE exercise_progress (
      exercise_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      best_score_earned INTEGER,
      best_score_possible INTEGER,
      completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
      first_completed_at TEXT,
      last_attempted_at TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      PRIMARY KEY (exercise_id, track_id)
    )
  `);
  assert.equal(p.attempts.byExercise(exercise.id).length, 0);
  p.close();
});
