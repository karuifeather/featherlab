import { check } from "../schema.mjs";

export const SCHEMA_VERSION = 1;
export const EXERCISE_TYPES = Object.freeze(["task"]);
export const DIFFICULTIES = Object.freeze(["beginner", "intermediate", "advanced"]);

export const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Files referenced from a definition must stay inside the exercise directory.
const RELATIVE_PATH = /^(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

export const relativePathSpec = {
  type: "string",
  maxLength: 200,
  pattern: RELATIVE_PATH,
  patternHint: "must be a relative path inside the exercise directory (no '..', no leading '/')",
};

const CHECK_ENVELOPE = {
  type: "object",
  properties: {
    id: { type: "string", required: true, maxLength: 63, pattern: ID_PATTERN },
    type: { type: "string", required: true },
    label: { type: "string", required: true, minLength: 1, maxLength: 200 },
    weight: { type: "number", min: 0.01, max: 1000 },
    hidden: { type: "boolean" },
    params: { type: "object", open: true },
  },
};

const EXERCISE_SPEC = {
  type: "object",
  required: true,
  properties: {
    schemaVersion: { type: "integer", required: true, enum: [SCHEMA_VERSION] },
    id: { type: "string", required: true, maxLength: 63, pattern: ID_PATTERN },
    type: { type: "string", required: true, enum: EXERCISE_TYPES },
    title: { type: "string", required: true, minLength: 1, maxLength: 120 },
    summary: { type: "string", required: true, minLength: 1, maxLength: 300 },
    track: { type: "string", required: true, pattern: TAG_PATTERN },
    level: { type: "integer", required: true, min: 0, max: 99 },
    // Position within the level (1 = first). Curriculum order is not id order: a stable id
    // keeps its meaning when an exercise moves, so new exercises can sit between old ones.
    order: { type: "integer", min: 1, max: 999 },
    difficulty: { type: "string", required: true, enum: DIFFICULTIES },
    estimatedMinutes: { type: "integer", required: true, min: 1, max: 600 },
    tags: { type: "array", items: { type: "string", pattern: TAG_PATTERN, maxLength: 40 } },
    prerequisites: { type: "array", items: { type: "string", pattern: ID_PATTERN } },
    content: {
      type: "object",
      properties: { description: relativePathSpec, solution: relativePathSpec },
    },
    requirements: {
      type: "array",
      required: true,
      minItems: 1,
      items: { type: "string", minLength: 1, maxLength: 400 },
    },
    hints: { type: "array", items: { type: "string", minLength: 1, maxLength: 1000 } },
    environment: {
      type: "object",
      required: true,
      properties: { profile: { type: "string", required: true, pattern: TAG_PATTERN } },
    },
    lifecycle: { type: "object", open: true },
    checks: { type: "array", required: true, minItems: 1, items: CHECK_ENVELOPE },
  },
};

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function readFile(reader, relativePath, path, problems) {
  try {
    return reader.readText(relativePath);
  } catch (error) {
    problems.add(path, `cannot read "${relativePath}": ${error.message}`);
    return undefined;
  }
}

/**
 * Validate one raw exercise document and return the normalized, frozen exercise.
 *
 * Structural validation (this file) is track-independent. Anything that depends on the
 * track (profiles, validator types and params, lifecycle section) is delegated to the
 * track and the validator registry, so the core never learns what a "Pod" is.
 *
 * Returns `undefined` when defects were recorded on `problems`.
 *
 * Normalized exercise layout:
 *   public:   id, type, title, summary, track, level, difficulty, estimatedMinutes, tags,
 *             prerequisites, requirements, hints, description, environment
 *   private:  checks, lifecycle, solution, source   (never leave the application layer)
 */
export function defineExercise({ data, reader, tracks, validators, problems, source }) {
  const before = problems.list.length;
  check(data, EXERCISE_SPEC, "", problems);
  if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
  const structural = problems.list.length === before;

  const track = tracks.get(data.track);
  if (typeof data.track === "string" && !track)
    problems.add("track", `unknown track "${data.track}" (known: ${tracks.ids().join(", ")})`);

  if (track && data.environment && typeof data.environment.profile === "string") {
    if (!track.profiles.includes(data.environment.profile))
      problems.add(
        "environment.profile",
        `track "${track.id}" does not provide profile "${data.environment.profile}" (available: ${track.profiles.join(", ")})`,
      );
  }

  let lifecycle;
  if (track) {
    lifecycle = track.compileLifecycle(data.lifecycle ?? {}, {
      exerciseId: data.id,
      reader,
      problems: problems.scoped("lifecycle"),
    });
  }

  if (Array.isArray(data.checks) && track) {
    const seen = new Set();
    data.checks.forEach((c, i) => {
      if (c && typeof c.id === "string") {
        if (seen.has(c.id)) problems.add(`checks[${i}].id`, `duplicate check id "${c.id}"`);
        seen.add(c.id);
      }
      validators.validateCheck(c, { track: track.id, problems, path: `checks[${i}]` });
    });
    track.validateCheckScope?.(data.checks, lifecycle, { problems });
  }

  const content = data.content ?? {};
  const descriptionFile = content.description ?? "description.md";
  const description = readFile(reader, descriptionFile, "content.description", problems);
  const solution = content.solution
    ? readFile(reader, content.solution, "content.solution", problems)
    : undefined;

  if (!structural || problems.list.length > before) return undefined;

  return deepFreeze({
    schemaVersion: data.schemaVersion,
    id: data.id,
    type: data.type,
    title: data.title,
    summary: data.summary,
    track: data.track,
    level: data.level,
    order: data.order,
    difficulty: data.difficulty,
    estimatedMinutes: data.estimatedMinutes,
    tags: [...(data.tags ?? [])],
    prerequisites: [...(data.prerequisites ?? [])],
    requirements: [...data.requirements],
    hints: [...(data.hints ?? [])],
    description: description.trim(),
    environment: { profile: data.environment.profile },
    checks: data.checks.map((c) => ({
      id: c.id,
      type: c.type,
      label: c.label,
      weight: c.weight ?? 1,
      hidden: c.hidden === true,
      params: structuredClone(c.params ?? {}),
    })),
    lifecycle,
    solution: solution?.trim(),
    source,
  });
}
