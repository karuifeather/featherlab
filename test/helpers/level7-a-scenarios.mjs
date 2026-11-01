/**
 * Level 7 Circuit A scenarios: NetworkPolicy fundamentals (k8s-0151–0155).
 *
 * Each scenario acts the way a learner would: plain kubectl in the workstation,
 * against a freshly prepared exercise.
 *
 *   solve(k)    - the reference solution; the exercise must then pass all checks
 *   variants    - plausible mistakes; each must fail exactly the listed check ids
 *   initial     - objects setup must have created (verified before baseline check)
 *
 * NetworkPolicy enforcement is asynchronous: kindnet programs iptables rules after a
 * policy is applied. solve() polls until the expected traffic state is observed before
 * returning, to avoid flaky grading. The pattern matches level7-b-scenarios.mjs.
 */

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Poll until curl from a curlimages/curl Pod exits non-zero (traffic is blocked). */
async function waitForBlock(k, { pod, ns, url }) {
  await k.until(`${pod}→${url} blocked`, () => {
    try {
      k.run("exec", pod, "-n", ns, "--", "curl", "-s", "-o", "/dev/null", "--max-time", "8", url);
      return false; // curl succeeded — not blocked yet
    } catch {
      return true; // curl failed — blocked
    }
  });
}

/** Poll until wget from a busybox Pod exits non-zero (traffic is blocked). */
async function waitForBlockBusybox(k, { pod, ns, url }) {
  await k.until(`${pod}→${url} blocked`, () => {
    try {
      k.run("exec", pod, "-n", ns, "--", "wget", "-qO-", "-T", "8", url);
      return false; // wget succeeded — not blocked yet
    } catch {
      return true; // wget failed — blocked
    }
  });
}

/** Poll until wget from a busybox Pod returns a non-empty response (traffic is allowed). */
async function waitForAllow(k, { pod, ns, url }) {
  await k.until(`${pod}→${url} allowed`, () => {
    try {
      const out = k.run("exec", pod, "-n", ns, "--", "wget", "-qO-", "-T", "5", url);
      return out.length > 0;
    } catch {
      return false;
    }
  });
}

// ─── k8s-0151: Traffic Without NetworkPolicy ──────────────────────────────────

export const LEVEL7_A_SCENARIOS = {
  "k8s-0151": {
    initial: [
      ["pod", "api", "fl-k8s-0151"],
      ["service", "api", "fl-k8s-0151"],
    ],
    // Observation exercise — no policy to create. Wait for the Pods to be ready so
    // the http-probe check can pass. The baseline will fail while grader-client is
    // still Pending (image pull).
    async solve(k) {
      await k.ready("api", "fl-k8s-0151");
      await k.ready("grader-client", "fl-k8s-0151");
    },
    variants: [],
  },

  // ─── k8s-0152: Default-Deny Ingress ─────────────────────────────────────────

  "k8s-0152": {
    initial: [
      ["pod", "api", "fl-k8s-0152"],
      ["service", "api", "fl-k8s-0152"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0152");
      await k.ready("deny-client", "fl-k8s-0152");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: fl-k8s-0152
spec:
  podSelector: {}
  policyTypes:
  - Ingress
`);
      await waitForBlock(k, {
        pod: "deny-client",
        ns: "fl-k8s-0152",
        url: "http://api/",
      });
    },
    variants: [
      {
        // Learner adds an ingress rule that allows all Pods — not a deny policy at all.
        name: "has ingress rule allowing all Pods (not a deny)",
        async run(k) {
          await k.ready("api", "fl-k8s-0152");
          await k.ready("deny-client", "fl-k8s-0152");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: fl-k8s-0152
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector: {}
`);
        },
        failing: ["netpol-spec", "traffic-blocked"],
      },
    ],
  },

  // ─── k8s-0153: Allow Traffic from a Specific Pod ─────────────────────────────

  "k8s-0153": {
    initial: [
      ["pod", "api", "fl-k8s-0153"],
      ["service", "api", "fl-k8s-0153"],
      ["networkpolicy", "default-deny", "fl-k8s-0153"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0153");
      await k.ready("grader-client", "fl-k8s-0153");
      await k.ready("deny-client", "fl-k8s-0153");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend
  namespace: fl-k8s-0153
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          role: frontend
`);
      await waitForAllow(k, {
        pod: "grader-client",
        ns: "fl-k8s-0153",
        url: "http://api/",
      });
    },
    variants: [
      {
        // Learner uses a non-existent label value in the from selector.
        // grader-client has role=frontend, not role=backend, so grader-client
        // remains blocked — http-probe fails. deny-client is already blocked by
        // default-deny. netpol-spec passes (hasIngressRules: true is satisfied).
        name: "from selector uses wrong role value (backend instead of frontend)",
        async run(k) {
          await k.ready("api", "fl-k8s-0153");
          await k.ready("grader-client", "fl-k8s-0153");
          await k.ready("deny-client", "fl-k8s-0153");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend
  namespace: fl-k8s-0153
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          role: backend
`);
        },
        failing: ["http-probe"],
      },
    ],
  },

  // ─── k8s-0154: Allow Traffic on a Specific Port ──────────────────────────────

  "k8s-0154": {
    initial: [
      ["pod", "api", "fl-k8s-0154"],
      ["service", "api", "fl-k8s-0154"],
      ["networkpolicy", "default-deny", "fl-k8s-0154"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0154");
      await k.ready("grader-client", "fl-k8s-0154");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-port-80
  namespace: fl-k8s-0154
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Ingress
  ingress:
  - ports:
    - protocol: TCP
      port: 80
`);
      await waitForAllow(k, {
        pod: "grader-client",
        ns: "fl-k8s-0154",
        url: "http://api/",
      });
    },
    variants: [
      {
        // Learner specifies the wrong port (8080 instead of 80) in the allow rule.
        name: "allow rule targets wrong port (8080 instead of 80)",
        async run(k) {
          await k.ready("api", "fl-k8s-0154");
          await k.ready("grader-client", "fl-k8s-0154");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-port-80
  namespace: fl-k8s-0154
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Ingress
  ingress:
  - ports:
    - protocol: TCP
      port: 8080
`);
        },
        failing: ["http-probe"],
      },
    ],
  },

  // ─── k8s-0155: NetworkPolicy Union ───────────────────────────────────────────

  "k8s-0155": {
    initial: [
      ["pod", "api", "fl-k8s-0155"],
      ["service", "api", "fl-k8s-0155"],
      ["networkpolicy", "deny-all", "fl-k8s-0155"],
      ["networkpolicy", "allow-grader-a", "fl-k8s-0155"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0155");
      await k.ready("grader-client", "fl-k8s-0155");
      await k.ready("grader-client-b", "fl-k8s-0155");
      await k.ready("deny-client", "fl-k8s-0155");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-grader-b
  namespace: fl-k8s-0155
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: grader-client-b
`);
      await waitForAllow(k, {
        pod: "grader-client-b",
        ns: "fl-k8s-0155",
        url: "http://api/",
      });
    },
    variants: [
      {
        // Learner deletes allow-grader-a and creates only allow-grader-b.
        // grader-client loses access; http-probe-a fails.
        name: "deletes allow-grader-a instead of adding allow-grader-b alongside it",
        async run(k) {
          await k.ready("api", "fl-k8s-0155");
          await k.ready("grader-client", "fl-k8s-0155");
          await k.ready("grader-client-b", "fl-k8s-0155");
          await k.ready("deny-client", "fl-k8s-0155");
          k.run(
            "delete",
            "networkpolicy",
            "allow-grader-a",
            "-n",
            "fl-k8s-0155",
            "--ignore-not-found",
          );
          // Wait for kindnet to enforce the deletion before applying the new policy.
          await waitForBlockBusybox(k, {
            pod: "grader-client",
            ns: "fl-k8s-0155",
            url: "http://api/",
          });
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-grader-b
  namespace: fl-k8s-0155
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: grader-client-b
`);
          await waitForAllow(k, {
            pod: "grader-client-b",
            ns: "fl-k8s-0155",
            url: "http://api/",
          });
        },
        failing: ["http-probe-a"],
      },
    ],
  },
};
