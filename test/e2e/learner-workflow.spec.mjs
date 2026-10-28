import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { assertTestWorkstation } from "../helpers/isolated-environment.mjs";

/**
 * One learner, one ordered story, real backend, real kind cluster, real terminal.
 * Only the final test injects a fault, and it does so by pausing the (disposable) test
 * workstation, so the failure the UI shows comes from the real API.
 */
test.describe.configure({ mode: "serial" });

let page;
let terminalText;
// Every size the browser reports on the terminal socket (xterm's own cols × rows).
const sentSizes = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // Force xterm's DOM renderer so terminal output is readable text rather than WebGL pixels.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return type === "webgl2" || type === "webgl" ? null : original.call(this, type, ...rest);
    };
  });
  terminalText = () => page.locator(".xterm-rows");
  page.on("websocket", (socket) =>
    socket.on("framesent", ({ payload }) => {
      try {
        const msg = JSON.parse(String(payload));
        if (msg.type === "resize") sentSizes.push(msg);
      } catch {
        /* binary or non-JSON frame */
      }
    }),
  );
});
test.afterAll(async () => page?.close());

const terminalConnected = () =>
  page.locator('[data-testid="terminal-connection-status"][data-connected="true"]');

async function runInTerminal(command) {
  await page.locator(".xterm-screen").click();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

const lessons = () => page.locator('[data-testid="lesson"]');
const checkButton = () => page.getByRole("button", { name: "Check solution" });
const resetButton = () => page.getByRole("button", { name: "Reset task" });
const environmentConfirm = () => page.locator('[data-testid="environment-confirm"]');
/** The sidebar lesson whose own title is exactly `title`. Locked lessons carry prerequisite
 * titles in their aria-label only, not as visible text, so the title locator avoids false
 * matches on prerequisite names that happen to match another exercise's title. */
const lesson = (title) =>
  lessons().filter({ has: page.locator(".lesson-title").getByText(title, { exact: true }) });

test("launcher offers the Kubernetes track, in curriculum order across three levels", async () => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kubernetes" })).toBeVisible();
  await page.getByRole("button", { name: /^(Start|Continue) Learning$/ }).click();
  // Level 0 is open by default (it holds the first exercise). Expand Level 1 and Level 2
  // so the full list of 34 labs is in the DOM and can be addressed by index.
  const levelHeaders = page.locator(".level-header");
  await expect(page.locator(".level-label")).toHaveText(["Level 0", "Level 1", "Level 2"]);
  await levelHeaders.nth(1).click(); // expand Level 1
  await levelHeaders.nth(2).click(); // expand Level 2
  await expect(lessons()).toHaveCount(34);
  // Backend order, not id order: k8s-0011..k8s-0014 come before k8s-0002.
  await expect(lessons().nth(0)).toContainText("Your first Pod");
  await expect(lessons().nth(1)).toContainText("Inspect a Pod");
  await expect(lessons().nth(5)).toContainText("Run a Deployment");
  await expect(lessons().nth(9)).toContainText("Foundations Challenge");
  await expect(lessons().nth(10)).toContainText("Meet the ReplicaSet");
  await expect(lessons().nth(17)).toContainText("RollingUpdate vs Recreate");
  await expect(lessons().nth(33)).toContainText("Workload Recovery Mastery");
});

test("locked exercises explain which prerequisite unlocks them", async () => {
  // Prerequisites are not shown as visible subtitle text; they are in aria-label.
  await expect(lesson("Inspect a Pod")).toHaveAttribute("aria-disabled", "true");
  await expect(lesson("Inspect a Pod")).toHaveAccessibleName(/requires: Your first Pod/i);
  // Levels 1 and 2 wait behind the Level 0 challenge.
  await expect(lesson("Namespace Matters")).toHaveAttribute("aria-disabled", "true");
  await expect(lesson("Namespace Matters")).toHaveAccessibleName(
    /requires: Foundations Challenge/i,
  );
  await expect(lesson("The Wrong Image")).toHaveAttribute("aria-disabled", "true");
});

test("the first exercise is loaded dynamically from the API", async () => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your first Pod");
  const panel = page.locator('[data-testid="exercise-panel"]');
  await expect(panel).toContainText("Every exercise has its own namespace");
  await expect(panel).toContainText("-n fl-k8s-0001");
  // The statement explains namespaces without handing out the command.
  await expect(panel).not.toContainText("kubectl run web");
  const requirements = page.locator('[data-testid="requirements"] li');
  await expect(requirements).toHaveCount(4);
  await expect(requirements.first()).toContainText("fl-k8s-0001");
  await expect(requirements.nth(1)).toContainText("web");
  await expect(requirements.nth(2)).toContainText("nginx:1.27");

  await page.getByRole("button", { name: "Need a hint?" }).click();
  await expect(page.locator('[data-testid="hint"]')).toContainText("kubectl run --help");
  await page.getByRole("button", { name: /Next hint/ }).click();
  await expect(page.locator('[data-testid="hint"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="hint"]').nth(1)).toContainText("-n fl-k8s-0001");
});

test("a real terminal connects and runs kubectl against the test cluster", async () => {
  await expect(terminalConnected()).toBeVisible({ timeout: 30_000 });
  await runInTerminal("export FL_MARK=session-one");
  await runInTerminal("kubectl get nodes");
  await expect(terminalText()).toContainText("control-plane", { timeout: 60_000 });
  await expect(terminalText()).toContainText("Ready");
});

// Regression: the exec stream was Docker-multiplexed, so each chunk's 8-byte frame header
// leaked its length byte into the terminal (e.g. "V" before the prompt, "P" before `bin`).
test("real shell output reaches xterm without stray frame bytes", async () => {
  await runInTerminal("clear; ls /");
  const rows = page.locator(".xterm-rows > div");
  await expect(page.locator(".xterm-rows")).toContainText("proc");
  const texts = (await rows.allInnerTexts()).map((t) => t.replace(/\u00a0/g, " ").trim());
  const listing = texts.find((t) => /\bproc\b/.test(t) && /\bbin\b/.test(t));
  expect(listing, texts.join("\n")).toBeDefined();
  expect(listing.startsWith("bin")).toBe(true);
  for (const prompt of texts.filter((t) => t.includes("learner@")))
    expect(prompt.startsWith("learner@"), prompt).toBe(true);
});

const gridRows = () => page.locator(".xterm-rows > div").count();
const rowTexts = async () =>
  (await page.locator(".xterm-rows > div").allInnerTexts()).map((t) =>
    t.replace(/\u00a0/g, " ").trimEnd(),
  );

/** The PTY size the shell reports must equal xterm's grid: its rows on screen and the
 * cols × rows it reported. */
async function expectPtyMatchesGrid() {
  await runInTerminal("clear; echo PTY=$(stty size)/$(tput lines)/$(tput cols)");
  await expect
    .poll(async () => {
      const line = (await rowTexts()).find((t) => t.startsWith("PTY="));
      const [rows, cols, tputLines, tputCols] =
        line
          ?.match(/^PTY=(\d+) (\d+)\/(\d+)\/(\d+)$/)
          ?.slice(1)
          .map(Number) ?? [];
      const grid = await gridRows();
      const sent = sentSizes.at(-1);
      const xterm = `${sent?.cols}x${grid}`;
      const pty = `${cols}x${rows}`;
      const tput = `${tputCols}x${tputLines}`;
      // Shown on failure: what the shell sees vs. what xterm shows and reported.
      return {
        pty,
        tput,
        xterm,
        sentRows: sent?.rows,
        ok: pty === xterm && tput === xterm && sent?.rows === grid,
      };
    })
    .toMatchObject({ ok: true });
}

/** Vim's status line sits on the second-to-last row: it fills the whole grid. Returns the
 * status line's width, which tracks the PTY's columns (the ruler is right-aligned). */
async function expectVimFillsGrid() {
  await expect
    .poll(async () => {
      const texts = await rowTexts();
      return texts.findIndex((t) => t.startsWith("[No Name]")) === texts.length - 2;
    })
    .toBe(true);
  return (await rowTexts()).at(-2).length;
}

// Regression: the browser's first size reached the server before the exec existed and was
// dropped, so the PTY stayed 0x0 and vim drew only 24 rows, leaving the panel bottom empty.
test("the PTY matches the terminal grid and vim fills it through maximize and restore", async () => {
  await expectPtyMatchesGrid();
  await runInTerminal("vim -u NONE -c 'set laststatus=2 ruler'");
  const width = await expectVimFillsGrid();
  const restoredRows = await gridRows();

  // Maximizing widens the grid: vim must redraw at the new column count, then shrink back.
  await page.getByRole("button", { name: "Maximize terminal" }).click();
  await expect.poll(expectVimFillsGrid).toBeGreaterThan(width + 20);
  await page.getByRole("button", { name: "Restore layout" }).click();
  await expect.poll(expectVimFillsGrid).toBe(width);
  expect(await gridRows()).toBe(restoredRows);

  // The toolbar buttons took keyboard focus; give it back to the terminal before quitting.
  await page.locator(".xterm-screen").click();
  await page.keyboard.press("Escape");
  await page.keyboard.type(":q!");
  await page.keyboard.press("Enter");
  await expectPtyMatchesGrid();
});

test("checking before solving shows failing checks", async () => {
  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toContainText("0/4 checks passed");
  await expect(page.locator('[data-testid="check-results"]')).toContainText("was not found");
});

test("forgetting the namespace is explained, not silently graded", async () => {
  // The classic mistake: no -n, so the Pod lands in `default`.
  await runInTerminal("kubectl run web --image=nginx:1.27");
  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"]')).toContainText(
    'exists, but in namespace "default" instead of "fl-k8s-0001"',
  );
  await expect(page.locator('[data-testid="check-results"] h3')).toContainText("0/4 checks passed");
});

test("solving the exercise in the browser terminal passes grading", async () => {
  await runInTerminal("kubectl run web --image=nginx:1.27 -n fl-k8s-0001");
  await runInTerminal("kubectl wait --for=condition=Ready pod/web -n fl-k8s-0001 --timeout=240s");
  await expect(terminalText()).toContainText("condition met", { timeout: 260_000 });

  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toHaveText("✓ Passed");
});

test("switching exercises keeps the terminal session but clears the previous work", async () => {
  // Passing the first Pod opened three follow-ups.
  for (const title of ["Inspect a Pod", "Working With YAML", "Namespaces 101"])
    await expect(lesson(title)).not.toHaveAttribute("aria-disabled", "true");
  await expect(lesson("Run a Deployment")).toHaveAttribute("aria-disabled", "true");

  await lesson("Inspect a Pod").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inspect a Pod");
  await expect(page.locator('[data-testid="requirements"] li').first()).toContainText(
    "fl-k8s-0011",
  );

  // The cluster still holds exercise 1: nothing is reset until the learner confirms.
  await expect(environmentConfirm()).toContainText("Your first Pod");
  await expect(checkButton()).toBeDisabled();
  await runInTerminal('kubectl get pod web -n fl-k8s-0001 -o name && echo "kept-$((20+1))"');
  await expect(terminalText()).toContainText("kept-21");
  await page.getByRole("button", { name: "Start this exercise" }).click();
  await expect(environmentConfirm()).toHaveCount(0);

  await expect(terminalConnected()).toBeVisible();
  await runInTerminal('echo "$FL_MARK-survived"');
  await expect(terminalText()).toContainText("session-one-survived");

  // The new exercise starts unsolved, and exercise 1's namespace was deleted when it took over.
  await expect(checkButton()).toBeEnabled({ timeout: 180_000 });
  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).not.toHaveText("✓ Passed");
  await expect(page.locator('[data-testid="check-results"]')).toContainText("review");
  await runInTerminal("kubectl get pod web -n fl-k8s-0001");
  await expect(terminalText()).toContainText('namespaces "fl-k8s-0001" not found');
  // The learner's own Pod in `default` was never touched.
  await runInTerminal('kubectl get pod web -n default -o name && echo "own-$((30+3))"');
  await expect(terminalText()).toContainText("own-33");
});

test("a revisited exercise starts fresh; resetting removes the learner's work", async () => {
  await lesson("Your first Pod").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your first Pod");
  await expect(environmentConfirm()).toContainText("Inspect a Pod");
  await page.getByRole("button", { name: "Start this exercise" }).click();
  // Completed earlier, but stale work is gone: it has to be solved again.
  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toContainText("0/4 checks passed");

  await runInTerminal("kubectl run web --image=nginx:1.27 -n fl-k8s-0001");
  // The arithmetic keeps the typed command itself from matching the marker.
  await runInTerminal(
    'kubectl wait --for=condition=Ready pod/web -n fl-k8s-0001 --timeout=240s && echo "ready-again-$((40+2))"',
  );
  await expect(terminalText()).toContainText("ready-again-42", { timeout: 260_000 });
  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toHaveText("✓ Passed");

  await resetButton().click();
  await expect(page.locator('[data-testid="check-results"]')).toHaveCount(0);
  await runInTerminal("clear; kubectl get pod web -n fl-k8s-0001");
  await expect(terminalText()).toContainText('pods "web" not found');

  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toContainText("0/4 checks passed");
});

test("inspecting with logs and labelling solves Inspect a Pod and unlocks Labels", async () => {
  await lesson("Inspect a Pod").click();
  await page.getByRole("button", { name: "Start this exercise" }).click();
  await expect(environmentConfirm()).toHaveCount(0);
  // The environment is ready (namespaces recreated) once grading is enabled again.
  await expect(checkButton()).toBeEnabled({ timeout: 180_000 });
  // The statement explains the tools but does not say which Pod it is.
  await expect(page.locator('[data-testid="exercise-panel"]')).not.toContainText("bravo review");

  await runInTerminal(
    'clear; kubectl wait --for=condition=Ready pod/alpha pod/bravo -n fl-k8s-0011 --timeout=240s && echo "up-$((10+1))"',
  );
  await expect(terminalText()).toContainText("up-11", { timeout: 260_000 });
  await runInTerminal("kubectl logs bravo -n fl-k8s-0011");
  await expect(terminalText()).toContainText("status: needs-review");
  await runInTerminal("kubectl label pod bravo review=needed -n fl-k8s-0011");
  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toHaveText("✓ Passed");
  await expect(lesson("Labels and Selectors")).not.toHaveAttribute("aria-disabled", "true");
  await expect(lesson("Run a Deployment")).toHaveAttribute("aria-disabled", "true");
});

test("a manifest written in the terminal solves Working With YAML and unlocks Deployments", async () => {
  await lesson("Working With YAML").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Working With YAML");
  await expect(page.locator('[data-testid="exercise-panel"]')).toContainText("apiVersion");
  await page.getByRole("button", { name: "Start this exercise" }).click();
  await expect(environmentConfirm()).toHaveCount(0);
  await expect(checkButton()).toBeEnabled({ timeout: 180_000 });

  await runInTerminal("clear; cat > notes.yaml <<'EOF'");
  for (const line of [
    "apiVersion: v1",
    "kind: Pod",
    "metadata:",
    "  name: notes",
    "  namespace: fl-k8s-0012",
    "  labels: { app: notes, tier: frontend }",
    "spec:",
    "  containers:",
    "    - { name: web, image: nginx:1.27 }",
    "EOF",
  ])
    await runInTerminal(line);
  await runInTerminal(
    'kubectl apply -f notes.yaml && kubectl wait --for=condition=Ready pod/notes -n fl-k8s-0012 --timeout=240s && echo "applied-$((50+5))"',
  );
  await expect(terminalText()).toContainText("applied-55", { timeout: 260_000 });
  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toHaveText("✓ Passed");
  await expect(lesson("Run a Deployment")).not.toHaveAttribute("aria-disabled", "true");
});

test("a dropped terminal can be reconnected", async () => {
  await runInTerminal("exit");
  await expect(page.getByText(/Terminal disconnected/)).toBeVisible();
  await page.getByRole("button", { name: "Reconnect" }).click();
  await expect(terminalConnected()).toBeVisible({ timeout: 30_000 });
  await runInTerminal("echo reconnected-$((5+5))");
  await expect(terminalText()).toContainText("reconnected-10");
  // A fresh shell: the variable from the first session is gone.
  await runInTerminal('echo "[$FL_MARK]"');
  await expect(terminalText()).toContainText("[]");
  // The new shell starts at the panel's real size, not a default.
  await expectPtyMatchesGrid();
});

test("API failures are shown as readable errors and the page stays usable", async () => {
  // 1. Network-level failure.
  await page.route("**/api/exercises/*/check", (route) => route.abort());
  await checkButton().click();
  await expect(page.locator('[data-testid="error-message"]')).toContainText(
    "Could not reach the featherlab server",
  );
  await page.unroute("**/api/exercises/*/check");
  await expect(checkButton()).toBeEnabled();

  // 2. A real backend failure: the workstation is unreachable.
  const workstation = assertTestWorkstation(process.env.FEATHERLAB_E2E_WORKSTATION);
  execFileSync("docker", ["pause", workstation]);
  try {
    await checkButton().click();
    // An unreachable cluster is "could not grade", never a misleading wrong answer.
    await expect(page.locator('[data-testid="check-results"] h3')).toHaveText(
      "Could not finish grading",
    );
    await expect(page.locator('[data-testid="check-results"]')).toContainText(
      "practice workstation is not reachable",
    );
    await expect(checkButton()).toBeEnabled();
  } finally {
    execFileSync("docker", ["unpause", workstation]);
  }

  // 3. Recovery without reloading the page.
  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toHaveText("✓ Passed");
  await expect(page.locator('[data-testid="error-message"]')).toHaveCount(0);
});
