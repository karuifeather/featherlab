import test from "node:test";
import assert from "node:assert/strict";
import { KnowledgeCheckRegistry } from "../../../src/core/knowledge-checks/registry.mjs";
import { KnowledgeCheckService } from "../../../src/application/knowledge-check-service.mjs";
import { ConflictError, InputError, NotFoundError } from "../../../src/core/errors.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SINGLE_YAML = {
  schemaVersion: 1,
  id: "kq-k8s-l0-001",
  activityType: "knowledge-check",
  title: "Test Quiz",
  summary: "A test quiz.",
  track: "k8s",
  level: 0,
  order: 1.5,
  difficulty: "beginner",
  estimatedMinutes: 5,
  tags: ["test"],
  relatedLabs: [],
  contentRevision: "1.0",
  questions: [
    {
      id: "q1",
      type: "single-choice",
      prompt: "What is A?",
      options: [
        { id: "a", text: "Option A" },
        { id: "b", text: "Option B" },
      ],
      correctAnswer: "a",
      explanation: "A is correct.",
    },
    {
      id: "q2",
      type: "multiple-select",
      prompt: "Which are correct?",
      options: [
        { id: "x", text: "X" },
        { id: "y", text: "Y" },
        { id: "z", text: "Z" },
      ],
      correctAnswers: ["x", "y"],
      explanation: "X and Y.",
    },
  ],
};

function buildRegistry(yamlData = SINGLE_YAML) {
  const entry = { file: "test/kq-k8s-l0-001/knowledge-check.yaml", data: yamlData, problems: [] };
  return KnowledgeCheckRegistry.build([entry]);
}

// Minimal in-memory persistence stub
function makePersistence() {
  const attempts = [];
  let progressRecord = null;

  return {
    quizAttempts: {
      insert(attempt) {
        attempts.push({ id: attempts.length + 1, ...attempt });
        return attempts.length;
      },
      byQuiz(quizId) {
        return attempts.filter((a) => a.quizId === quizId);
      },
    },
    quizProgress: {
      get(quizId) {
        return progressRecord && progressRecord.quizId === quizId ? progressRecord : null;
      },
      upsert(progress) {
        progressRecord = progress;
      },
    },
    transaction(fn) {
      fn();
    },
    _attempts: attempts,
    _getProgress: () => progressRecord,
  };
}

function makeService(persistence = null) {
  return new KnowledgeCheckService({ registry: buildRegistry(), persistence });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("list() returns sanitized summaries with no answer keys", () => {
  const service = makeService();
  const [summary] = service.list();
  assert.equal(summary.id, "kq-k8s-l0-001");
  assert.equal(summary.questionCount, 2);
  assert.ok(!("_answers" in summary), "summary must not expose _answers");
  assert.ok(!("questions" in summary), "summary must not include full question detail");
});

test("get() returns sanitized quiz with no answer keys and no explanations", () => {
  const service = makeService();
  const kc = service.get("kq-k8s-l0-001");
  assert.ok(!("_answers" in kc), "get must not expose _answers");
  assert.equal(kc.questions.length, 2);
  assert.ok(!("explanation" in kc.questions[0]), "explanations must be hidden before submission");
  assert.ok(!("correctAnswer" in kc.questions[0]), "correctAnswer must not be in GET response");
  assert.deepEqual(Object.keys(kc.questions[0]).sort(), ["id", "options", "prompt", "type"]);
});

test("get() throws NotFoundError for unknown ID", () => {
  const service = makeService();
  assert.throws(() => service.get("kq-k8s-l0-999"), NotFoundError);
});

test("submit() grades correctly and reveals answers", async () => {
  const persistence = makePersistence();
  const service = makeService(persistence);
  const result = await service.submit("kq-k8s-l0-001", {
    revision: "1.0",
    answers: { q1: "a", q2: ["x", "y"] },
  });
  assert.equal(result.quizId, "kq-k8s-l0-001");
  assert.equal(result.completed, true);
  assert.equal(result.score.earned, 2);
  assert.equal(result.score.possible, 2);
  assert.equal(result.score.percent, 100);
  assert.equal(result.questions[0].correct, true);
  assert.deepEqual(result.questions[0].correctIds, ["a"]);
  assert.equal(result.questions[0].explanation, "A is correct.");
  assert.equal(result.questions[1].correct, true);
  assert.deepEqual(result.questions[1].correctIds, ["x", "y"]);
});

test("submit() with wrong answers scores correctly", async () => {
  const service = makeService(makePersistence());
  const result = await service.submit("kq-k8s-l0-001", {
    revision: "1.0",
    answers: { q1: "b", q2: ["x", "z"] },
  });
  assert.equal(result.score.earned, 0);
  assert.equal(result.score.possible, 2);
  assert.equal(result.questions[0].correct, false);
  assert.equal(result.questions[1].correct, false);
});

test("submit() throws ConflictError on revision mismatch", async () => {
  const service = makeService();
  await assert.rejects(
    () =>
      service.submit("kq-k8s-l0-001", { revision: "999", answers: { q1: "a", q2: ["x", "y"] } }),
    ConflictError,
  );
});

test("submit() throws InputError for missing answers", async () => {
  const service = makeService();
  await assert.rejects(
    () => service.submit("kq-k8s-l0-001", { revision: "1.0", answers: { q1: "a" } }),
    InputError,
  );
});

test("submit() throws InputError for extra question IDs", async () => {
  const service = makeService();
  await assert.rejects(
    () =>
      service.submit("kq-k8s-l0-001", {
        revision: "1.0",
        answers: { q1: "a", q2: ["x", "y"], q99: "z" },
      }),
    InputError,
  );
});

test("submit() throws InputError for unknown option ID", async () => {
  const service = makeService();
  await assert.rejects(
    () =>
      service.submit("kq-k8s-l0-001", {
        revision: "1.0",
        answers: { q1: "unknown-opt", q2: ["x", "y"] },
      }),
    InputError,
  );
});

test("submit() throws InputError when answers is not an object", async () => {
  const service = makeService();
  await assert.rejects(
    () => service.submit("kq-k8s-l0-001", { revision: "1.0", answers: "wrong" }),
    InputError,
  );
});

test("getProgress() returns null before any attempt", () => {
  const service = makeService(makePersistence());
  const p = service.getProgress("kq-k8s-l0-001");
  assert.equal(p, null);
});

test("getProgress() returns progress after submit", async () => {
  const persistence = makePersistence();
  const service = makeService(persistence);
  await service.submit("kq-k8s-l0-001", {
    revision: "1.0",
    answers: { q1: "a", q2: ["x", "y"] },
  });
  const p = service.getProgress("kq-k8s-l0-001");
  assert.equal(p.completed, true);
  assert.equal(p.attemptCount, 1);
  assert.equal(p.bestScoreEarned, 2);
  assert.equal(p.bestScorePossible, 2);
  assert.ok(p.firstCompletedAt, "firstCompletedAt should be set");
});

test("best score improves on higher-scoring retry", async () => {
  const persistence = makePersistence();
  const service = makeService(persistence);
  // First: score 0/2
  await service.submit("kq-k8s-l0-001", {
    revision: "1.0",
    answers: { q1: "b", q2: ["x", "z"] },
  });
  // Second: score 2/2
  await service.submit("kq-k8s-l0-001", {
    revision: "1.0",
    answers: { q1: "a", q2: ["x", "y"] },
  });
  const p = service.getProgress("kq-k8s-l0-001");
  assert.equal(p.attemptCount, 2);
  assert.equal(p.bestScoreEarned, 2);
  assert.equal(p.lastScoreEarned, 2);
});

test("completion is monotonic: low score after high does not un-complete", async () => {
  const persistence = makePersistence();
  const service = makeService(persistence);
  // First: perfect score → completed
  await service.submit("kq-k8s-l0-001", {
    revision: "1.0",
    answers: { q1: "a", q2: ["x", "y"] },
  });
  const firstCompletedAt = service.getProgress("kq-k8s-l0-001").firstCompletedAt;
  // Second: low score
  await service.submit("kq-k8s-l0-001", {
    revision: "1.0",
    answers: { q1: "b", q2: ["x", "z"] },
  });
  const p = service.getProgress("kq-k8s-l0-001");
  assert.equal(p.completed, true, "completed must remain true");
  assert.equal(p.firstCompletedAt, firstCompletedAt, "firstCompletedAt must not change");
  assert.equal(p.attemptCount, 2);
  assert.equal(p.bestScoreEarned, 2, "best score should still be the highest");
});

test("getAttempts() returns empty array before any attempt", () => {
  const service = makeService(makePersistence());
  assert.deepEqual(service.getAttempts("kq-k8s-l0-001"), []);
});

test("getAttempts() returns attempt history after submit", async () => {
  const persistence = makePersistence();
  const service = makeService(persistence);
  await service.submit("kq-k8s-l0-001", {
    revision: "1.0",
    answers: { q1: "a", q2: ["x", "y"] },
  });
  const attempts = service.getAttempts("kq-k8s-l0-001");
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].scoreEarned, 2);
  assert.equal(attempts[0].scorePossible, 2);
  assert.equal(attempts[0].score.percent, 100);
  // raw answers/correctness should NOT be in the summary list
  assert.ok(!("answers" in attempts[0]), "raw answers must not be in attempt summary");
  assert.ok(!("correctness" in attempts[0]), "raw correctness must not be in attempt summary");
});

test("getTrackProgress() aggregates quiz progress per track", async () => {
  const persistence = makePersistence();
  const service = makeService(persistence);
  let result = service.getTrackProgress("k8s");
  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.completed, 0);

  await service.submit("kq-k8s-l0-001", {
    revision: "1.0",
    answers: { q1: "a", q2: ["x", "y"] },
  });
  result = service.getTrackProgress("k8s");
  assert.equal(result.summary.completed, 1);
  assert.equal(result.quizzes[0].quizId, "kq-k8s-l0-001");
  assert.ok(result.quizzes[0].progress?.completed);
});

test("submit() without persistence still returns a result", async () => {
  const service = makeService(null);
  const result = await service.submit("kq-k8s-l0-001", {
    revision: "1.0",
    answers: { q1: "a", q2: ["x", "y"] },
  });
  assert.equal(result.completed, true);
  assert.ok(result.progress, "progress should be included even without persistence");
});
