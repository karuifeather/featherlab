// Shared API/WebSocket stubs so UI specs and screenshot scripts can drive the real
// frontend without a backend or kind cluster. Exercise shapes mirror the server's
// presenter whitelist (see src/application/presenters.mjs).

export const exercises = [
  {
    id: "k8s-0001",
    type: "task",
    title: "Your first Pod",
    summary: "Create a single nginx Pod and get it running.",
    track: "kubernetes",
    level: 0,
    difficulty: "beginner",
    estimatedMinutes: 5,
    tags: ["pods", "kubectl"],
    prerequisites: [],
  },
  {
    id: "k8s-0002",
    type: "task",
    title: "Run a Deployment",
    summary: "Create a Deployment named api in the staging namespace.",
    track: "kubernetes",
    level: 0,
    difficulty: "intermediate",
    estimatedMinutes: 10,
    tags: ["deployments"],
    prerequisites: [],
  },
  {
    id: "k8s-0101",
    type: "task",
    title: "Expose a Service",
    summary: "Expose a Deployment with a Service.",
    track: "kubernetes",
    level: 1,
    difficulty: "advanced",
    estimatedMinutes: 15,
    tags: ["services"],
    prerequisites: [],
  },
];

// Long, multi-line fenced block: used to prove code is never clipped by layout.
const longCode = [
  "```",
  "# inspect everything the grader will look at",
  "kubectl get pod web -n default -o wide",
  "kubectl get pod web -n default -o jsonpath='{.spec.containers[0].image}'",
  "kubectl describe pod web -n default | sed -n '1,40p'",
  "kubectl wait --for=condition=Ready pod/web -n default --timeout=120s",
  "```",
].join("\n");

export const detail = {
  ...exercises[0],
  description:
    "Use the terminal to create a Pod in the `default` namespace.\n\nThere is no single required command. featherlab grades the resulting Kubernetes resources, not the keystrokes you used. Some commands you may find handy while exploring:\n\n" +
    longCode +
    "\n\nWhen the Pod is `Running` and `Ready`, run the checks.",
  requirements: [
    "Pod name: `web`",
    "Namespace: `default`",
    "Container image: `nginx:1.27`",
    "The Pod must be `Running` and `Ready`.",
  ],
  hintCount: 2,
};

export const hints = [
  "Try `kubectl run --help` to see how to create a single Pod from an image.",
  "`kubectl run NAME --image=IMAGE` creates a Pod. Watch it with `kubectl get pod`.",
];

export const partial = {
  result: {
    exerciseId: "k8s-0001",
    outcome: "graded",
    success: false,
    score: { percent: 50 },
    counts: { passed: 2, total: 4 },
    checks: [
      {
        id: "exists",
        label: "Pod web exists in default namespace",
        status: "passed",
        passed: true,
        weight: 1,
        feedback: "Passed.",
      },
      {
        id: "image",
        label: "Container uses nginx:1.27",
        status: "passed",
        passed: true,
        weight: 1,
        feedback: "Passed.",
      },
      {
        id: "running",
        label: "Pod is Running",
        status: "failed",
        passed: false,
        weight: 1,
        feedback: "Pod phase is Pending — the container has not started yet.",
      },
      {
        id: "ready",
        label: "Pod Ready condition is True",
        status: "failed",
        passed: false,
        weight: 1,
        feedback: "The Pod is not Ready: 0/1 containers ready.",
      },
    ],
  },
};

export const passed = {
  result: {
    exerciseId: "k8s-0001",
    outcome: "graded",
    success: true,
    score: { percent: 100 },
    counts: { passed: 4, total: 4 },
    checks: partial.result.checks.map((c) => ({
      ...c,
      status: "passed",
      passed: true,
      feedback: "Passed.",
    })),
  },
};

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

export async function stubApi(page, { connected = true, checkSequence = [partial, passed] } = {}) {
  await page.routeWebSocket("**/ws/terminal", (ws) => {
    if (!connected) {
      setTimeout(() => ws.close(), 150);
      return;
    }
    ws.onMessage(() => {});
    setTimeout(() => {
      ws.send("Welcome to the FeatherLab practice workstation (isolated kind cluster)\r\n");
      ws.send("learner@workstation:~$ kubectl get pods\r\n");
      ws.send("NAME   READY   STATUS    RESTARTS   AGE\r\n");
      ws.send("web    1/1     Running   0          12s\r\n");
      ws.send("learner@workstation:~$ ");
    }, 100);
  });
  let n = 0;
  await page.route(/\/api\/exercises(\?.*)?$/, (r) => json(r, { exercises }));
  await page.route(/\/api\/exercises\/[^/?]+(\?.*)?$/, (r) => json(r, { exercise: detail }));
  await page.route("**/api/exercises/*/check", (r) =>
    json(r, checkSequence[Math.min(n++, checkSequence.length - 1)]),
  );
  await page.route("**/api/exercises/*/activate", (r) => json(r, {}));
  await page.route("**/api/exercises/*/reset", (r) => json(r, {}));
  await page.route(/\/api\/exercises\/[^/]+\/hints\/\d+/, (r) => {
    const i = Number(new URL(r.request().url()).pathname.split("/").pop());
    return json(r, { hint: { exerciseId: "k8s-0001", index: i, total: 2, text: hints[i - 1] } });
  });
}

// Force xterm's DOM renderer so terminal text lands in the DOM (readable by locators and
// not dependent on a GPU/WebGL context inside headless browsers).
export async function forceDomTerminal(page) {
  await page.addInitScript(() => {
    const g = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, ...r) {
      return t === "webgl2" || t === "webgl" ? null : g.call(this, t, ...r);
    };
  });
}

export async function enterWorkspace(page, base) {
  await page.goto(base);
  await page.getByRole("button", { name: /Kubernetes/ }).click();
  await page.getByRole("heading", { level: 1, name: "Your first Pod" }).waitFor();
}
