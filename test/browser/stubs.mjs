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
    prerequisites: ["k8s-0001"],
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

// Track progress stub: all exercises available, none completed.
export const noProgress = {
  exercises: exercises.map((e) => ({
    exerciseId: e.id,
    title: e.title,
    level: e.level,
    prerequisites: e.prerequisites,
    state: "available",
    unmetPrerequisites: [],
    completed: false,
    attemptCount: 0,
    bestScoreEarned: null,
    bestScorePossible: null,
    firstCompletedAt: null,
    lastAttemptedAt: null,
  })),
  summary: { total: 3, completed: 0, available: 3, locked: 0 },
};

// Track progress stub: first exercise completed, second still locked.
export const withProgress = {
  exercises: [
    {
      exerciseId: "k8s-0001",
      title: "Your first Pod",
      level: 0,
      prerequisites: [],
      state: "completed",
      unmetPrerequisites: [],
      completed: true,
      attemptCount: 1,
      bestScoreEarned: 4,
      bestScorePossible: 4,
      firstCompletedAt: "2024-01-01T00:00:00.000Z",
      lastAttemptedAt: "2024-01-01T00:00:00.000Z",
    },
    {
      exerciseId: "k8s-0002",
      title: "Run a Deployment",
      level: 0,
      prerequisites: ["k8s-0001"],
      state: "available",
      unmetPrerequisites: [],
      completed: false,
      attemptCount: 0,
      bestScoreEarned: null,
      bestScorePossible: null,
      firstCompletedAt: null,
      lastAttemptedAt: null,
    },
    {
      exerciseId: "k8s-0101",
      title: "Expose a Service",
      level: 1,
      prerequisites: [],
      state: "available",
      unmetPrerequisites: [],
      completed: false,
      attemptCount: 0,
      bestScoreEarned: null,
      bestScorePossible: null,
      firstCompletedAt: null,
      lastAttemptedAt: null,
    },
  ],
  summary: { total: 3, completed: 1, available: 2, locked: 0 },
};

// Track progress: k8s-0001 complete, k8s-0002 locked (prereq k8s-0001, but using a different stub).
export const withLockedExercise = {
  exercises: [
    {
      exerciseId: "k8s-0001",
      title: "Your first Pod",
      level: 0,
      prerequisites: [],
      state: "available",
      unmetPrerequisites: [],
      completed: false,
      attemptCount: 0,
      bestScoreEarned: null,
      bestScorePossible: null,
      firstCompletedAt: null,
      lastAttemptedAt: null,
    },
    {
      exerciseId: "k8s-0002",
      title: "Run a Deployment",
      level: 0,
      prerequisites: ["k8s-0001"],
      state: "locked",
      unmetPrerequisites: ["k8s-0001"],
      completed: false,
      attemptCount: 0,
      bestScoreEarned: null,
      bestScorePossible: null,
      firstCompletedAt: null,
      lastAttemptedAt: null,
    },
    {
      exerciseId: "k8s-0101",
      title: "Expose a Service",
      level: 1,
      prerequisites: [],
      state: "available",
      unmetPrerequisites: [],
      completed: false,
      attemptCount: 0,
      bestScoreEarned: null,
      bestScorePossible: null,
      firstCompletedAt: null,
      lastAttemptedAt: null,
    },
  ],
  summary: { total: 3, completed: 0, available: 2, locked: 1 },
};

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
    outcome: "failed",
    success: false,
    score: { earned: 2, possible: 4, percent: 50 },
    counts: { total: 4, passed: 2, failed: 2, errored: 0 },
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
    outcome: "passed",
    success: true,
    score: { percent: 100 },
    counts: { passed: 4, total: 4 },
    checks: partial.result.checks.map((c) => ({
      ...c,
      status: "passed",
      passed: true,
      feedback: "Passed.",
    })),
    progress: {
      completed: true,
      attemptCount: 1,
      bestScoreEarned: 4,
      bestScorePossible: 4,
      firstCompletedAt: "2024-01-01T00:00:00.000Z",
      lastAttemptedAt: "2024-01-01T00:00:00.000Z",
    },
  },
};

const json = (route, body) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

// Real-backend default: when persistence is configured, /api/resume always returns a resume
// object (fallback: true means no explicit selection yet, i.e. a first-time learner).
export const noResume = {
  trackId: "kubernetes",
  exerciseId: "k8s-0001",
  updatedAt: null,
  fallback: true,
};

export async function stubApi(
  page,
  {
    connected = true,
    checkSequence = [partial, passed],
    progressData = noProgress,
    resume = noResume,
    // When set, the first terminal session ends with this close code (e.g. 1000 = the shell
    // exited) shortly after connecting; later sessions stay open. Used for reconnect tests.
    firstSessionCloseCode = null,
  } = {},
) {
  let sessions = 0;
  // Every JSON message the browser sends on the terminal socket, tagged with its session.
  const terminalMessages = [];
  await page.routeWebSocket("**/ws/terminal", (ws) => {
    const session = ++sessions;
    if (!connected) {
      setTimeout(() => ws.close(), 150);
      return;
    }
    ws.onMessage((message) => {
      try {
        terminalMessages.push({ session, ...JSON.parse(String(message)) });
      } catch {
        /* not JSON — ignore */
      }
    });
    setTimeout(() => {
      ws.send("Welcome to the FeatherLab practice workstation (isolated kind cluster)\r\n");
      ws.send(`session-${session}\r\n`);
      ws.send("learner@workstation:~$ kubectl get pods\r\n");
      ws.send("NAME   READY   STATUS    RESTARTS   AGE\r\n");
      ws.send("web    1/1     Running   0          12s\r\n");
      ws.send("learner@workstation:~$ ls /\r\n");
      ws.send("bin   dev  home  lib64  mnt  proc  run   srv  tmp  var\r\n");
      ws.send("learner@workstation:~$ ");
      if (session === 1 && firstSessionCloseCode)
        setTimeout(() => ws.close({ code: firstSessionCloseCode, reason: "stub" }), 200);
    }, 100);
  });
  let n = 0;
  await page.route(/\/api\/exercises(\?.*)?$/, (r) => json(r, { exercises }));
  // Progress and resume routes must be matched before the generic exercise route.
  await page.route(/\/api\/progress\/track\/[^/]+/, (r) => json(r, progressData));
  await page.route("**/api/resume", (r) => json(r, { resume }));
  await page.route("**/api/exercises/*/select", (r) =>
    json(r, { trackId: "kubernetes", exerciseId: "k8s-0001" }),
  );
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
  return { terminalMessages };
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
  await page.getByRole("button", { name: /^(Start|Continue) Learning$/ }).click();
  await page.getByRole("heading", { level: 1, name: "Your first Pod" }).waitFor();
}
