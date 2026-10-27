import { ContentError } from "./core/errors.mjs";
import { EnvironmentSession } from "./application/environment-session.mjs";
import { ExerciseService } from "./application/exercise-service.mjs";
import { AttemptsService } from "./application/learning/attempts-service.mjs";
import { ProgressionService } from "./application/learning/progression-service.mjs";
import { ResumeService } from "./application/learning/resume-service.mjs";
import { ExerciseRegistry } from "./core/exercises/registry.mjs";
import { LifecycleManager } from "./core/lifecycle/manager.mjs";
import { TrackRegistry } from "./core/tracks.mjs";
import { combinators } from "./core/validation/combinators.mjs";
import { ValidatorRegistry } from "./core/validation/registry.mjs";
import { createFsContentSource } from "./infrastructure/content/fs-loader.mjs";
import { createWorkstationRunner } from "./infrastructure/docker/workstation-runner.mjs";
import { createPersistence } from "./infrastructure/persistence/index.mjs";
import { createKubernetesTrack } from "./tracks/kubernetes/index.mjs";

/**
 * Composition root: the only place that knows which concrete implementations back the
 * engine's contracts. Adding a track or validator means registering it here (tracks) or
 * in the track itself (validators); nothing else changes.
 *
 * Throws ContentError if any packaged exercise is invalid, so a broken exercise is
 * caught at startup rather than when a learner opens it.
 *
 * Pass `stateDir` to enable SQLite persistence. When omitted, `persistence` in the
 * return value is null; the exercise engine operates without it (no M4 features).
 */
export function createApp({
  workstation,
  runner = createWorkstationRunner(workstation ? { container: workstation } : undefined),
  contentRoot,
  logger = console,
  timeouts,
  stateDir,
} = {}) {
  const tracks = new TrackRegistry([createKubernetesTrack({ runner })]);
  const validators = new ValidatorRegistry([
    ...combinators,
    ...tracks.all().flatMap((track) => track.validators),
  ]);
  const source = createFsContentSource(contentRoot ? { root: contentRoot } : undefined);
  const registry = ExerciseRegistry.build(source.discover(), { tracks, validators });
  const lifecycle = new LifecycleManager({ tracks, validators, logger, timeouts });
  const persistence = stateDir ? createPersistence({ stateDir }) : null;
  const session = new EnvironmentSession({
    lifecycle,
    registry,
    store: persistence?.environment,
    logger,
  });

  let progression = null;
  let attemptsService = null;
  let resumeService = null;
  if (persistence) {
    progression = new ProgressionService({ registry, progress: persistence.progress });
    attemptsService = new AttemptsService({ persistence });
    resumeService = new ResumeService({ resume: persistence.resume, registry, progression });
  }

  return {
    service: new ExerciseService({
      registry,
      session,
      progression,
      attemptsService,
      resumeService,
    }),
    registry,
    tracks,
    validators,
    persistence,
  };
}

/**
 * Validate packaged (or `contentRoot`) exercise definitions without Docker, kind or a
 * workstation: the runner is a stub that fails if anything ever tries to use it.
 *
 * @returns {{ok: boolean, count: number, problems: Array<{file: string, path?: string, message: string}>}}
 */
export function validateContent({ contentRoot } = {}) {
  const runner = {
    run: async () => {
      throw new Error("Content validation must not touch the environment.");
    },
  };
  try {
    const { registry } = createApp({ runner, contentRoot, logger: { warn() {}, error() {} } });
    if (registry.size === 0)
      return {
        ok: false,
        count: 0,
        problems: [{ file: contentRoot ?? "exercises", message: "no exercises were found" }],
      };
    return { ok: true, count: registry.size, problems: [] };
  } catch (error) {
    if (error instanceof ContentError) return { ok: false, count: 0, problems: error.problems };
    // A missing content directory or similar: report it as a problem, not a crash.
    return {
      ok: false,
      count: 0,
      problems: [{ file: contentRoot ?? "exercises", message: error.message }],
    };
  }
}
