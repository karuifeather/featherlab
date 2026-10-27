import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseAdapter } from "../../../src/infrastructure/persistence/database.mjs";
import {
  runMigrations,
  CURRENT_VERSION,
} from "../../../src/infrastructure/persistence/migrate.mjs";

function freshDb() {
  return new DatabaseAdapter(":memory:");
}

// ── Basic migration execution ─────────────────────────────────────────────────

test("empty database migrates to CURRENT_VERSION", () => {
  const db = freshDb();
  assert.equal(db.getUserVersion(), 0);
  runMigrations(db);
  assert.equal(db.getUserVersion(), CURRENT_VERSION);
  db.close();
});

test("all expected tables exist after migration", () => {
  const db = freshDb();
  runMigrations(db);

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => r.name);

  assert.ok(tables.includes("exercise_attempts"), "exercise_attempts table missing");
  assert.ok(tables.includes("exercise_progress"), "exercise_progress table missing");
  assert.ok(tables.includes("resume_state"), "resume_state table missing");
  db.close();
});

test("all expected indexes exist after migration", () => {
  const db = freshDb();
  runMigrations(db);

  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
    .all()
    .map((r) => r.name);

  assert.ok(
    indexes.includes("exercise_attempts_exercise_idx"),
    "exercise_attempts_exercise_idx missing",
  );
  assert.ok(indexes.includes("exercise_attempts_track_idx"), "exercise_attempts_track_idx missing");
  assert.ok(indexes.includes("exercise_attempts_time_idx"), "exercise_attempts_time_idx missing");
  db.close();
});

// ── Idempotency ───────────────────────────────────────────────────────────────

test("running migrations twice is idempotent", () => {
  const db = freshDb();
  runMigrations(db);
  assert.doesNotThrow(() => runMigrations(db));
  assert.equal(db.getUserVersion(), CURRENT_VERSION);
  db.close();
});

test("running migrations on an already-current schema changes nothing", () => {
  const db = freshDb();
  runMigrations(db);

  // Insert a row so we can verify it survives the second call.
  db.prepare(
    "INSERT INTO exercise_attempts (exercise_id, track_id, attempted_at, outcome) VALUES (?, ?, ?, ?)",
  ).run("ex-1", "kubernetes", new Date().toISOString(), "passed");

  runMigrations(db); // Should be a no-op.

  const rows = db.prepare("SELECT * FROM exercise_attempts").all();
  assert.equal(rows.length, 1, "existing data was deleted by a spurious re-migration");
  db.close();
});

// ── Future-schema guard ───────────────────────────────────────────────────────

test("database with a future schema version is refused, not silently wiped", () => {
  const db = freshDb();
  runMigrations(db);
  // Simulate opening a database written by a newer CLI.
  db.setUserVersion(CURRENT_VERSION + 1);

  const db2 = freshDb();
  db2.setUserVersion(CURRENT_VERSION + 1);

  assert.throws(() => runMigrations(db2), /newer than this version/);
  db.close();
  db2.close();
});

// ── Schema constraints ────────────────────────────────────────────────────────

test("exercise_attempts rejects an invalid outcome value", () => {
  const db = freshDb();
  runMigrations(db);
  assert.throws(() => {
    db.prepare(
      "INSERT INTO exercise_attempts (exercise_id, track_id, attempted_at, outcome) VALUES (?, ?, ?, ?)",
    ).run("ex-1", "k8s", new Date().toISOString(), "invalid-outcome");
  });
  db.close();
});

test("exercise_attempts rejects negative score_earned", () => {
  const db = freshDb();
  runMigrations(db);
  assert.throws(() => {
    db.prepare(
      `INSERT INTO exercise_attempts
         (exercise_id, track_id, attempted_at, outcome, score_earned, score_possible)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("ex-1", "k8s", new Date().toISOString(), "passed", -1, 4);
  });
  db.close();
});

test("exercise_attempts rejects score_earned > score_possible", () => {
  const db = freshDb();
  runMigrations(db);
  assert.throws(() => {
    db.prepare(
      `INSERT INTO exercise_attempts
         (exercise_id, track_id, attempted_at, outcome, score_earned, score_possible)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("ex-1", "k8s", new Date().toISOString(), "passed", 5, 4);
  });
  db.close();
});

test("resume_state enforces at most one row", () => {
  const db = freshDb();
  runMigrations(db);
  db.prepare(
    "INSERT INTO resume_state (id, track_id, exercise_id, updated_at) VALUES (1, ?, ?, ?)",
  ).run("kubernetes", "k8s-0001", new Date().toISOString());
  // A second INSERT with id=1 must fail the CHECK constraint.
  assert.throws(() => {
    db.prepare(
      "INSERT INTO resume_state (id, track_id, exercise_id, updated_at) VALUES (2, ?, ?, ?)",
    ).run("kubernetes", "k8s-0002", new Date().toISOString());
  });
  db.close();
});
