import * as migration001 from "./migrations/001-initial.mjs";
import * as migration002 from "./migrations/002-active-environment.mjs";
import * as migration003 from "./migrations/003-environment-state.mjs";

/**
 * Ordered list of all migrations. Each entry must have:
 *   version     {number}  — monotonically increasing integer (matches PRAGMA user_version after apply)
 *   description {string}  — human-readable summary
 *   up(db)      {function} — applies DDL changes; called inside a transaction
 *
 * Never remove or reorder entries. Migrations are immutable once released.
 * Add new migrations at the end.
 */
const MIGRATIONS = [migration001, migration002, migration003];

// Verify the list is ordered and has no gaps (catches accidental edits).
for (let i = 0; i < MIGRATIONS.length; i++) {
  if (MIGRATIONS[i].version !== i + 1) {
    throw new Error(
      `Migration list is inconsistent: expected version ${i + 1}, got ${MIGRATIONS[i].version}`,
    );
  }
}

/** The schema version this code understands. */
export const CURRENT_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Bring `db` to the latest schema version.
 *
 * Behaviour:
 *   - Empty database (user_version = 0) → applies all migrations in order.
 *   - Already at CURRENT_VERSION → no changes.
 *   - At a version between 0 and CURRENT_VERSION → applies pending migrations only.
 *   - At a version HIGHER than CURRENT_VERSION → throws to prevent data loss from a
 *     future version of the database being opened by an older CLI.
 *
 * Each migration runs inside its own BEGIN IMMEDIATE / COMMIT block, so a failed migration
 * leaves the database at the last successfully applied version rather than in a partial state.
 * The user_version PRAGMA update is part of the same transaction as the DDL changes.
 *
 * @param {import('./database.mjs').DatabaseAdapter} db
 * @throws {Error} if the database has a schema version newer than CURRENT_VERSION.
 * @throws {Error} if a migration fails (the database is left at the last good version).
 */
export function runMigrations(db) {
  const current = db.getUserVersion();

  if (current > CURRENT_VERSION) {
    throw new Error(
      `Database schema version ${current} is newer than this version of FeatherLab supports ` +
        `(max: ${CURRENT_VERSION}). Upgrade the CLI to continue.`,
    );
  }

  if (current === CURRENT_VERSION) return;

  const pending = MIGRATIONS.filter((m) => m.version > current);

  for (const migration of pending) {
    db.transaction(() => {
      migration.up(db);
      // Set the version inside the same transaction so version and schema stay in sync.
      db.setUserVersion(migration.version);
    });
  }
}
