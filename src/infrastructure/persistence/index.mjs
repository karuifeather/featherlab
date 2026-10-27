import path from "node:path";
import { DatabaseAdapter } from "./database.mjs";
import { runMigrations } from "./migrate.mjs";
import { ActiveEnvironmentRepository } from "./repositories/active-environment.mjs";
import { AttemptsRepository } from "./repositories/attempts.mjs";
import { ProgressRepository } from "./repositories/progress.mjs";
import { ResumeRepository } from "./repositories/resume.mjs";

export { CURRENT_VERSION } from "./migrate.mjs";

/**
 * Build the full persistence stack for one FeatherLab instance.
 *
 * Opens (or creates) the SQLite database, runs any pending migrations, and returns
 * the repositories plus a `close()` disposal method.
 *
 * Initialization is idempotent: calling this on an already-migrated database applies
 * no changes. It never deletes or recreates the database file.
 *
 * @param {object} options
 * @param {string} options.stateDir - Absolute path to the FeatherLab state directory
 *                                    (typically ~/.featherlab or $FEATHERLAB_STATE_DIR).
 * @returns {{
 *   attempts: import('./repositories/attempts.mjs').AttemptsRepository,
 *   progress: import('./repositories/progress.mjs').ProgressRepository,
 *   resume:   import('./repositories/resume.mjs').ResumeRepository,
 *   environment: import('./repositories/active-environment.mjs').ActiveEnvironmentRepository,
 *   close():  void
 * }}
 * @throws {Error} if the database cannot be opened, migrated, or if the existing
 *                 schema version is newer than this release supports.
 */
export function createPersistence({ stateDir }) {
  const dbPath = path.join(stateDir, "progress.sqlite");
  const db = new DatabaseAdapter(dbPath);
  try {
    runMigrations(db);
  } catch (err) {
    db.close();
    throw err;
  }
  return {
    attempts: new AttemptsRepository(db),
    progress: new ProgressRepository(db),
    resume: new ResumeRepository(db),
    environment: new ActiveEnvironmentRepository(db),
    transaction(fn) {
      return db.transaction(fn);
    },
    close() {
      db.close();
    },
  };
}
