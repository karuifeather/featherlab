import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAnswer } from "../../../src/core/knowledge-checks/evaluator.mjs";

const single = (correctId) => ({ type: "single-choice", correctIds: [correctId] });
const multi = (...ids) => ({ type: "multiple-select", correctIds: ids });

test("single-choice: correct match returns true", () => {
  assert.equal(evaluateAnswer("a", single("a")), true);
});

test("single-choice: wrong option returns false", () => {
  assert.equal(evaluateAnswer("b", single("a")), false);
});

test("single-choice: submitted array returns false", () => {
  assert.equal(evaluateAnswer(["a"], single("a")), false);
});

test("single-choice: null returns false", () => {
  assert.equal(evaluateAnswer(null, single("a")), false);
});

test("multiple-select: exact set match returns true", () => {
  assert.equal(evaluateAnswer(["a", "b"], multi("a", "b")), true);
});

test("multiple-select: order does not matter", () => {
  assert.equal(evaluateAnswer(["b", "a"], multi("a", "b")), true);
});

test("multiple-select: missing one returns false", () => {
  assert.equal(evaluateAnswer(["a"], multi("a", "b")), false);
});

test("multiple-select: extra one returns false", () => {
  assert.equal(evaluateAnswer(["a", "b", "c"], multi("a", "b")), false);
});

test("multiple-select: empty array returns false", () => {
  assert.equal(evaluateAnswer([], multi("a", "b")), false);
});

test("multiple-select: submitted string returns false", () => {
  assert.equal(evaluateAnswer("a", multi("a", "b")), false);
});

test("multiple-select: null returns false", () => {
  assert.equal(evaluateAnswer(null, multi("a", "b")), false);
});
