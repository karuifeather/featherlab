import { test, expect } from "@playwright/test";
import {
  stubApi,
  forceDomTerminal,
  enterWorkspace,
  withLockedExercise,
  withProgress,
} from "./stubs.mjs";

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

// Regression for the maximize bug: with `grid-template-columns: 0 0 1fr` the terminal
// auto-placed into the zero-width track and rendered blank (~12px). It must now fill.
test("maximizing the terminal fills the pane and keeps the shell visible", async ({
  page,
  baseURL,
}) => {
  await enterWorkspace(page, baseURL);

  const terminal = page.locator(".split-terminal");
  await expect(page.locator(".xterm-rows")).toContainText("workstation", { timeout: 15_000 });
  const before = (await terminal.boundingBox()).width;

  await page.getByRole("button", { name: "Maximize terminal" }).click();

  // The terminal should grow to roughly the full split width.
  await expect
    .poll(async () => (await terminal.boundingBox()).width, { timeout: 10_000 })
    .toBeGreaterThan(before + 150);

  // Chrome stays present with a working way back, and the shell content is not blank.
  await expect(page.locator(".terminal-bar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore layout" })).toBeVisible();
  await expect(page.locator(".xterm-rows")).toContainText("workstation");

  // Restore returns to the split and re-reveals the problem panel.
  await page.getByRole("button", { name: "Restore layout" }).click();
  await expect(page.getByTestId("exercise-panel")).toBeVisible();
});

// Progress: first-time learner sees "Enter workspace" and no progress count.
test("first-time learner sees start experience with no progress indicators", async ({
  page,
  baseURL,
}) => {
  // resume is null (default) → first-time learner
  await page.goto(baseURL);
  await expect(page.getByRole("button", { name: /Kubernetes/ })).toContainText("Enter workspace");
  await expect(page.getByRole("button", { name: /Kubernetes/ })).not.toContainText("Continue");
  await expect(page.getByRole("button", { name: /Kubernetes/ })).not.toContainText("completed");
});

// Progress: returning learner sees Continue Learning.
test("returning learner sees Continue Learning with exercise title and count", async ({
  page,
  baseURL,
}) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fl-theme", "dark");
    } catch {
      /* storage blocked */
    }
  });
  await forceDomTerminal(page);
  // Override the default stub with resume state
  await page.route("**/api/resume", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resume: {
          trackId: "kubernetes",
          exerciseId: "k8s-0001",
          updatedAt: "2024-01-01T08:00:00.000Z",
          fallback: false,
        },
      }),
    }),
  );
  await page.route(/\/api\/progress\/track\/[^/]+/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(withProgress),
    }),
  );
  await stubApi(page, {
    resume: {
      trackId: "kubernetes",
      exerciseId: "k8s-0001",
      updatedAt: "2024-01-01T08:00:00.000Z",
      fallback: false,
    },
    progressData: withProgress,
  });
  await page.goto(baseURL);
  const k8sCard = page.getByRole("button", { name: /Kubernetes/ });
  await expect(k8sCard).toContainText("Continue Learning");
  await expect(k8sCard).toContainText("1 of 3 completed");
  await expect(k8sCard).toContainText("Your first Pod");
});

// Progress: locked exercise shows lock symbol and is not clickable.
test("locked exercise shows lock indicator and cannot be selected", async ({ page, baseURL }) => {
  await stubApi(page, { progressData: withLockedExercise });
  await enterWorkspace(page, baseURL);

  const lessons = page.locator('[data-testid="lesson"]');
  // Second lesson (k8s-0002) should be locked
  const lockedLesson = lessons.nth(1);
  await expect(lockedLesson).toContainText("⊘");
  await expect(lockedLesson).toHaveAttribute("aria-disabled", "true");
  await expect(lockedLesson).toContainText("Requires:");
  // The first lesson should still be active/available
  const firstLesson = lessons.nth(0);
  await expect(firstLesson).not.toHaveAttribute("aria-disabled", "true");
});

// Progress: completed exercise shows checkmark and remains selectable.
test("completed exercise shows checkmark and can be revisited", async ({ page, baseURL }) => {
  await stubApi(page, { progressData: withProgress });
  await enterWorkspace(page, baseURL);

  const lessons = page.locator('[data-testid="lesson"]');
  const completedLesson = lessons.nth(0);
  await expect(completedLesson).toContainText("✓");
  // Clicking a completed exercise should work (not blocked)
  await completedLesson.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

// Progress: sidebar shows completed/total count.
test("sidebar shows track progress summary", async ({ page, baseURL }) => {
  await stubApi(page, { progressData: withProgress });
  await enterWorkspace(page, baseURL);

  await expect(page.locator(".sidebar-progress")).toContainText("1 / 3");
});

// Progress: passing exercise (not yet completed) shows completion feedback and next exercise button.
test("first successful check shows completion feedback and next exercise button", async ({
  page,
  baseURL,
}) => {
  // Use default noProgress stub (k8s-0001 not yet completed) so first-completion fires.
  await enterWorkspace(page, baseURL);

  await page.getByRole("button", { name: "Check solution" }).click();
  // First click → partial result (not a pass), second click → pass
  await page.getByRole("button", { name: "Check solution" }).click();
  await expect(page.getByTestId("check-results")).toBeVisible();
  await expect(page.locator('[data-testid="completion-feedback"]')).toBeVisible();
  await expect(page.locator('[data-testid="completion-feedback"]')).toContainText(
    "Exercise completed",
  );
  await expect(page.locator('[data-testid="next-exercise-btn"]')).toBeVisible();
});

// Regression for code-block clipping: a flex-column scroll body shrank tall <pre> blocks.
test("code blocks are fully readable after hints and results are shown", async ({
  page,
  baseURL,
}) => {
  await enterWorkspace(page, baseURL);

  // Add content below the code block so the panel must scroll rather than shrink children.
  await page.getByRole("button", { name: "Need a hint?" }).click();
  await page.getByRole("button", { name: /Next hint/ }).click();
  await page.getByRole("button", { name: "Check solution" }).click();
  await expect(page.getByTestId("check-results")).toBeVisible();

  const blocks = page.locator(".code-block");
  const count = await blocks.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const { clientHeight, scrollHeight } = await blocks.nth(i).evaluate((el) => ({
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
    }));
    // No vertical clipping: the rendered box holds its full content (±1px rounding).
    expect(scrollHeight - clientHeight).toBeLessThanOrEqual(1);
  }
});
