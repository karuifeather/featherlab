/**
 * The serialization boundary. Everything the browser may see is built here from an
 * explicit whitelist; nothing is ever copied wholesale from an exercise or result.
 *
 * Private (never emitted): checks and their params, lifecycle plans and manifests,
 * reference solutions, source paths, environment profiles, validator diagnostics
 * (`details`) and raw errors.
 */

export function presentSummary(e) {
  return {
    id: e.id,
    type: e.type,
    title: e.title,
    summary: e.summary,
    track: e.track,
    level: e.level,
    difficulty: e.difficulty,
    estimatedMinutes: e.estimatedMinutes,
    tags: [...e.tags],
    prerequisites: [...e.prerequisites],
  };
}

export function presentExercise(e) {
  return {
    ...presentSummary(e),
    description: e.description,
    requirements: [...e.requirements],
    hintCount: e.hints.length,
  };
}

export function presentHint(exercise, index) {
  return {
    exerciseId: exercise.id,
    index,
    total: exercise.hints.length,
    text: exercise.hints[index - 1],
  };
}

/** Hidden checks reveal only whether they passed, not what they test. */
function presentCheck(check, position) {
  if (check.hidden && check.status !== "error")
    return {
      id: `hidden-${position + 1}`,
      label: "Hidden check",
      status: check.status,
      passed: check.passed,
      weight: check.weight,
      feedback: check.passed ? "Passed." : "Not satisfied yet.",
    };
  return {
    id: check.id,
    label: check.hidden ? "Hidden check" : check.label,
    status: check.status,
    passed: check.passed,
    weight: check.weight,
    feedback: check.feedback,
  };
}

export function presentResult(result) {
  return {
    exerciseId: result.exerciseId,
    outcome: result.outcome,
    success: result.success,
    score: { ...result.score },
    counts: { ...result.counts },
    checks: result.checks.map(presentCheck),
  };
}

export function presentOperation(exercise, outcome) {
  return { exerciseId: exercise.id, steps: [...outcome.steps] };
}
