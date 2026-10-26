/**
 * A Track integrates one subject (kubernetes, postgres, ...) with the generic engine.
 * The engine only ever talks to this contract.
 *
 * @typedef {Object} Track
 * @property {string} id                       e.g. "kubernetes"
 * @property {string[]} profiles               environment profiles exercises may request
 * @property {ValidatorDefinition[]} validators  track-specific validators (see validation/registry.mjs)
 * @property {(raw: object, ctx: {exerciseId: string, reader: ContentReader, problems: Problems}) => object} compileLifecycle
 *   Validate the exercise's opaque `lifecycle` section at load time and return an immutable
 *   plan. Record defects on `ctx.problems`; never throw for bad content.
 * @property {LifecycleDriver} driver
 *
 * @typedef {Object} LifecycleDriver
 *   Every method is idempotent and receives `{exercise, signal}`.
 * @property {(ctx) => Promise<void>} prepare   Verify the environment is reachable.
 * @property {(ctx) => Promise<string[]>} setup    Create what the exercise needs; returns step names.
 * @property {(ctx) => Promise<string[]>} reset    Remove the learner's work, then restore setup state.
 * @property {(ctx) => Promise<string[]>} cleanup  Remove everything the exercise owns.
 * @property {(ctx) => object} createQuery      Per-grading read-only state adapter exposed to
 *   validators as `ctx.query`.
 *
 * @typedef {Object} ContentReader
 * @property {(relativePath: string) => string} readText  Reads a file inside the exercise
 *   directory; throws if the path escapes it.
 */

export class TrackRegistry {
  #tracks = new Map();

  constructor(tracks = []) {
    for (const track of tracks) this.#register(track);
  }

  #register(track) {
    if (this.#tracks.has(track.id)) throw new Error(`Track "${track.id}" registered twice.`);
    this.#tracks.set(track.id, track);
  }

  get(id) {
    return this.#tracks.get(id);
  }

  ids() {
    return [...this.#tracks.keys()];
  }

  all() {
    return [...this.#tracks.values()];
  }
}
