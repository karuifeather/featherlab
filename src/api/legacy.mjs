/**
 * Deprecated v0.1 endpoints, kept so existing scripts (such as the smoke workflow) keep
 * working. They address the original Pod exercise and return the old response shapes.
 * New clients should use /api/exercises/:id/*.
 */
const LEGACY_EXERCISE_ID = "k8s-0001";

function legacyResult(result) {
  return {
    checks: result.checks.map((c) => ({ id: c.id, label: c.label, pass: c.passed })),
    passed: result.counts.passed,
    total: result.counts.total,
    success: result.success,
  };
}

/**
 * v0.1 `/api/status` carried `track` and `exercise` (the single Pod task). They are kept
 * so older scripts and UI builds keep working; `exercises` (a count) is the v0.2 addition.
 */
export function legacyStatusFields(service) {
  let title = "Your first Pod";
  try {
    title = service.get(LEGACY_EXERCISE_ID).title;
  } catch {
    // Custom content without the original exercise: fall back to the v0.1 title.
  }
  return {
    track: "kubernetes",
    exercise: {
      id: LEGACY_EXERCISE_ID,
      title,
      name: "web",
      namespace: "default",
      image: "nginx:1.27",
    },
  };
}

export function legacyRoutes(route) {
  return [
    route("POST", /^\/api\/check$/, async (_, { service }) => ({
      body: legacyResult(await service.check(LEGACY_EXERCISE_ID)),
    })),
    route("POST", /^\/api\/reset$/, async (_, { service }) => {
      await service.reset(LEGACY_EXERCISE_ID);
      return { body: { reset: true } };
    }),
  ];
}
