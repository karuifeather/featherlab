import { ContentError, NotFoundError } from "../errors.mjs";
import { Problems } from "../schema.mjs";
import { defineExercise } from "./definition.mjs";

const collator = new Intl.Collator("en", { numeric: true });

function detectCycles(exercises, byId, problems) {
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map(exercises.map((e) => [e.id, WHITE]));

  function visit(id, path) {
    if (color.get(id) === BLACK) return;
    if (color.get(id) === GRAY) {
      const start = path.indexOf(id);
      const cycle = [...path.slice(start), id].join(" → ");
      problems.push({
        file: byId.get(id)?.source ?? "unknown",
        path: "prerequisites",
        message: `circular dependency detected: ${cycle}`,
      });
      return;
    }
    color.set(id, GRAY);
    for (const prereq of byId.get(id)?.prerequisites ?? []) {
      if (byId.has(prereq)) visit(prereq, [...path, id]);
    }
    color.set(id, BLACK);
  }

  for (const exercise of exercises) {
    if (color.get(exercise.id) === WHITE) visit(exercise.id, []);
  }
}

/** Exercises without an explicit `order` follow the ordered ones, by id. */
const positionOf = (e) => e.order ?? Number.POSITIVE_INFINITY;

function byOrder(a, b) {
  return (
    collator.compare(a.track, b.track) ||
    a.level - b.level ||
    positionOf(a) - positionOf(b) ||
    collator.compare(a.id, b.id)
  );
}

/**
 * In-memory index of validated exercises. Immutable once built.
 *
 * Build one with `ExerciseRegistry.build(entries, deps)`, where `entries` come from a
 * content source (see infrastructure/content/fs-loader.mjs) and `deps` supplies the
 * track and validator registries used to validate track-specific parts.
 */
export class ExerciseRegistry {
  #byId;
  #ordered;

  constructor(exercises) {
    this.#byId = new Map(exercises.map((e) => [e.id, e]));
    this.#ordered = [...exercises].sort(byOrder);
  }

  /**
   * @param {Array<{file: string, data?: unknown, reader: object, problems?: Array}>} entries
   * @param {{tracks: object, validators: object}} deps
   * @throws {ContentError} listing every defect found across all entries
   */
  static build(entries, { tracks, validators }) {
    const problems = [];
    const exercises = [];
    const origin = new Map();

    for (const entry of entries) {
      const scoped = new Problems(entry.file);
      for (const p of entry.problems ?? []) scoped.add(p.path ?? "", p.message);
      if (scoped.ok) {
        const exercise = defineExercise({
          data: entry.data,
          reader: entry.reader,
          tracks,
          validators,
          problems: scoped,
          source: entry.file,
        });
        if (exercise && scoped.ok) {
          if (origin.has(exercise.id)) {
            scoped.add(
              "id",
              `duplicate exercise id "${exercise.id}" (also defined in ${origin.get(exercise.id)})`,
            );
          } else {
            origin.set(exercise.id, entry.file);
            exercises.push(exercise);
          }
        }
      }
      problems.push(...scoped.list);
    }

    // Two exercises must never own the same environment resource (e.g. a namespace):
    // resetting one would destroy the other's state.
    const claimedBy = new Map();
    for (const exercise of exercises)
      for (const claim of exercise.lifecycle?.claims ?? []) {
        const key = `${exercise.track}:${claim}`;
        if (claimedBy.has(key))
          problems.push({
            file: exercise.source,
            path: "lifecycle",
            message: `${claim} is already owned by exercise "${claimedBy.get(key)}"`,
          });
        else claimedBy.set(key, exercise.id);
      }

    const ids = new Set(exercises.map((e) => e.id));
    const exerciseById = new Map(exercises.map((e) => [e.id, e]));

    for (const exercise of exercises) {
      const seen = new Set();
      for (const [i, prereq] of exercise.prerequisites.entries()) {
        if (prereq === exercise.id) {
          problems.push({
            file: exercise.source,
            path: `prerequisites[${i}]`,
            message: `exercise "${exercise.id}" cannot list itself as a prerequisite`,
          });
          continue;
        }
        if (seen.has(prereq)) {
          problems.push({
            file: exercise.source,
            path: `prerequisites[${i}]`,
            message: `duplicate prerequisite "${prereq}"`,
          });
          continue;
        }
        seen.add(prereq);
        if (!ids.has(prereq)) {
          problems.push({
            file: exercise.source,
            path: `prerequisites[${i}]`,
            message: `unknown prerequisite "${prereq}"`,
          });
        } else {
          const other = exerciseById.get(prereq);
          if (other && other.track !== exercise.track) {
            problems.push({
              file: exercise.source,
              path: `prerequisites[${i}]`,
              message: `cross-track prerequisite "${prereq}" (track "${other.track}" ≠ "${exercise.track}") is not supported`,
            });
          }
        }
      }
    }

    // A prerequisite never sits at a higher level than the exercise that needs it, so each
    // level only builds on itself and earlier levels.
    for (const exercise of exercises)
      exercise.prerequisites.forEach((prereq, i) => {
        const other = exerciseById.get(prereq);
        if (other && other.track === exercise.track && other.level > exercise.level)
          problems.push({
            file: exercise.source,
            path: `prerequisites[${i}]`,
            message: `prerequisite "${prereq}" is at level ${other.level}, above this exercise's level ${exercise.level}`,
          });
      });

    // Display order must be unambiguous within a track's level.
    const positions = new Map();
    for (const exercise of exercises) {
      if (exercise.order === undefined) continue;
      const key = `${exercise.track}:${exercise.level}:${exercise.order}`;
      if (positions.has(key))
        problems.push({
          file: exercise.source,
          path: "order",
          message: `order ${exercise.order} in level ${exercise.level} is already used by "${positions.get(key)}"`,
        });
      else positions.set(key, exercise.id);
    }

    detectCycles(exercises, exerciseById, problems);

    if (problems.length > 0) throw new ContentError(problems);
    return new ExerciseRegistry(exercises);
  }

  get size() {
    return this.#byId.size;
  }

  get(id) {
    return this.#byId.get(id);
  }

  require(id) {
    const exercise = this.#byId.get(id);
    if (!exercise) throw new NotFoundError(`Exercise "${id}" does not exist.`, { id });
    return exercise;
  }

  /** Exercises in curriculum order (track, level, `order`, then id), optionally filtered. */
  list({ track, level, difficulty, tags } = {}) {
    const wanted = tags ? [tags].flat() : [];
    return this.#ordered.filter(
      (e) =>
        (track === undefined || e.track === track) &&
        (level === undefined || e.level === level) &&
        (difficulty === undefined || e.difficulty === difficulty) &&
        wanted.every((tag) => e.tags.includes(tag)),
    );
  }
}
