import test from "node:test";
import assert from "node:assert/strict";
import { computeNextProgress } from "../../../src/application/learning/completion-service.mjs";

const NOW = "2024-06-01T10:00:00.000Z";
const LATER = "2024-06-01T11:00:00.000Z";

function result(outcome, earned = 4, possible = 4) {
  return { outcome, score: { earned, possible } };
}

const ctx = (now = NOW) => ({ exerciseId: "k8s-0001", trackId: "kubernetes", now });

// ── First attempt ──────────────────────────────────────────────────────────────

test("first passed attempt: completed=true, firstCompletedAt set, attemptCount=1", () => {
  const next = computeNextProgress(null, result("passed"), ctx());
  assert.equal(next.completed, true);
  assert.equal(next.firstCompletedAt, NOW);
  assert.equal(next.lastAttemptedAt, NOW);
  assert.equal(next.attemptCount, 1);
  assert.equal(next.exerciseId, "k8s-0001");
  assert.equal(next.trackId, "kubernetes");
});

test("first failed attempt: completed=false, firstCompletedAt=null, attemptCount=1", () => {
  const next = computeNextProgress(null, result("failed", 2, 4), ctx());
  assert.equal(next.completed, false);
  assert.equal(next.firstCompletedAt, null);
  assert.equal(next.attemptCount, 1);
  assert.equal(next.bestScoreEarned, 2);
  assert.equal(next.bestScorePossible, 4);
});

// ── Monotonic completion ───────────────────────────────────────────────────────

test("failure after success: completed stays true", () => {
  const afterPass = computeNextProgress(null, result("passed", 4, 4), ctx(NOW));
  const afterFail = computeNextProgress(afterPass, result("failed", 0, 4), ctx(LATER));
  assert.equal(afterFail.completed, true);
  assert.equal(afterFail.firstCompletedAt, NOW);
  assert.equal(afterFail.attemptCount, 2);
});

test("firstCompletedAt never changes after first completion", () => {
  const first = computeNextProgress(null, result("passed"), ctx(NOW));
  const second = computeNextProgress(first, result("passed"), ctx(LATER));
  assert.equal(second.firstCompletedAt, NOW);
});

test("success after success: completed stays true, firstCompletedAt unchanged", () => {
  const first = computeNextProgress(null, result("passed"), ctx(NOW));
  const second = computeNextProgress(first, result("passed"), ctx(LATER));
  assert.equal(second.completed, true);
  assert.equal(second.firstCompletedAt, NOW);
  assert.equal(second.attemptCount, 2);
});

// ── Best score preservation ───────────────────────────────────────────────────

test("best score is preserved when a later attempt scores lower", () => {
  const first = computeNextProgress(null, result("passed", 4, 4), ctx(NOW));
  const second = computeNextProgress(first, result("failed", 2, 4), ctx(LATER));
  assert.equal(second.bestScoreEarned, 4);
  assert.equal(second.bestScorePossible, 4);
});

test("best score updates when a later attempt scores higher", () => {
  const first = computeNextProgress(null, result("failed", 2, 4), ctx(NOW));
  const second = computeNextProgress(first, result("passed", 4, 4), ctx(LATER));
  assert.equal(second.bestScoreEarned, 4);
  assert.equal(second.bestScorePossible, 4);
});

test("bestScoreEarned and bestScorePossible come from the same attempt", () => {
  const first = computeNextProgress(null, result("failed", 3, 4), ctx(NOW));
  const second = computeNextProgress(first, result("failed", 2, 4), ctx(LATER));
  assert.equal(second.bestScoreEarned, 3);
  assert.equal(second.bestScorePossible, 4);
});

// ── lastAttemptedAt ───────────────────────────────────────────────────────────

test("lastAttemptedAt always updates to the current timestamp", () => {
  const first = computeNextProgress(null, result("passed"), ctx(NOW));
  assert.equal(first.lastAttemptedAt, NOW);
  const second = computeNextProgress(first, result("failed"), ctx(LATER));
  assert.equal(second.lastAttemptedAt, LATER);
});

// ── Fields are propagated ─────────────────────────────────────────────────────

test("exerciseId and trackId are preserved from context", () => {
  const next = computeNextProgress(null, result("passed"), {
    exerciseId: "k8s-0002",
    trackId: "kubernetes",
    now: NOW,
  });
  assert.equal(next.exerciseId, "k8s-0002");
  assert.equal(next.trackId, "kubernetes");
});
