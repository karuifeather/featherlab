/**
 * Structured errors shared by every layer.
 *
 * `code` is a stable machine-readable identifier. `message` is safe to show to the
 * learner. `details` is optional structured context; it is for logs and tests and is
 * never serialized into API responses verbatim.
 */
export class FeatherLabError extends Error {
  constructor(code, message, { details, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

/** Exercise content failed to load or validate. `problems` lists every defect found. */
export class ContentError extends FeatherLabError {
  constructor(problems) {
    const lines = problems.map((p) => `  - ${p.file}${p.path ? ` [${p.path}]` : ""}: ${p.message}`);
    super("CONTENT_INVALID", `Invalid exercise content:\n${lines.join("\n")}`, {
      details: { problems },
    });
    this.problems = problems;
  }
}

export class NotFoundError extends FeatherLabError {
  constructor(message, details) {
    super("NOT_FOUND", message, { details });
  }
}

/** The caller supplied something unacceptable (bad id, bad filter, bad hint index). */
export class InputError extends FeatherLabError {
  constructor(message, details) {
    super("INVALID_INPUT", message, { details });
  }
}

/** Another lifecycle operation is already running against the same exercise. */
export class ConflictError extends FeatherLabError {
  constructor(message, details) {
    super("OPERATION_IN_PROGRESS", message, { details });
  }
}

/**
 * The environment (Docker, the workstation, the cluster) could not be reached or timed
 * out. `reason` is one of "unavailable" | "timeout" | "bad-response".
 */
export class EnvironmentError extends FeatherLabError {
  constructor(message, { reason = "unavailable", details, cause } = {}) {
    super("ENVIRONMENT_UNAVAILABLE", message, { details: { reason, ...details }, cause });
    this.reason = reason;
  }
}

/**
 * A lifecycle step failed part-way. Every step is idempotent, so the remedy is to run
 * the operation again; `details.completed` lists what had already succeeded.
 */
export class LifecycleError extends FeatherLabError {
  constructor(operation, step, message, { completed = [], cause } = {}) {
    super("LIFECYCLE_FAILED", message, { details: { operation, step, completed }, cause });
  }
}

/**
 * The exercise is not the one currently holding the shared practice environment, so its
 * cluster state cannot be trusted for grading. Opening (activating) it again fixes this.
 */
export class InactiveExerciseError extends FeatherLabError {
  constructor(message, details) {
    super("EXERCISE_NOT_ACTIVE", message, { details });
  }
}

/**
 * Opening the exercise would reset another exercise that currently owns the practice
 * environment. The caller must confirm (discard the active exercise's cluster work) first.
 * `details.activeExerciseId` names the exercise whose work would be lost.
 */
export class EnvironmentInUseError extends FeatherLabError {
  constructor(message, details) {
    super("ENVIRONMENT_IN_USE", message, { details });
  }
}

/**
 * The requested exercise is locked because one or more prerequisites have not been
 * completed yet. `details.unmetPrerequisites` lists the blocking exercise ids.
 */
export class LockedError extends FeatherLabError {
  constructor(message, details) {
    super("EXERCISE_LOCKED", message, { details });
  }
}
