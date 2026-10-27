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

// Progress: first-time learner sees Start Learning and real (zero) progress.
test("first-time learner sees Start Learning, not Continue", async ({ page, baseURL }) => {
  // resume is the backend fallback with nothing completed → first-time learner
  await page.goto(baseURL);
  await expect(page.getByRole("button", { name: "Start Learning" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue Learning" })).toHaveCount(0);
  await expect(page.getByTestId("track-progress-count")).toHaveText("0 of 3 completed");
  await expect(page.getByTestId("resume-target")).toContainText("Start with");
  await expect(page.getByTestId("resume-target")).toContainText("Your first Pod");
});

// Progress: returning learner sees Continue Learning with the backend's resume target.
test("returning learner sees Continue Learning with exercise title and count", async ({
  page,
  baseURL,
}) => {
  await stubApi(page, {
    resume: {
      trackId: "kubernetes",
      exerciseId: "k8s-0002",
      updatedAt: "2024-01-01T08:00:00.000Z",
      fallback: false,
    },
    progressData: withProgress,
  });
  await page.goto(baseURL);
  await expect(page.getByRole("button", { name: "Continue Learning" })).toBeVisible();
  await expect(page.getByTestId("track-progress-count")).toHaveText("1 of 3 completed");
  await expect(page.getByTestId("resume-target")).toContainText("Resume");
  await expect(page.getByTestId("resume-target")).toContainText("Run a Deployment");

  // Continue opens the workspace on the resumed exercise.
  await page.getByRole("button", { name: "Continue Learning" }).click();
  await expect(page.getByTestId("exercise-panel")).toBeVisible();
  await expect(page.locator('[data-testid="lesson"][aria-current="true"]')).toContainText(
    "Run a Deployment",
  );
});

test("launcher shows only real tracks: no Coming Soon placeholders", async ({ page, baseURL }) => {
  await page.goto(baseURL);
  await expect(page.getByRole("button", { name: "Start Learning" })).toBeVisible();
  const text = await page.locator(".launcher").innerText();
  for (const placeholder of [/postgres/i, /\blinux\b/i, /soon/i, /planned/i])
    expect(text).not.toMatch(placeholder);
  await expect(page.locator(".track-row")).toHaveCount(1);
});

test("launcher curriculum shows completed and locked states and opens exercises", async ({
  page,
  baseURL,
}) => {
  await stubApi(page, { progressData: withLockedExercise });
  await page.goto(baseURL);
  const items = page.getByTestId("curriculum-item");
  await expect(items).toHaveCount(3);
  await expect(items.nth(1)).toHaveAttribute("data-state", "locked");
  await expect(items.nth(1)).toHaveAttribute("aria-disabled", "true");
  await expect(items.nth(1)).toHaveAccessibleName(/Locked, requires: Your first Pod/);

  // A locked entry never opens the workspace.
  // (force: Playwright would otherwise refuse to click an aria-disabled element.)
  await items.nth(1).click({ force: true });
  await expect(page.locator(".launcher")).toBeVisible();
  await expect(page.locator(".workspace")).toHaveCount(0);

  await items.nth(2).click();
  await expect(page.locator('[data-testid="lesson"][aria-current="true"]')).toContainText(
    "Expose a Service",
  );
});

for (const width of [1440, 900, 390]) {
  test(`launcher header and content share one container at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(baseURL);
    await expect(page.locator(".track-row")).toBeVisible();
    const header = await page.locator(".topbar-inner").boundingBox();
    const content = await page.locator(".launcher-content").boundingBox();
    expect(Math.abs(header.x - content.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(header.width - content.width)).toBeLessThanOrEqual(1);
    // No horizontal page scroll.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("theme toggle switches between dark and light tokens", async ({ page, baseURL }) => {
  await page.goto(baseURL);
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await bg()).toBe("rgb(13, 14, 16)");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bg()).toBe("rgb(248, 249, 250)");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  expect(await bg()).toBe("rgb(13, 14, 16)");
});

// Brand: the original FeatherLab teal is back as the accent (primary action, focus ring,
// selection rail, progress fill) while every surface stays neutral grey — no green wash.
for (const theme of ["dark", "light"]) {
  test(`${theme} theme: brand accents on a neutral foundation`, async ({ page, baseURL }) => {
    await page.addInitScript((t) => localStorage.setItem("fl-theme", t), theme);
    await stubApi(page, { progressData: withProgress });
    await page.goto(baseURL);
    const css = (selector, prop, pseudo = null) =>
      page
        .locator(selector)
        .first()
        .evaluate((el, [p, ps]) => getComputedStyle(el, ps)[p], [prop, pseudo]);
    const rgb = (value) =>
      value
        .match(/\d+(\.\d+)?/g)
        .slice(0, 3)
        .map(Number);
    const neutral = (value) => {
      const [r, g, b] = rgb(value);
      return Math.max(r, g, b) - Math.min(r, g, b) <= 6;
    };
    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const get = (n) => s.getPropertyValue(n).trim().toLowerCase();
      return { primary: get("--primary"), focus: get("--focus-ring"), accent: get("--accent") };
    });
    expect(tokens.primary).toBe("#4a7c7c");
    expect(tokens.focus).toBe(theme === "dark" ? "#6fb0ac" : "#4a7c7c");

    // The primary action carries the brand; the meter fill uses the accent.
    expect(rgb(await css(".btn-primary", "backgroundColor"))).toEqual([74, 124, 124]);
    const meter = await css(".track-meter span", "backgroundColor");
    expect(rgb(meter)).toEqual(theme === "dark" ? [131, 192, 187] : [59, 106, 106]);

    // Surfaces stay neutral.
    for (const selector of ["body", ".topbar", ".track-row", ".curriculum"])
      expect(neutral(await css(selector, "backgroundColor")), selector).toBe(true);

    // Focus is visible and on-brand.
    await page.locator(".btn-primary").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    expect(await css(".btn-primary", "outlineStyle")).toBe("solid");
    expect(rgb(await css(".btn-primary", "outlineColor"))).toEqual(
      theme === "dark" ? [111, 176, 172] : [74, 124, 124],
    );

    // In the workspace: brand selection rail, neutral panels, success stays distinct.
    await page.getByRole("button", { name: "Continue Learning" }).click();
    await page.locator(".lesson.selected").waitFor();
    const rail = await css(".lesson.selected", "backgroundColor", "::before");
    expect(rgb(rail)).toEqual(theme === "dark" ? [131, 192, 187] : [59, 106, 106]);
    for (const selector of [".sidebar", ".problem"])
      expect(neutral(await css(selector, "backgroundColor")), selector).toBe(true);
    const success = await css(".lesson.completed .lesson-ord", "color");
    expect(rgb(success)).not.toEqual(rgb(rail));
  });
}

test("collapsed sidebar centres ordinals and state icons in every row", async ({
  page,
  baseURL,
}) => {
  await stubApi(page, { progressData: withLockedExercise });
  await enterWorkspace(page, baseURL);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator(".workspace.sidebar-collapsed")).toBeVisible();

  const rows = page.locator(".lesson, .level-header");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const offset = await rows.nth(i).evaluate((row) => {
      const glyph = row.querySelector(".lesson-ord, .level-caret");
      const a = row.getBoundingClientRect();
      const b = glyph.getBoundingClientRect();
      return Math.abs(a.left + a.width / 2 - (b.left + b.width / 2));
    });
    expect(offset).toBeLessThanOrEqual(1.5);
  }

  // Expanding restores titles.
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator(".lesson-title").first()).toBeVisible();
});

test("terminal toolbar has only functional controls and no fake window buttons", async ({
  page,
  baseURL,
}) => {
  await enterWorkspace(page, baseURL);
  const bar = page.locator(".terminal-bar");
  await expect(bar).toContainText("Linux workstation");
  await expect(page.locator(".terminal-dots")).toHaveCount(0);
  // Every button in the toolbar has an accessible name.
  const names = await bar
    .getByRole("button")
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") || el.textContent.trim()));
  expect(names).toEqual(["Maximize terminal"]);
});

test("terminal rows render raw output exactly, including after a pane resize", async ({
  page,
  baseURL,
}) => {
  await enterWorkspace(page, baseURL);
  const rows = page.locator(".xterm-rows > div");
  await expect(page.locator(".xterm-rows")).toContainText("bin   dev");
  const rowTexts = async () =>
    (await rows.allInnerTexts()).map((t) => t.replace(/\u00a0/g, " ").trimEnd());
  const check = async () => {
    const texts = await rowTexts();
    expect(texts).toContain("bin   dev  home  lib64  mnt  proc  run   srv  tmp  var");
    expect(texts.filter((t) => t.startsWith("learner@workstation:~$")).length).toBe(3);
  };
  await check();

  // Drag the split handle; the terminal refits and content stays intact.
  const handle = await page.locator(".split-handle").boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x - 120, handle.y + 200, { steps: 5 });
  await page.mouse.up();
  await check();
});

test("terminal grid fits inside its panel after resizing and maximizing", async ({
  page,
  baseURL,
}) => {
  await enterWorkspace(page, baseURL);
  await expect(page.locator(".xterm-rows")).toContainText("workstation");

  const fits = () =>
    page.locator(".terminal-host").evaluate((host) => {
      const screen = host.querySelector(".xterm-screen").getBoundingClientRect();
      const box = host.getBoundingClientRect();
      return {
        right: box.right - screen.right,
        bottom: box.bottom - screen.bottom,
        widthUsed: screen.width / box.width,
      };
    });
  const expectFit = async () => {
    await expect
      .poll(async () => {
        const f = await fits();
        return f.right >= 0 && f.bottom >= 0 && f.widthUsed > 0.85;
      })
      .toBe(true);
  };
  await expectFit();
  // The area around the cell grid matches the panel (no black inner frame).
  const backgrounds = await page
    .locator(".terminal-host")
    .evaluate((host) => [
      getComputedStyle(host).backgroundColor,
      getComputedStyle(host.querySelector(".xterm-viewport")).backgroundColor,
    ]);
  expect(backgrounds[1]).toBe(backgrounds[0]);
  await page.getByRole("button", { name: "Maximize terminal" }).click();
  await expectFit();
  await page.getByRole("button", { name: "Restore layout" }).click();
  await expectFit();
  await page.setViewportSize({ width: 1100, height: 700 });
  await expectFit();
});

// The PTY can only match the grid if the browser reports it: once on open (the server holds
// it until the shell exists), then again whenever the grid changes, and never redundantly.
test("terminal reports its real grid size on open, on maximize/restore and on reconnect", async ({
  page,
  baseURL,
}) => {
  const { terminalMessages } = await stubApi(page, { firstSessionCloseCode: 1000 });
  await enterWorkspace(page, baseURL);
  const resizes = (session) =>
    terminalMessages.filter((m) => m.type === "resize" && m.session === session);
  const gridRows = () => page.locator(".xterm-rows > div").count();
  const last = (session) => resizes(session).at(-1);

  await expect.poll(() => resizes(1).length).toBeGreaterThan(0);
  // The first report is already the fitted size, not xterm's 80x24 default.
  expect(resizes(1)[0].rows).toBe(await gridRows());
  expect(resizes(1)[0]).not.toMatchObject({ cols: 80, rows: 24 });

  // Session 1 ends (stub closes it); reconnect and work with session 2.
  await page.getByRole("button", { name: "Reconnect" }).click();
  await expect.poll(() => resizes(2).length).toBeGreaterThan(0);
  const restored = last(2);
  expect(restored.rows).toBe(await gridRows());

  await page.getByRole("button", { name: "Maximize terminal" }).click();
  await expect.poll(() => last(2).cols).toBeGreaterThan(restored.cols + 20);
  expect(last(2).rows).toBe(await gridRows());

  await page.getByRole("button", { name: "Restore layout" }).click();
  await expect.poll(() => last(2).cols).toBe(restored.cols);
  expect(last(2).rows).toBe(await gridRows());

  // No size is sent twice in a row.
  const sizes = resizes(2).map((m) => `${m.cols}x${m.rows}`);
  expect(sizes.filter((s, i) => s === sizes[i - 1])).toEqual([]);
});

test("terminal size follows sidebar collapse/expand and the mobile tab switch", async ({
  page,
  baseURL,
}) => {
  const { terminalMessages } = await stubApi(page);
  const last = () => terminalMessages.filter((m) => m.type === "resize").at(-1);
  const gridRows = () => page.locator(".xterm-rows > div").count();

  await enterWorkspace(page, baseURL);
  await expect.poll(() => last()?.rows).toBe(await gridRows());
  const expanded = last();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect.poll(() => last().cols).toBeGreaterThan(expanded.cols);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect.poll(() => last().cols).toBe(expanded.cols);

  // Phone layout: the terminal tab is hidden while Problem is shown. The socket opens while
  // the host is display:none, so the first report is xterm's default grid; showing the tab
  // must correct it to the real fitted size.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("button", { name: /^(Start|Continue) Learning$/ }).click();
  await page.getByRole("tab", { name: "Terminal" }).click();
  await expect(page.locator(".terminal-host")).toBeVisible();
  await expect
    .poll(async () => {
      const size = last();
      return size && size.rows === (await gridRows()) && size.cols < 60;
    })
    .toBe(true);
});

test("an ended shell reports why and Reconnect opens a fresh session", async ({
  page,
  baseURL,
}) => {
  await stubApi(page, { firstSessionCloseCode: 1000 });
  await enterWorkspace(page, baseURL);
  const status = page.getByTestId("terminal-connection-status");
  await expect(page.locator(".xterm-rows")).toContainText(
    "Terminal disconnected: the shell exited",
  );
  await expect(status).toHaveAttribute("data-connected", "false");

  await page.getByRole("button", { name: "Reconnect" }).click();
  await expect(status).toHaveAttribute("data-connected", "true");
  await expect(page.locator(".xterm-rows")).toContainText("session-2");
  await expect(page.locator(".xterm-rows")).not.toContainText("session-1");
  await expect(page.getByRole("button", { name: "Reconnect" })).toHaveCount(0);
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
  await expect(page.locator('[data-testid="next-exercise-note"]')).toContainText(
    "fresh environment",
  );
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
