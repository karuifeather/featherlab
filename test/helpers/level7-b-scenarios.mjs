/**
 * Level 7 Circuit B scenarios: Egress & DNS NetworkPolicy (k8s-0156–0160).
 *
 * Each scenario acts the way a learner would: plain kubectl in the workstation,
 * against a freshly prepared exercise.
 *
 *   solve(k)    - the reference solution; the exercise must then pass all checks
 *   variants    - plausible mistakes; each must fail exactly the listed check ids
 *   initial     - objects setup must have created (verified before baseline check)
 *
 * Egress enforcement is via kindnet (default kind CNI, v1.4.0+). After applying a
 * NetworkPolicy, kindnet takes ~5s to converge iptables rules. solve() polls until
 * the expected traffic state is observed before returning, to avoid flaky grading.
 *
 * DNS egress note: kube-dns IP (10.96.0.10) is the standard kind cluster value.
 * Reference solutions for exercises that add DNS allow rules query it at runtime
 * rather than hardcoding, per the README in src/tracks/kubernetes/networkpolicy/.
 */

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Poll until curl from a Pod exits non-zero (traffic is blocked). */
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

/** Poll until wget from a Pod returns a non-empty response (traffic is allowed). */
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

// ─── k8s-0156: Default-Deny Egress ───────────────────────────────────────────

export const LEVEL7_B_SCENARIOS = {
  "k8s-0156": {
    initial: [
      ["pod", "api", "fl-k8s-0156"],
      ["pod", "deny-client", "fl-k8s-0156"],
      ["pod", "grader-client", "fl-k8s-0156"],
    ],
    async solve(k) {
      await k.ready("deny-client", "fl-k8s-0156");
      await k.ready("api", "fl-k8s-0156");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-egress-client
  namespace: fl-k8s-0156
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
`);
      await waitForBlock(k, {
        pod: "deny-client",
        ns: "fl-k8s-0156",
        url: "http://api.fl-k8s-0156/",
      });
    },
    variants: [
      {
        // egress: [{}] means "allow all egress" — the deny disappears even though
        // policyTypes: [Egress] is present.  Both spec (hasEgressRules must be false)
        // and blocked (traffic flows freely) should fail.
        name: "egress allow-all rule (egress: [{}]) instead of deny-all",
        async run(k) {
          await k.ready("deny-client", "fl-k8s-0156");
          await k.ready("api", "fl-k8s-0156");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-egress-client
  namespace: fl-k8s-0156
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - {}
`);
          // Wait for the allow-all to take effect so the grader sees stable traffic.
          await k.until("deny-client reaches api (allow-all variant)", () => {
            try {
              k.run(
                "exec",
                "deny-client",
                "-n",
                "fl-k8s-0156",
                "--",
                "curl",
                "-s",
                "-o",
                "/dev/null",
                "--max-time",
                "5",
                "http://api.fl-k8s-0156/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        failing: ["spec", "blocked"],
      },
      {
        // Wrong podSelector: selects api, not deny-client — deny-client keeps full egress.
        name: "podSelector targets app=api instead of app=deny-client",
        async run(k) {
          await k.ready("deny-client", "fl-k8s-0156");
          await k.ready("api", "fl-k8s-0156");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-egress-client
  namespace: fl-k8s-0156
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Egress
`);
          // Confirm traffic from deny-client is still allowed (wrong selector, not blocked).
          await k.until("deny-client reaches api (wrong-selector variant)", () => {
            try {
              k.run(
                "exec",
                "deny-client",
                "-n",
                "fl-k8s-0156",
                "--",
                "curl",
                "-s",
                "-o",
                "/dev/null",
                "--max-time",
                "5",
                "http://api.fl-k8s-0156/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        failing: ["spec", "blocked"],
      },
    ],
  },

  // ─── k8s-0157: Allow DNS Egress ─────────────────────────────────────────────

  "k8s-0157": {
    initial: [
      ["pod", "api", "fl-k8s-0157"],
      ["pod", "deny-client", "fl-k8s-0157"],
      ["networkpolicy", "deny-egress-client", "fl-k8s-0157"],
    ],
    async solve(k) {
      await k.ready("deny-client", "fl-k8s-0157");
      await k.ready("api", "fl-k8s-0157");
      // Discover kube-dns IP at runtime (should be 10.96.0.10 in kind)
      const dnsIP = k
        .run("get", "svc", "kube-dns", "-n", "kube-system", "-o", "jsonpath={.spec.clusterIP}")
        .trim();
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: fl-k8s-0157
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - ipBlock:
            cidr: ${dnsIP}/32
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
`);
      // After allow-dns, curl exits 28 (TCP timeout) rather than 6 (DNS fail).
      // traffic-blocked accepts both exit codes, so no extra wait is needed here.
    },
    variants: [
      {
        // egress: [{}] means "allow all egress" — the TCP block disappears
        name: "allow-all egress (egress: [{}]) instead of DNS only",
        async run(k) {
          await k.ready("deny-client", "fl-k8s-0157");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: fl-k8s-0157
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - {}
`);
          // Wait for allow-all to take effect (curl will succeed)
          await k.until("deny-client reaches api (over-allowed)", () => {
            try {
              k.run(
                "exec",
                "deny-client",
                "-n",
                "fl-k8s-0157",
                "--",
                "curl",
                "-s",
                "-o",
                "/dev/null",
                "--max-time",
                "8",
                "http://api.fl-k8s-0157/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        // blocked fails because deny-client can now reach api (curl exits 0)
        failing: ["blocked"],
      },
      {
        // Wrong podSelector: selects api instead of deny-client
        name: "podSelector targets app=api instead of app=deny-client",
        async run(k) {
          await k.ready("deny-client", "fl-k8s-0157");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: fl-k8s-0157
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Egress
  egress:
    - to:
        - ipBlock:
            cidr: 10.96.0.10/32
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
`);
        },
        // spec fails (wrong podSelector); blocked still passes (deny-client exits 6)
        failing: ["spec"],
      },
    ],
  },

  // ─── k8s-0158: Allow Egress to a Specific Service ───────────────────────────

  "k8s-0158": {
    initial: [
      ["pod", "api", "fl-k8s-0158"],
      ["pod", "deny-client", "fl-k8s-0158"],
      ["pod", "grader-client", "fl-k8s-0158"],
      ["networkpolicy", "deny-egress-client", "fl-k8s-0158"],
      ["networkpolicy", "allow-dns", "fl-k8s-0158"],
    ],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0158");
      await k.ready("api", "fl-k8s-0158");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-egress
  namespace: fl-k8s-0158
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: api
      ports:
        - protocol: TCP
          port: 80
`);
      await waitForAllow(k, {
        pod: "grader-client",
        ns: "fl-k8s-0158",
        url: "http://api.fl-k8s-0158:80/",
      });
    },
    variants: [
      {
        // Wrong top-level podSelector: the spec check reads spec.podSelector;
        // a wrong-to-selector can't be detected with networkpolicy-spec.
        name: "podSelector targets app=api instead of app=deny-client",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0158");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-egress
  namespace: fl-k8s-0158
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: api
      ports:
        - protocol: TCP
          port: 80
`);
        },
        // spec fails (podSelector must be app=deny-client);
        // api-probe still passes because grader-client is unrestricted
        failing: ["spec"],
      },
    ],
  },

  // ─── k8s-0159: Fix Isolation by Correcting a Label ──────────────────────────

  "k8s-0159": {
    initial: [
      ["pod", "api", "fl-k8s-0159"],
      ["pod", "isolated-client", "fl-k8s-0159"],
      ["pod", "deny-client", "fl-k8s-0159"],
      ["networkpolicy", "deny-all", "fl-k8s-0159"],
      ["networkpolicy", "allow-frontend", "fl-k8s-0159"],
    ],
    async solve(k) {
      await k.ready("isolated-client", "fl-k8s-0159");
      await k.ready("api", "fl-k8s-0159");
      k.run("label", "pod", "isolated-client", "role=frontend", "-n", "fl-k8s-0159");
      await waitForAllow(k, {
        pod: "isolated-client",
        ns: "fl-k8s-0159",
        url: "http://api.fl-k8s-0159:80/",
      });
    },
    variants: [
      {
        // Label deny-client instead of isolated-client — isolated-client still blocked
        name: "label deny-client instead of isolated-client",
        async run(k) {
          await k.ready("deny-client", "fl-k8s-0159");
          await k.ready("api", "fl-k8s-0159");
          k.run("label", "pod", "deny-client", "role=frontend", "-n", "fl-k8s-0159");
          // Wait until kindnet has reprogrammed and deny-client can actually reach api.
          // deny-client is the curl image; use curl (not wget) to poll.
          await k.until("deny-client reaches api (over-allowed)", () => {
            try {
              k.run(
                "exec",
                "deny-client",
                "-n",
                "fl-k8s-0159",
                "--",
                "curl",
                "-s",
                "-o",
                "/dev/null",
                "-w",
                "%{http_code}",
                "--max-time",
                "8",
                "http://api.fl-k8s-0159/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        // isolated-client still lacks the label (label fails);
        // probe fails (isolated-client still blocked);
        // blocked now fails too (deny-client has role=frontend, reaches api)
        failing: ["label", "probe", "blocked"],
      },
    ],
  },

  // ─── k8s-0160: Egress Policy Union ─────────────────────────────────────────

  "k8s-0160": {
    initial: [
      ["pod", "api", "fl-k8s-0160"],
      ["pod", "secondary", "fl-k8s-0160"],
      ["pod", "deny-client", "fl-k8s-0160"],
      ["pod", "grader-client", "fl-k8s-0160"],
      ["networkpolicy", "deny-all-egress-client", "fl-k8s-0160"],
      ["networkpolicy", "allow-dns", "fl-k8s-0160"],
      ["networkpolicy", "allow-api-egress", "fl-k8s-0160"],
    ],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0160");
      await k.ready("secondary", "fl-k8s-0160");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-secondary-egress
  namespace: fl-k8s-0160
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: secondary
      ports:
        - protocol: TCP
          port: 80
`);
      await waitForAllow(k, {
        pod: "grader-client",
        ns: "fl-k8s-0160",
        url: "http://secondary.fl-k8s-0160:80/",
      });
    },
    variants: [
      {
        // Wrong podSelector in the new policy: targets app=api instead of deny-client
        name: "podSelector targets app=api (wrong — should be app=deny-client)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0160");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-secondary-egress
  namespace: fl-k8s-0160
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: secondary
      ports:
        - protocol: TCP
          port: 80
`);
        },
        // spec fails (wrong podSelector); api-probe and secondary-probe pass
        // because grader-client is unrestricted and both servers are up
        failing: ["spec"],
      },
    ],
  },
};
