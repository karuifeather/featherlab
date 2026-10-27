import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseAdapter } from "../../../src/infrastructure/persistence/database.mjs";

function tmpDir() {
  return mkdtempSync(path.join(os.tmpdir(), "featherlab-db-test-"));
}

// ── In-memory adapter ────────────────────────────────────────────────────────

test("DatabaseAdapter opens an in-memory database", () => {
  const db = new DatabaseAdapter(":memory:");
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
  db.close();
});

test("exec and prepare work for basic CRUD", () => {
  const db = new DatabaseAdapter(":memory:");
  db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, val TEXT)");
  const ins = db.prepare("INSERT INTO items (val) VALUES ($val)");
  ins.run({ $val: "hello" });
  ins.run({ $val: "world" });
  const rows = db.prepare("SELECT * FROM items ORDER BY id").all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].val, "hello");
  assert.equal(rows[1].val, "world");
  db.close();
});

// ── user_version ─────────────────────────────────────────────────────────────

test("getUserVersion returns 0 on a fresh database", () => {
  const db = new DatabaseAdapter(":memory:");
  assert.equal(db.getUserVersion(), 0);
  db.close();
});

test("setUserVersion stores and retrieves the version", () => {
  const db = new DatabaseAdapter(":memory:");
  db.setUserVersion(3);
  assert.equal(db.getUserVersion(), 3);
  db.close();
});

test("setUserVersion rejects non-integer values", () => {
  const db = new DatabaseAdapter(":memory:");
  assert.throws(() => db.setUserVersion(-1), /non-negative integer/);
  assert.throws(() => db.setUserVersion("oops"), /non-negative integer/);
  db.close();
});

// ── Transactions ─────────────────────────────────────────────────────────────

test("transaction commits on success", () => {
  const db = new DatabaseAdapter(":memory:");
  db.exec("CREATE TABLE t (n INTEGER)");
  db.transaction(() => {
    db.prepare("INSERT INTO t VALUES (?)").run(1);
    db.prepare("INSERT INTO t VALUES (?)").run(2);
  });
  const rows = db.prepare("SELECT n FROM t ORDER BY n").all();
  assert.deepEqual(
    rows.map((r) => r.n),
    [1, 2],
  );
  db.close();
});

test("transaction rolls back on error", () => {
  const db = new DatabaseAdapter(":memory:");
  db.exec("CREATE TABLE t (n INTEGER NOT NULL CHECK (n > 0))");
  assert.throws(() => {
    db.transaction(() => {
      db.prepare("INSERT INTO t VALUES (?)").run(5);
      db.prepare("INSERT INTO t VALUES (?)").run(-1); // violates CHECK
    });
  });
  const rows = db.prepare("SELECT * FROM t").all();
  assert.equal(rows.length, 0); // rolled back
  db.close();
});

test("transaction returns the value from fn", () => {
  const db = new DatabaseAdapter(":memory:");
  db.exec("CREATE TABLE t (n INTEGER)");
  const result = db.transaction(() => {
    db.prepare("INSERT INTO t VALUES (?)").run(42);
    return "done";
  });
  assert.equal(result, "done");
  db.close();
});

// ── On-disk persistence ───────────────────────────────────────────────────────

test("data persists across close and reopen", () => {
  const dir = tmpDir();
  try {
    const dbPath = path.join(dir, "test.sqlite");
    const db1 = new DatabaseAdapter(dbPath);
    db1.exec("CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, val TEXT)");
    db1.prepare("INSERT INTO items (val) VALUES (?)").run("persisted");
    db1.setUserVersion(1);
    db1.close();

    const db2 = new DatabaseAdapter(dbPath);
    assert.equal(db2.getUserVersion(), 1);
    const row = db2.prepare("SELECT val FROM items WHERE id = 1").get();
    assert.equal(row.val, "persisted");
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("DatabaseAdapter creates parent directories", () => {
  const dir = tmpDir();
  try {
    const dbPath = path.join(dir, "nested", "deep", "test.sqlite");
    const db = new DatabaseAdapter(dbPath);
    db.exec("CREATE TABLE t (x INTEGER)");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a corrupted database file throws rather than silently replacing it", () => {
  const dir = tmpDir();
  try {
    const dbPath = path.join(dir, "corrupt.sqlite");
    writeFileSync(dbPath, "this is not a valid sqlite file");
    assert.throws(() => new DatabaseAdapter(dbPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
