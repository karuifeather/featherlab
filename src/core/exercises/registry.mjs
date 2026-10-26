import { ContentError, NotFoundError } from "../errors.mjs";
import { Problems } from "../schema.mjs";
import { defineExercise } from "./definition.mjs";

const collator = new Intl.Collator("en", { numeric: true });

function byOrder(a, b) {
  return collator.compare(a.track, b.track) || a.level - b.level || collator.compare(a.id, b.id);
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

    const ids = new Set(exercises.map((e) => e.id));
    for (const exercise of exercises)
      for (const [i, prerequisite] of exercise.prerequisites.entries())
        if (prerequisite === exercise.id || !ids.has(prerequisite))
          problems.push({
            file: exercise.source,
            path: `prerequisites[${i}]`,
            message: `unknown prerequisite "${prerequisite}"`,
          });

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

  /** Exercises in stable order (track, level, id), optionally filtered. */
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
