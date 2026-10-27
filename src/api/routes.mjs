import { NotFoundError } from "../core/errors.mjs";
import { MethodNotAllowedError } from "./http.mjs";
import { legacyRoutes, legacyStatusFields } from "./legacy.mjs";

/**
 * Thin HTTP adapters over ExerciseService. A handler maps request -> service call ->
 * `{status?, body}`; all rules live in the service.
 *
 * Route table entry: {method, pattern, handler(match, {service, url, cluster}) -> {status?, body}}
 */
/**
 * `?discardActive=true` confirms that opening or resetting this exercise may reset another
 * exercise that currently owns the practice environment. Without it, that is a 409.
 */
const discardActive = (url) => ({
  discardActive: url.searchParams.get("discardActive") === "true",
});

export function buildRoutes() {
  const id = "([a-z0-9-]{1,63})";
  const route = (method, pattern, handler) => ({ method, pattern, handler });
  return [
    route("GET", /^\/api\/version$/, async (_, { getVersionInfo }) => ({
      body: await (getVersionInfo?.() ??
        Promise.resolve({ current: "dev", latest: null, isOutdated: false })),
    })),
    route("GET", /^\/api\/status$/, (_, { service, cluster }) => ({
      body: {
        ready: true,
        cluster,
        ...legacyStatusFields(service),
        exercises: service.exerciseCount,
      },
    })),
    route("GET", /^\/api\/exercises$/, (_, { service, url }) => {
      const q = url.searchParams;
      return {
        body: {
          exercises: service.list({
            track: q.get("track") ?? undefined,
            level: q.get("level") ?? undefined,
            difficulty: q.get("difficulty") ?? undefined,
            tags: q.getAll("tag"),
          }),
        },
      };
    }),
    route("GET", new RegExp(`^/api/exercises/${id}$`), ([, exerciseId], { service }) => ({
      body: { exercise: service.get(exerciseId) },
    })),
    route(
      "GET",
      new RegExp(`^/api/exercises/${id}/hints/(\\d{1,3})$`),
      ([, exerciseId, n], { service }) => ({
        body: { hint: service.hint(exerciseId, n) },
      }),
    ),
    route(
      "POST",
      new RegExp(`^/api/exercises/${id}/activate$`),
      async ([, exerciseId], { service, url }) => ({
        body: await service.activate(exerciseId, discardActive(url)),
      }),
    ),
    route(
      "POST",
      new RegExp(`^/api/exercises/${id}/check$`),
      async ([, exerciseId], { service }) => ({
        body: { result: await service.check(exerciseId) },
      }),
    ),
    route(
      "POST",
      new RegExp(`^/api/exercises/${id}/reset$`),
      async ([, exerciseId], { service, url }) => ({
        body: await service.reset(exerciseId, discardActive(url)),
      }),
    ),
    route("POST", new RegExp(`^/api/exercises/${id}/select$`), ([, exerciseId], { service }) => ({
      body: service.select(exerciseId),
    })),
    route("GET", new RegExp(`^/api/exercises/${id}/progress$`), ([, exerciseId], { service }) => ({
      body: { progress: service.getExerciseProgress(exerciseId) },
    })),
    route("GET", /^\/api\/progress\/track\/([a-z0-9-]{1,63})$/, ([, trackId], { service }) => {
      const exercises = service.getTrackProgress(trackId);
      const summary = exercises.reduce(
        (acc, e) => {
          acc.total++;
          if (e.state === "completed") acc.completed++;
          else if (e.state === "locked") acc.locked++;
          else acc.available++;
          return acc;
        },
        { total: 0, completed: 0, available: 0, locked: 0 },
      );
      return { body: { exercises, summary } };
    }),
    route("GET", /^\/api\/resume$/, (_, { service }) => ({
      body: { resume: service.getResume() },
    })),
    ...legacyRoutes(route),
  ];
}

/** Resolve a request against the table. Throws typed errors for 404/405. */
export function matchRoute(routes, method, pathname) {
  const byPath = routes.filter((r) => r.pattern.test(pathname));
  if (byPath.length === 0) throw new NotFoundError("No such API endpoint.");
  const found = byPath.find((r) => r.method === method);
  if (!found)
    throw new MethodNotAllowedError(
      method,
      byPath.map((r) => r.method),
    );
  return { route: found, match: found.pattern.exec(pathname) };
}
