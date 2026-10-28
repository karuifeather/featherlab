import { ConflictError, InputError } from "../core/errors.mjs";
import { evaluateAnswer } from "../core/knowledge-checks/evaluator.mjs";
import {
  presentAttemptSummary,
  presentKnowledgeCheck,
  presentKnowledgeCheckSummary,
  presentQuizProgress,
  presentSubmitResult,
} from "./knowledge-check-presenters.mjs";

/**
 * Knowledge-check use cases. Contains no Kubernetes, Docker, HTTP, or filesystem code.
 * Deliberately does NOT import EnvironmentSession, LifecycleManager, or any track.
 */
export class KnowledgeCheckService {
  #registry;
  #persistence; // { quizAttempts, quizProgress, transaction } | null

  constructor({ registry, persistence = null }) {
    this.#registry = registry;
    this.#persistence = persistence;
  }

  list({ track, level } = {}) {
    return this.#registry
      .list({ track, level: level !== undefined ? Number(level) : undefined })
      .map(presentKnowledgeCheckSummary);
  }

  get(id) {
    const kc = this.#registry.require(id);
    return presentKnowledgeCheck(kc);
  }

  /**
   * Grade a quiz submission, persist the result, and return graded feedback.
   *
   * @param {string} id - Knowledge-check ID
   * @param {{ revision: string, answers: Record<string, string|string[]> }} body
   */
  async submit(id, body) {
    const kc = this.#registry.require(id);

    const { revision, answers } = body ?? {};

    if (typeof revision !== "string" || revision !== kc.contentRevision) {
      throw new ConflictError(
        `Content revision mismatch: expected "${kc.contentRevision}", got "${revision}". Reload the quiz and try again.`,
        { expected: kc.contentRevision, received: revision ?? null },
      );
    }

    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      throw new InputError(
        "answers must be an object mapping question IDs to submitted option IDs.",
      );
    }

    const questionIds = new Set(kc.questions.map((q) => q.id));
    const submittedIds = new Set(Object.keys(answers));

    const missing = [...questionIds].filter((qid) => !submittedIds.has(qid));
    if (missing.length > 0)
      throw new InputError(`Missing answers for question(s): ${missing.join(", ")}.`);

    const extra = [...submittedIds].filter((qid) => !questionIds.has(qid));
    if (extra.length > 0)
      throw new InputError(`Unknown question ID(s) in answers: ${extra.join(", ")}.`);

    // Validate each answer against its question type and option IDs
    for (const q of kc.questions) {
      const submitted = answers[q.id];
      const optionIds = new Set(q.options.map((o) => o.id));

      if (q.type === "single-choice") {
        if (typeof submitted !== "string")
          throw new InputError(`Answer for question "${q.id}" must be a string (single-choice).`);
        if (!optionIds.has(submitted))
          throw new InputError(
            `Answer for question "${q.id}" references unknown option "${submitted}".`,
          );
      } else {
        // multiple-select
        if (!Array.isArray(submitted))
          throw new InputError(`Answer for question "${q.id}" must be an array (multiple-select).`);
        for (const optId of submitted) {
          if (typeof optId !== "string")
            throw new InputError(`Answer for question "${q.id}" contains a non-string value.`);
          if (!optionIds.has(optId))
            throw new InputError(
              `Answer for question "${q.id}" references unknown option "${optId}".`,
            );
        }
      }
    }

    // Evaluate
    const questionResults = [];
    let correctCount = 0;
    for (const q of kc.questions) {
      const submitted = answers[q.id];
      const answerKey = kc._answers[q.id];
      const correct = evaluateAnswer(submitted, answerKey);
      if (correct) correctCount++;
      questionResults.push({
        id: q.id,
        correct,
        submitted,
        correctIds: [...answerKey.correctIds],
      });
    }

    const totalCount = kc.questions.length;
    const scoreEarned = correctCount;
    const scorePossible = totalCount;
    const percent = scorePossible > 0 ? Math.round((scoreEarned / scorePossible) * 100) : 0;

    const now = new Date().toISOString();
    const correctness = Object.fromEntries(questionResults.map((r) => [r.id, r.correct]));

    let updatedProgress = null;

    if (this.#persistence) {
      this.#persistence.transaction(() => {
        this.#persistence.quizAttempts.insert({
          quizId: id,
          contentRev: revision,
          attemptedAt: now,
          scoreEarned,
          scorePossible,
          correctCount,
          totalCount,
          answersJson: JSON.stringify(answers),
          correctnessJson: JSON.stringify(correctness),
        });

        const current = this.#persistence.quizProgress.get(id);
        const wasCompleted = current?.completed ?? false;
        const prevAttemptCount = current?.attemptCount ?? 0;

        // Completion is monotonic: once completed, it stays completed
        const completed = true;
        const firstCompletedAt = wasCompleted ? current.firstCompletedAt : now;

        const bestScoreEarned =
          current?.bestScoreEarned == null
            ? scoreEarned
            : Math.max(current.bestScoreEarned, scoreEarned);
        const bestScorePossible =
          current?.bestScorePossible == null ? scorePossible : current.bestScorePossible;

        const next = {
          quizId: id,
          completed,
          firstCompletedAt,
          lastAttemptedAt: now,
          attemptCount: prevAttemptCount + 1,
          bestScoreEarned,
          bestScorePossible,
          lastScoreEarned: scoreEarned,
          lastScorePossible: scorePossible,
        };

        this.#persistence.quizProgress.upsert(next);
        updatedProgress = next;
      });
    } else {
      updatedProgress = {
        quizId: id,
        completed: true,
        firstCompletedAt: now,
        lastAttemptedAt: now,
        attemptCount: 1,
        bestScoreEarned: scoreEarned,
        bestScorePossible: scorePossible,
        lastScoreEarned: scoreEarned,
        lastScorePossible: scorePossible,
      };
    }

    return presentSubmitResult({
      quizId: id,
      revision,
      score: { earned: scoreEarned, possible: scorePossible, percent },
      questionResults,
      questions: kc.questions,
      progress: updatedProgress,
    });
  }

  getAttempts(id) {
    this.#registry.require(id); // validate existence
    if (!this.#persistence) return [];
    return this.#persistence.quizAttempts.byQuiz(id).map(presentAttemptSummary);
  }

  getProgress(id) {
    this.#registry.require(id); // validate existence
    if (!this.#persistence) return null;
    const p = this.#persistence.quizProgress.get(id);
    return p ? presentQuizProgress(p) : null;
  }

  getTrackProgress(trackId) {
    const quizzes = this.#registry.list({ track: trackId });
    const results = quizzes.map((kc) => {
      const progress = this.#persistence ? this.#persistence.quizProgress.get(kc.id) : null;
      return {
        quizId: kc.id,
        title: kc.title,
        level: kc.level,
        questionCount: kc.questions.length,
        progress: progress ? presentQuizProgress(progress) : null,
      };
    });
    const total = results.length;
    const completed = results.filter((r) => r.progress?.completed).length;
    return { quizzes: results, summary: { total, completed } };
  }

  get quizCount() {
    return this.#registry.size;
  }
}
