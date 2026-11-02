/**
 * Integration test: knowledge-check / lab isolation guarantee.
 *
 * Proves the M5.2 core invariant across four scenarios:
 *   1. Opening a lab modifies the cluster (via fake cluster call tracking).
 *   2. Switching to a quiz and submitting answers makes zero cluster calls.
 *   3. Returning to the lab, the cluster state is unaffected.
 *   4. Restarting FeatherLab retains both quiz history and lab progress.
 *
 * Uses a real SQLite database (temp dir), a fake cluster (no Docker/kind), and
 * minimal inline fixture content. Never touches ~/.featherlab or real clusters.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/app.mjs";
import { createFakeCluster, readyPod } from "../helpers/fake-cluster.mjs";
import { makeContent, exerciseFiles } from "../helpers/content.mjs";

const quiet = { warn() {}, error() {} };

// Minimal quiz fixture (JSON is valid YAML).
function quizFiles(slug, overrides = {}) {
  const base = {
    schemaVersion: 1,
    id: "kq-demo-001",
    activityType: "knowledge-check",
    title: "Demo Quiz",
    summary: "A quiz for integration testing.",
    track: "kubernetes",
    level: 0,
    order: 1.5,
    difficulty: "beginner",
    estimatedMinutes: 3,
    contentRevision: "1.0",
    questions: [
      {
        id: "q1",
        type: "single-choice",
        prompt: "What does kubectl get pods do?",
        options: [
          { id: "a", text: "Lists pods in the namespace" },
          { id: "b", text: "Creates a pod" },
        ],
        correctAnswer: "a",
        explanation: "kubectl get pods lists all pods in the current namespace.",
      },
      {
        id: "q2",
        type: "multiple-select",
        prompt: "Which flags list pods across all namespaces?",
        options: [
          { id: "a", text: "-A" },
          { id: "b", text: "--all-namespaces" },
          { id: "c", text: "-n default" },
        ],
        correctAnswers: ["a", "b"],
        explanation: "Both -A and --all-namespaces are equivalent.",
      },
    ],
    ...overrides,
  };
  return {
    [`kubernetes/level-0/${slug}/knowledge-check.yaml`]: JSON.stringify(base, null, 2),
  };
}

test("quiz submission never touches the cluster", async () => {
  const contentRoot = makeContent({
    ...exerciseFiles("001-lab", { id: "demo-0001", order: 1 }),
    ...quizFiles("kq-001-quiz"),
  });
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-kc-isolation-"));
  const cluster = createFakeCluster();

  try {
    const { service, knowledgeCheckService } = createApp({
      runner: cluster,
      contentRoot,
      stateDir,
      logger: quiet,
    });

    // ── Step 1: activate lab — cluster is called ──────────────────────────
    const callsBefore = cluster.calls.length;
    await service.activate("demo-0001");
    const callsAfterActivate = cluster.calls.length;
    assert.ok(callsAfterActivate > callsBefore, "activating a lab must make cluster calls");

    // ── Step 2: submit quiz — zero new cluster calls ──────────────────────
    const result = await knowledgeCheckService.submit("kq-demo-001", {
      revision: "1.0",
      answers: { q1: "a", q2: ["a", "b"] },
    });

    const callsAfterQuiz = cluster.calls.length;
    assert.equal(
      callsAfterQuiz,
      callsAfterActivate,
      "quiz submission must make zero cluster calls",
    );

    // Submission result is correct and complete.
    assert.equal(result.score.earned, 2);
    assert.equal(result.score.possible, 2);
    assert.equal(result.score.percent, 100);
    assert.ok(result.questions.every((q) => q.correct));

    // Answer keys are present in the submit response (post-submission reveal).
    assert.deepEqual(result.questions[0].correctIds, ["a"]);
    assert.deepEqual(result.questions[1].correctIds, ["a", "b"]);

    // ── Step 3: lab state is unchanged ────────────────────────────────────
    const labProgress = service.getExerciseProgress("demo-0001");
    // The lab was activated (opened) but not yet graded — still available.
    assert.ok(
      labProgress.state === "available" || labProgress.state === "completed",
      `unexpected lab state after quiz: ${labProgress.state}`,
    );

    // Simulate solving the lab and grading it before restart.
    cluster.put(readyPod({ name: "demo", namespace: "fl-demo-0001" }));
    const labResult = await service.check("demo-0001");
    assert.equal(labResult.outcome, "passed");
    assert.equal(labResult.progress.completed, true);

    // ── Step 4: restart — both quiz history and lab progress survive ───────
    const app2 = createApp({
      runner: createFakeCluster(),
      contentRoot,
      stateDir,
      logger: quiet,
    });

    // Lab progress persists.
    const labProgress2 = app2.service.getExerciseProgress("demo-0001");
    assert.equal(labProgress2.completed, true, "lab completion must survive restart");
    assert.equal(labProgress2.attemptCount, 1);

    // Quiz progress persists.
    const quizProgress = app2.knowledgeCheckService.getProgress("kq-demo-001");
    assert.ok(quizProgress !== null, "quiz progress must survive restart");
    assert.equal(quizProgress.completed, true);
    assert.equal(quizProgress.attemptCount, 1);
    assert.equal(quizProgress.bestScoreEarned, 2);
    assert.equal(quizProgress.bestScorePossible, 2);

    // Quiz attempt history persists.
    const attempts = app2.knowledgeCheckService.getAttempts("kq-demo-001");
    assert.equal(attempts.length, 1, "quiz attempt history must survive restart");
    assert.equal(attempts[0].scoreEarned, 2);
    assert.equal(attempts[0].scorePossible, 2);
  } finally {
    rmSync(contentRoot, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("GET knowledge-check response never contains answer keys", async () => {
  const contentRoot = makeContent(quizFiles("kq-001-quiz"));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-kc-keys-"));

  try {
    const { knowledgeCheckService } = createApp({
      runner: createFakeCluster(),
      contentRoot,
      stateDir,
      logger: quiet,
    });

    const kc = knowledgeCheckService.get("kq-demo-001");
    assert.ok(kc !== null, "quiz must be found");

    // Top-level _answers must not be present.
    assert.ok(!("_answers" in kc), "GET response must not expose _answers");

    // Individual questions must not expose correctAnswer / correctAnswers.
    for (const q of kc.questions) {
      assert.ok(!("correctAnswer" in q), `question ${q.id} must not have correctAnswer`);
      assert.ok(!("correctAnswers" in q), `question ${q.id} must not have correctAnswers`);
    }
  } finally {
    rmSync(contentRoot, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("quiz progress is monotonic: low retry score does not un-complete the quiz", async () => {
  const contentRoot = makeContent(quizFiles("kq-001-quiz"));
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-kc-mono-"));

  try {
    const { knowledgeCheckService } = createApp({
      runner: createFakeCluster(),
      contentRoot,
      stateDir,
      logger: quiet,
    });

    // First submission: 2/2 (100%).
    await knowledgeCheckService.submit("kq-demo-001", {
      revision: "1.0",
      answers: { q1: "a", q2: ["a", "b"] },
    });

    // Second submission: 0/2 (wrong answers).
    const retry = await knowledgeCheckService.submit("kq-demo-001", {
      revision: "1.0",
      answers: { q1: "b", q2: ["c"] },
    });

    assert.equal(retry.progress.completed, true, "completion is monotonic");
    assert.equal(retry.progress.attemptCount, 2);
    assert.equal(retry.progress.bestScoreEarned, 2, "best score must not regress");
    assert.equal(retry.progress.lastScoreEarned, 0, "last score reflects the retry");
  } finally {
    rmSync(contentRoot, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
  }
});
