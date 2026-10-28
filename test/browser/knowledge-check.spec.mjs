import { test, expect } from "@playwright/test";
import { stubApi, forceDomTerminal, enterWorkspace, knowledgeCheckStub } from "./stubs.mjs";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fl-theme", "dark");
    } catch {
      /* storage blocked */
    }
  });
  await forceDomTerminal(page);
  await stubApi(page);
});

test("quiz item appears in sidebar with knowledge-check-item testid", async ({ page, baseURL }) => {
  await enterWorkspace(page, baseURL);
  const quizItem = page.getByTestId("knowledge-check-item");
  await expect(quizItem).toBeVisible();
  await expect(quizItem).toContainText(knowledgeCheckStub.title);
});

test("clicking a quiz item shows the knowledge check panel, not ExercisePanel", async ({
  page,
  baseURL,
}) => {
  await enterWorkspace(page, baseURL);

  // Initially the ExercisePanel is shown (a lab is the default)
  await expect(page.getByTestId("exercise-panel")).toBeVisible();

  // Click the quiz sidebar item
  await page.getByTestId("knowledge-check-item").click();

  // The exercise panel should be gone; the knowledge-check panel should appear
  await expect(page.getByTestId("knowledge-check-panel")).toBeVisible();
  await expect(page.getByTestId("exercise-panel")).toHaveCount(0);
});

test("knowledge check panel shows the quiz title", async ({ page, baseURL }) => {
  await enterWorkspace(page, baseURL);
  await page.getByTestId("knowledge-check-item").click();

  await expect(page.getByTestId("knowledge-check-panel")).toContainText(knowledgeCheckStub.title);
});

test("knowledge check panel does not show Check solution or Reset task buttons", async ({
  page,
  baseURL,
}) => {
  await enterWorkspace(page, baseURL);
  await page.getByTestId("knowledge-check-item").click();

  await expect(page.getByRole("button", { name: /check solution/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /reset task/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /activate/i })).toHaveCount(0);
});

test("submit button is disabled until all questions are answered", async ({ page, baseURL }) => {
  await enterWorkspace(page, baseURL);
  await page.getByTestId("knowledge-check-item").click();

  const submitBtn = page.getByTestId("kc-submit-btn");
  await expect(submitBtn).toBeVisible();
  await expect(submitBtn).toBeDisabled();
});

async function answerAllQuestions(page) {
  const questions = page.locator(".kc-question");
  // q1: single-choice — click the first option
  await questions.nth(0).locator(".kc-option").first().click();
  // q2: multiple-select — click the first two options
  await questions.nth(1).locator(".kc-option").nth(0).click();
  await questions.nth(1).locator(".kc-option").nth(1).click();
}

test("selecting all answers and submitting shows a result view with score", async ({
  page,
  baseURL,
}) => {
  await enterWorkspace(page, baseURL);
  await page.getByTestId("knowledge-check-item").click();

  // Wait for the quiz to load
  await expect(page.getByTestId("knowledge-check-panel")).toBeVisible();
  await expect(page.getByTestId("kc-submit-btn")).toBeVisible();

  await answerAllQuestions(page);

  // Submit button should now be enabled
  await expect(page.getByTestId("kc-submit-btn")).toBeEnabled();

  // Submit
  await page.getByTestId("kc-submit-btn").click();

  // Result view should appear
  await expect(page.getByTestId("kc-result")).toBeVisible();
  await expect(page.getByTestId("kc-score")).toContainText("2 / 2");
});

test("result view shows retry button after submission", async ({ page, baseURL }) => {
  await enterWorkspace(page, baseURL);
  await page.getByTestId("knowledge-check-item").click();

  await expect(page.getByTestId("knowledge-check-panel")).toBeVisible();

  await answerAllQuestions(page);
  await page.getByTestId("kc-submit-btn").click();

  // Retry button should appear
  await expect(page.getByTestId("kc-retry-btn")).toBeVisible();
});

test("clicking retry reloads the quiz form", async ({ page, baseURL }) => {
  await enterWorkspace(page, baseURL);
  await page.getByTestId("knowledge-check-item").click();

  await expect(page.getByTestId("knowledge-check-panel")).toBeVisible();

  await answerAllQuestions(page);
  await page.getByTestId("kc-submit-btn").click();

  // Wait for result
  await expect(page.getByTestId("kc-result")).toBeVisible();

  // Click retry
  await page.getByTestId("kc-retry-btn").click();

  // The result should be gone; the quiz form should be back
  await expect(page.getByTestId("kc-result")).toHaveCount(0);
  await expect(page.getByTestId("kc-submit-btn")).toBeVisible();
});

// Lab items must still use data-testid="lesson" (existing tests depend on this).
test("lab items in sidebar still use lesson testid, not knowledge-check-item", async ({
  page,
  baseURL,
}) => {
  await enterWorkspace(page, baseURL);
  const lessons = page.getByTestId("lesson");
  // 3 exercises in the default stub
  await expect(lessons).toHaveCount(3);
});

// Switching from a quiz back to a lab shows ExercisePanel.
test("switching from quiz back to a lab restores the exercise panel", async ({ page, baseURL }) => {
  await enterWorkspace(page, baseURL);

  // Go to quiz
  await page.getByTestId("knowledge-check-item").click();
  await expect(page.getByTestId("knowledge-check-panel")).toBeVisible();

  // Go back to a lab
  await page.getByTestId("lesson").first().click();
  await expect(page.getByTestId("exercise-panel")).toBeVisible();
  await expect(page.getByTestId("knowledge-check-panel")).toHaveCount(0);
});
