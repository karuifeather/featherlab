/**
 * Serialization boundary for knowledge checks.
 *
 * The `_answers` field (server-side answer key) is NEVER included in any return value.
 * Explanations and correct IDs are ONLY exposed in the submit response, not on GET.
 */

export function presentKnowledgeCheckSummary(kc) {
  return {
    id: kc.id,
    activityType: kc.activityType,
    type: kc.activityType,
    title: kc.title,
    summary: kc.summary,
    track: kc.track,
    level: kc.level,
    order: kc.order,
    difficulty: kc.difficulty,
    estimatedMinutes: kc.estimatedMinutes,
    tags: [...kc.tags],
    relatedLabs: [...kc.relatedLabs],
    contentRevision: kc.contentRevision,
    questionCount: kc.questions.length,
  };
}

export function presentKnowledgeCheck(kc) {
  return {
    ...presentKnowledgeCheckSummary(kc),
    questions: kc.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
      // explanations and correctIds are revealed only after submission
    })),
  };
}

export function presentSubmitResult({
  quizId,
  revision,
  score,
  questionResults,
  questions,
  progress,
}) {
  return {
    quizId,
    revision,
    completed: true,
    score,
    questions: questionResults.map((r) => {
      const q = questions.find((qq) => qq.id === r.id);
      return {
        id: r.id,
        correct: r.correct,
        submitted: r.submitted,
        correctIds: r.correctIds,
        ...(q?.explanation ? { explanation: q.explanation } : {}),
        ...(q?.wrongExplanations ? { wrongExplanations: { ...q.wrongExplanations } } : {}),
        ...(q?.docRef ? { docRef: q.docRef } : {}),
        ...(q?.tryCommand ? { tryCommand: q.tryCommand } : {}),
      };
    }),
    progress: presentQuizProgress(progress),
  };
}

export function presentQuizProgress(p) {
  if (!p) return null;
  return {
    quizId: p.quizId,
    completed: p.completed,
    attemptCount: p.attemptCount,
    bestScoreEarned: p.bestScoreEarned,
    bestScorePossible: p.bestScorePossible,
    lastScoreEarned: p.lastScoreEarned,
    lastScorePossible: p.lastScorePossible,
    firstCompletedAt: p.firstCompletedAt,
    lastAttemptedAt: p.lastAttemptedAt,
  };
}

export function presentAttemptSummary(attempt) {
  const percent =
    attempt.scorePossible > 0 ? Math.round((attempt.scoreEarned / attempt.scorePossible) * 100) : 0;
  return {
    id: attempt.id,
    quizId: attempt.quizId,
    contentRev: attempt.contentRev,
    attemptedAt: attempt.attemptedAt,
    scoreEarned: attempt.scoreEarned,
    scorePossible: attempt.scorePossible,
    correctCount: attempt.correctCount,
    totalCount: attempt.totalCount,
    score: { earned: attempt.scoreEarned, possible: attempt.scorePossible, percent },
  };
}
