import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Thin adapter over node:sqlite's DatabaseSync.
 *
 * Responsibilities:
 *   - Open or create the database file, creating parent directories.
 *   - Configure WAL journal mode and a busy timeout so concurrent processes
 *     (e.g. a second CLI invocation) wait briefly rather than failing immediately.
 *   - Expose exec(), prepare(), transaction(), user_version helpers, and close().
 *
 * Nothing above this layer depends on DatabaseSync directly.
 *
 * Node.js compatibility note:
 *   node:sqlite is stable in Node.js 24+. Node.js 22.x requires the
 *   --experimental-sqlite flag. See docs/architecture.md for details.
 */
export class DatabaseAdapter {
  #db;

  /**
   * @param {string} dbPath - Absolute path to the SQLite file (or ':memory:' for tests).
   */
  constructor(dbPath) {
    if (dbPath !== ":memory:") {
      mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
    }
    this.#db = new DatabaseSync(dbPath);

    // WAL mode enables concurrent readers alongside one writer; safe for a single-user CLI.
    // journal_mode pragma must be set before busy_timeout on some SQLite builds.
    this.#db.exec("PRAGMA journal_mode = WAL");

    // Wait up to 5 s if another process holds a write lock before failing.
    this.#db.exec("PRAGMA busy_timeout = 5000");

    // Enforce referential integrity; harmless here but good hygiene.
    this.#db.exec("PRAGMA foreign_keys = ON");
  }

  /**
   * Execute one or more SQL statements with no result (DDL, PRAGMA, multi-statement scripts).
   * @param {string} sql
   */
  exec(sql) {
    this.#db.exec(sql);
  }

  /**
   * Compile and return a prepared statement.
   * @param {string} sql
   * @returns {import('node:sqlite').StatementSync}
   */
  prepare(sql) {
    return this.#db.prepare(sql);
  }

  /**
   * Run `fn` inside an explicit BEGIN IMMEDIATE / COMMIT block.
   * Rolls back and rethrows on any error.
   *
   * BEGIN IMMEDIATE acquires a write lock at the start, preventing SQLITE_BUSY
   * mid-transaction when WAL mode is active.
   *
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  transaction(fn) {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.#db.exec("COMMIT");
      return result;
    } catch (err) {
      try {
        this.#db.exec("ROLLBACK");
      } catch {
        // Ignore rollback errors — the original error is the one to surface.
      }
      throw err;
    }
  }

  /**
   * Read the PRAGMA user_version used to track the schema version.
   * @returns {number}
   */
  getUserVersion() {
    return this.#db.prepare("PRAGMA user_version").get().user_version;
  }

  /**
   * Persist the schema version. Must be called inside a transaction that also applies
   * the corresponding DDL changes so version and schema stay in sync.
   *
   * PRAGMA user_version does not accept parameter binding, so the integer is inlined
   * after explicit validation.
   * @param {number} version
   */
  setUserVersion(version) {
    const v = Number(version);
    if (!Number.isInteger(v) || v < 0)
      throw new TypeError(`user_version must be a non-negative integer; got ${version}`);
    this.#db.exec(`PRAGMA user_version = ${v}`);
  }

  /**
   * Close the database connection. Flushes WAL frames and releases the file lock.
   * Safe to call multiple times (subsequent calls are no-ops at the OS level).
   */
  close() {
    this.#db.close();
  }
}
