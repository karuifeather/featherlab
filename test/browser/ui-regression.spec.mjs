import { test, expect } from "@playwright/test";
import { stubApi, forceDomTerminal, enterWorkspace } from "./stubs.mjs";

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
