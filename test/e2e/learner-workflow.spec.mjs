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

test("launcher offers the Kubernetes track, which lists both exercises", async () => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Build the skills/ })).toBeVisible();
  await page.getByRole("button", { name: /Kubernetes/ }).click();
  await expect(lessons()).toHaveCount(2);
  await expect(lessons().nth(0)).toContainText("Your first Pod");
  await expect(lessons().nth(1)).toContainText("Run a Deployment");
});

test("the first exercise is loaded dynamically from the API", async () => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your first Pod");
  await expect(page.locator('[data-testid="exercise-panel"]')).toContainText(
    "Use the terminal to create a Pod in the default namespace",
  );
  const requirements = page.locator('[data-testid="requirements"] li');
  await expect(requirements).toHaveCount(4);
  await expect(requirements.first()).toContainText("web");
  await expect(requirements.nth(2)).toContainText("nginx:1.27");

  await page.getByRole("button", { name: "Need a hint?" }).click();
  await expect(page.locator('[data-testid="hint"]')).toContainText("kubectl run --help");
  await page.getByRole("button", { name: /Next hint/ }).click();
  await expect(page.locator('[data-testid="hint"]')).toHaveCount(2);
});

test("a real terminal connects and runs kubectl against the test cluster", async () => {
  await expect(terminalConnected()).toBeVisible({ timeout: 30_000 });
  await runInTerminal("export FL_MARK=session-one");
  await runInTerminal("kubectl get nodes");
  await expect(terminalText()).toContainText("control-plane", { timeout: 60_000 });
  await expect(terminalText()).toContainText("Ready");
});

test("checking before solving shows failing checks", async () => {
  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toContainText("0/4 checks passed");
  await expect(page.locator('[data-testid="check-results"]')).toContainText("was not found");
});

test("solving the exercise in the browser terminal passes grading", async () => {
  await runInTerminal("kubectl run web --image=nginx:1.27");
  await runInTerminal("kubectl wait --for=condition=Ready pod/web --timeout=240s");
  await expect(terminalText()).toContainText("condition met", { timeout: 260_000 });

  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toHaveText("✓ Passed");
});

test("switching exercises keeps the same terminal session", async () => {
  await lessons().nth(1).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Run a Deployment");
  await expect(page.locator('[data-testid="requirements"] li').first()).toContainText("staging");

  await expect(terminalConnected()).toBeVisible();
  await runInTerminal('echo "$FL_MARK-survived"');
  await expect(terminalText()).toContainText("session-one-survived");

  // Exercise 2 starts failing, while exercise 1's pod is untouched.
  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).not.toHaveText("✓ Passed");
  await expect(page.locator('[data-testid="check-results"]')).toContainText("Deployment");
  await runInTerminal("kubectl get pod web -o name");
  await expect(terminalText()).toContainText("pod/web");
});

test("resetting an exercise removes the learner's work", async () => {
  await lessons().nth(0).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your first Pod");
  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toHaveText("✓ Passed");

  await resetButton().click();
  await expect(page.locator('[data-testid="check-results"]')).toHaveCount(0);
  await runInTerminal("kubectl get pod web");
  await expect(terminalText()).toContainText('pods "web" not found');

  await checkButton().click();
  await expect(page.locator('[data-testid="check-results"] h3')).toContainText("0/4 checks passed");
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
  await expect(page.locator('[data-testid="check-results"] h3')).toContainText("checks passed");
  await expect(page.locator('[data-testid="error-message"]')).toHaveCount(0);
});
