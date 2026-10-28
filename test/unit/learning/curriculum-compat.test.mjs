import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../../src/app.mjs";
import { CURRICULUM_ORDER } from "../../helpers/curriculum.mjs";
import { createFakeCluster } from "../../helpers/fake-cluster.mjs";

/**
 * Learning history recorded before the curriculum revision (when k8s-0001..k8s-0010 were all
 * Level 0) against the revised curriculum. Ids are stable, so every record keeps meaning the
 * exercise it was earned on, wherever that exercise now sits.
 */
const quiet = { warn() {}, error() {} };

function withApp(fn) {
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "featherlab-compat-"));
  const app = createApp({ runner: createFakeCluster(), stateDir, logger: quiet });
  return Promise.resolve(fn(app)).finally(() => {
    app.persistence.close();
    rmSync(stateDir, { recursive: true, force: true });
  });
}

const complete = (app, exerciseId, at = "2026-10-20T10:00:00.000Z") =>
  app.persistence.progress.upsert({
    exerciseId,
    trackId: "kubernetes",
    completed: true,
    firstCompletedAt: at,
    lastAttemptedAt: at,
    attemptCount: 2,
    bestScoreEarned: 4,
    bestScorePossible: 4,
  });

test("an advanced exercise completed under the old curriculum stays completed and open", () =>
  withApp(async ({ service, persistence }) => {
    // Old history: k8s-0001, k8s-0002 and the (then Level 0) wrong-image lab.
    for (const id of ["k8s-0001", "k8s-0002", "k8s-0004"]) complete({ persistence }, id);

    const relocated = service.getExerciseProgress("k8s-0004");
    assert.equal(relocated.state, "completed", "never re-locked behind the new Level 0");
    assert.equal(relocated.firstCompletedAt, "2026-10-20T10:00:00.000Z");
    assert.equal(relocated.bestScoreEarned, 4);
    await service.activate("k8s-0004"); // a completed exercise can be practised again

    // Its never-completed neighbours are gated by the new foundations, as designed.
    assert.equal(service.getExerciseProgress("k8s-0003").state, "locked");
    assert.deepEqual(service.getExerciseProgress("k8s-0003").unmetPrerequisites, ["k8s-0018"]);
    // k8s-0005 only needs k8s-0004, which this learner already earned.
    assert.equal(service.getExerciseProgress("k8s-0005").state, "available");
    // The new Level 0 opens after k8s-0001.
    for (const id of ["k8s-0011", "k8s-0012", "k8s-0013"])
      assert.equal(service.getExerciseProgress(id).state, "available", id);
  }));

test("track progress counts every exercise once, in curriculum order", () =>
  withApp(({ service, persistence }) => {
    for (const id of ["k8s-0001", "k8s-0002", "k8s-0004"]) complete({ persistence }, id);
    const exercises = service.getTrackProgress("kubernetes");
    assert.deepEqual(
      exercises.map((e) => e.exerciseId),
      CURRICULUM_ORDER,
    );
    assert.equal(new Set(exercises.map((e) => e.exerciseId)).size, 34);
    assert.equal(exercises.filter((e) => e.state === "completed").length, 3);
    assert.deepEqual(
      exercises.filter((e) => e.state === "completed").map((e) => e.level),
      [0, 0, 2],
    );
  }));

test("a resume pointing at a relocated, now-locked exercise falls back safely", () =>
  withApp(({ service, persistence }) => {
    complete({ persistence }, "k8s-0001");
    complete({ persistence }, "k8s-0002");
    // Under the old graph k8s-0003 was unlocked by k8s-0002, so it may have been selected.
    persistence.resume.set({ trackId: "kubernetes", exerciseId: "k8s-0003" });

    const resume = service.getResume();
    assert.equal(resume.fallback, true);
    assert.notEqual(resume.exerciseId, "k8s-0003");
    assert.notEqual(service.getExerciseProgress(resume.exerciseId).state, "locked");
  }));

test("a resume pointing at a relocated exercise that is still open is kept", () =>
  withApp(({ service, persistence }) => {
    complete({ persistence }, "k8s-0004");
    persistence.resume.set({ trackId: "kubernetes", exerciseId: "k8s-0004" });
    assert.deepEqual(
      { ...service.getResume(), updatedAt: undefined },
      { trackId: "kubernetes", exerciseId: "k8s-0004", fallback: false, updatedAt: undefined },
    );
  }));
