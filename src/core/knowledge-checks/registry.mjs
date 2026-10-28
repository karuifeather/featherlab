import { ContentError, NotFoundError } from "../errors.mjs";
import { Problems } from "../schema.mjs";
import { defineKnowledgeCheck } from "./definition.mjs";

const collator = new Intl.Collator("en", { numeric: true });

function byOrder(a, b) {
  return (
    collator.compare(a.track, b.track) ||
    a.level - b.level ||
    a.order - b.order ||
    collator.compare(a.id, b.id)
  );
}

/**
 * In-memory index of validated knowledge checks. Immutable once built.
 *
 * Build with `KnowledgeCheckRegistry.build(entries)`, where entries come from
 * the knowledge-check content source (see infrastructure/content/knowledge-check-loader.mjs).
 */
export class KnowledgeCheckRegistry {
  #byId;
  #ordered;

  constructor(checks) {
    this.#byId = new Map(checks.map((c) => [c.id, c]));
    this.#ordered = [...checks].sort(byOrder);
  }

  /**
   * @param {Array<{file: string, data?: unknown, problems?: Array}>} entries
   * @throws {ContentError} listing every defect found across all entries
   */
  static build(entries) {
    const problems = [];
    const checks = [];
    const origin = new Map();

    for (const entry of entries) {
      const scoped = new Problems(entry.file);
      for (const p of entry.problems ?? []) scoped.add(p.path ?? "", p.message);
      if (scoped.ok) {
        const kc = defineKnowledgeCheck({
          data: entry.data,
          problems: scoped,
          source: entry.file,
        });
        if (kc && scoped.ok) {
          if (origin.has(kc.id)) {
            scoped.add(
              "id",
              `duplicate knowledge-check id "${kc.id}" (also defined in ${origin.get(kc.id)})`,
            );
          } else {
            origin.set(kc.id, entry.file);
            checks.push(kc);
          }
        }
      }
      problems.push(...scoped.list);
    }

    const positions = new Map();
    for (const kc of checks) {
      const key = `${kc.track}:${kc.level}:${kc.order}`;
      if (positions.has(key)) {
        problems.push({
          file: kc.source,
          path: "order",
          message: `order ${kc.order} in level ${kc.level} is already used by "${positions.get(key)}"`,
        });
      } else {
        positions.set(key, kc.id);
      }
    }

    if (problems.length > 0) throw new ContentError(problems);
    return new KnowledgeCheckRegistry(checks);
  }

  get size() {
    return this.#byId.size;
  }

  get(id) {
    return this.#byId.get(id) ?? null;
  }

  require(id) {
    const kc = this.#byId.get(id);
    if (!kc) throw new NotFoundError(`Knowledge check "${id}" does not exist.`, { id });
    return kc;
  }

  /** Knowledge checks in curriculum order (track, level, order, id), optionally filtered. */
  list({ track, level } = {}) {
    return this.#ordered.filter(
      (c) =>
        (track === undefined || c.track === track) && (level === undefined || c.level === level),
    );
  }
}
