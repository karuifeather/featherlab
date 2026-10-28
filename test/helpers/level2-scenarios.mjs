/**
 * Executable learner behaviour for every Level 2 exercise added in M5.4, shared by the
 * real-kind circuit test.  Pattern mirrors level0-scenarios.mjs.
 *
 *   solve(k)   the reference solution; all checks must then pass
 *   variants   plausible mistakes; each starts from a fresh baseline and must leave
 *              exactly the listed checks failing (and the rest passing)
 *   initial    objects setup must have created (verified before the baseline check)
 *
 * All Deployment mutations use `kubectl patch --type=strategic` (not `kubectl apply`)
 * to avoid the three-way merge stripping fields that are absent from a partial manifest.
 * ConfigMap and Secret creates/updates use `k.run("create", ...)` or `k.apply(yaml)`.
 */

/** Strategic-merge-patch a Deployment; absent scalars are preserved from the live object. */
const smPatch = (k, name, ns, spec) =>
  k.run("patch", "deployment", name, "-n", ns, "--type=strategic", "-p", JSON.stringify({ spec }));

/** JSON-patch a Deployment; used when a whole sub-object must be replaced (e.g. a probe). */
const jsonPatch = (k, name, ns, ops) =>
  k.run("patch", "deployment", name, "-n", ns, "--type=json", "-p", JSON.stringify(ops));

// ── Circuit A: ConfigMaps ──────────────────────────────────────────────────────────────────

export const LEVEL2_SCENARIOS = {
  // 035 — Inject a Setting With env.value
  "k8s-0035": {
    initial: [["deployment", "app", "fl-k8s-0035"]],
    async solve(k) {
      k.run("set", "env", "deployment/app", "APP_ENV=production", "-n", "fl-k8s-0035");
      await k.rollout("app", "fl-k8s-0035");
    },
    variants: [
      {
        name: "wrong value (staging instead of production)",
        async run(k) {
          k.run("set", "env", "deployment/app", "APP_ENV=staging", "-n", "fl-k8s-0035");
          await k.rollout("app", "fl-k8s-0035");
        },
        failing: ["env-value"],
      },
      {
        name: "wrong variable name",
        async run(k) {
          k.run("set", "env", "deployment/app", "ENVIRONMENT=production", "-n", "fl-k8s-0035");
          await k.rollout("app", "fl-k8s-0035");
        },
        failing: ["env-value"],
      },
    ],
  },

  // 036 — Create and Read a ConfigMap
  "k8s-0036": {
    initial: [],
    async solve(k) {
      k.run(
        "create",
        "configmap",
        "app-config",
        "--from-literal=APP_ENV=production",
        "--from-literal=LOG_LEVEL=info",
        "-n",
        "fl-k8s-0036",
      );
    },
    variants: [
      {
        name: "wrong value for LOG_LEVEL (debug instead of info)",
        async run(k) {
          k.run(
            "create",
            "configmap",
            "app-config",
            "--from-literal=APP_ENV=production",
            "--from-literal=LOG_LEVEL=debug",
            "-n",
            "fl-k8s-0036",
          );
        },
        failing: ["data"],
      },
      {
        name: "only one key (missing LOG_LEVEL)",
        async run(k) {
          k.run(
            "create",
            "configmap",
            "app-config",
            "--from-literal=APP_ENV=production",
            "-n",
            "fl-k8s-0036",
          );
        },
        failing: ["data"],
      },
    ],
  },

  // 037 — Config as Environment Variables (configMapKeyRef)
  "k8s-0037": {
    initial: [
      ["deployment", "app", "fl-k8s-0037"],
      ["configmap", "app-config", "fl-k8s-0037"],
    ],
    async solve(k) {
      smPatch(k, "app", "fl-k8s-0037", {
        template: {
          spec: {
            containers: [
              {
                name: "app",
                env: [
                  {
                    name: "APP_ENV",
                    valueFrom: { configMapKeyRef: { name: "app-config", key: "APP_ENV" } },
                  },
                ],
              },
            ],
          },
        },
      });
      await k.rollout("app", "fl-k8s-0037");
    },
    variants: [
      {
        name: "literal value instead of configMapKeyRef",
        async run(k) {
          k.run("set", "env", "deployment/app", "APP_ENV=production", "-n", "fl-k8s-0037");
          await k.rollout("app", "fl-k8s-0037");
        },
        failing: ["env-ref"],
      },
      {
        name: "configMapKeyRef pointing to wrong key (LOG_LEVEL instead of APP_ENV)",
        async run(k) {
          smPatch(k, "app", "fl-k8s-0037", {
            template: {
              spec: {
                containers: [
                  {
                    name: "app",
                    env: [
                      {
                        name: "APP_ENV",
                        valueFrom: { configMapKeyRef: { name: "app-config", key: "LOG_LEVEL" } },
                      },
                    ],
                  },
                ],
              },
            },
          });
          await k.rollout("app", "fl-k8s-0037");
        },
        failing: ["env-ref"],
      },
    ],
  },

  // 038 — Load All Keys With envFrom
  "k8s-0038": {
    initial: [
      ["deployment", "app", "fl-k8s-0038"],
      ["configmap", "settings", "fl-k8s-0038"],
    ],
    async solve(k) {
      smPatch(k, "app", "fl-k8s-0038", {
        template: {
          spec: {
            containers: [{ name: "app", envFrom: [{ configMapRef: { name: "settings" } }] }],
          },
        },
      });
      await k.rollout("app", "fl-k8s-0038");
    },
    variants: [
      {
        name: "individual configMapKeyRef for each key instead of envFrom",
        async run(k) {
          smPatch(k, "app", "fl-k8s-0038", {
            template: {
              spec: {
                containers: [
                  {
                    name: "app",
                    env: [
                      {
                        name: "HOST",
                        valueFrom: { configMapKeyRef: { name: "settings", key: "HOST" } },
                      },
                      {
                        name: "PORT",
                        valueFrom: { configMapKeyRef: { name: "settings", key: "PORT" } },
                      },
                    ],
                  },
                ],
              },
            },
          });
          await k.rollout("app", "fl-k8s-0038");
        },
        failing: ["env-from"],
      },
    ],
  },

  // 039 — Mount a ConfigMap as a Volume
  "k8s-0039": {
    initial: [
      ["deployment", "app", "fl-k8s-0039"],
      ["configmap", "nginx-conf", "fl-k8s-0039"],
    ],
    async solve(k) {
      smPatch(k, "app", "fl-k8s-0039", {
        template: {
          spec: {
            volumes: [{ name: "conf-vol", configMap: { name: "nginx-conf" } }],
            containers: [
              { name: "app", volumeMounts: [{ name: "conf-vol", mountPath: "/etc/app-config" }] },
            ],
          },
        },
      });
      await k.rollout("app", "fl-k8s-0039");
    },
    variants: [
      {
        name: "volume declared but no volumeMount",
        async run(k) {
          smPatch(k, "app", "fl-k8s-0039", {
            template: {
              spec: { volumes: [{ name: "conf-vol", configMap: { name: "nginx-conf" } }] },
            },
          });
          await k.rollout("app", "fl-k8s-0039");
        },
        failing: ["mounted"],
      },
      {
        name: "emptyDir volume instead of ConfigMap volume (wrong volume type)",
        async run(k) {
          smPatch(k, "app", "fl-k8s-0039", {
            template: {
              spec: {
                volumes: [{ name: "conf-vol", emptyDir: {} }],
                containers: [
                  {
                    name: "app",
                    volumeMounts: [{ name: "conf-vol", mountPath: "/etc/app-config" }],
                  },
                ],
              },
            },
          });
          await k.rollout("app", "fl-k8s-0039");
        },
        failing: ["mounted"],
      },
    ],
  },

  // 040 — Update a Live ConfigMap
  "k8s-0040": {
    initial: [
      ["deployment", "app", "fl-k8s-0040"],
      ["configmap", "runtime-config", "fl-k8s-0040"],
    ],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: ConfigMap
metadata:
  name: runtime-config
  namespace: fl-k8s-0040
data:
  FEATURE_FLAG: "enabled"
`);
      k.run("rollout", "restart", "deployment/app", "-n", "fl-k8s-0040");
      await k.rollout("app", "fl-k8s-0040");
    },
    variants: [
      {
        name: "wrong value (true instead of enabled)",
        async run(k) {
          k.apply(`
apiVersion: v1
kind: ConfigMap
metadata:
  name: runtime-config
  namespace: fl-k8s-0040
data:
  FEATURE_FLAG: "true"
`);
          k.run("rollout", "restart", "deployment/app", "-n", "fl-k8s-0040");
          await k.rollout("app", "fl-k8s-0040");
        },
        failing: ["configmap-updated", "runtime-env"],
      },
      {
        name: "ConfigMap updated but Deployment not restarted",
        async run(k) {
          // Ensure the setup pod is Running before we apply the CM change, so the
          // runtime-env check can exec into it and observe the stale value.
          await k.rollout("app", "fl-k8s-0040");
          k.apply(`
apiVersion: v1
kind: ConfigMap
metadata:
  name: runtime-config
  namespace: fl-k8s-0040
data:
  FEATURE_FLAG: "enabled"
`);
          // no rollout restart — pod still has FEATURE_FLAG=disabled baked in
        },
        failing: ["runtime-env"],
      },
    ],
  },

  // ── Circuit B: Secrets ─────────────────────────────────────────────────────────────────────

  // 041 — Create a Secret
  "k8s-0041": {
    initial: [],
    async solve(k) {
      k.run(
        "create",
        "secret",
        "generic",
        "db-credentials",
        "--from-literal=username=admin",
        "--from-literal=password=FAKE_PASSWORD",
        "-n",
        "fl-k8s-0041",
      );
    },
    variants: [
      {
        name: "missing password key",
        async run(k) {
          k.run(
            "create",
            "secret",
            "generic",
            "db-credentials",
            "--from-literal=username=admin",
            "-n",
            "fl-k8s-0041",
          );
        },
        failing: ["keys"],
      },
      {
        name: "wrong secret name",
        async run(k) {
          k.run(
            "create",
            "secret",
            "generic",
            "database-credentials",
            "--from-literal=username=admin",
            "--from-literal=password=FAKE_PASSWORD",
            "-n",
            "fl-k8s-0041",
          );
        },
        failing: ["exists", "type", "keys"],
      },
    ],
  },

  // 042 — Read a Secret Value (secretKeyRef)
  "k8s-0042": {
    initial: [
      ["deployment", "app", "fl-k8s-0042"],
      ["secret", "app-secret", "fl-k8s-0042"],
    ],
    async solve(k) {
      smPatch(k, "app", "fl-k8s-0042", {
        template: {
          spec: {
            containers: [
              {
                name: "app",
                env: [
                  {
                    name: "API_KEY",
                    valueFrom: { secretKeyRef: { name: "app-secret", key: "api-key" } },
                  },
                ],
              },
            ],
          },
        },
      });
      await k.rollout("app", "fl-k8s-0042");
    },
    variants: [
      {
        name: "literal value instead of secretKeyRef",
        async run(k) {
          k.run("set", "env", "deployment/app", "API_KEY=demo-key-12345", "-n", "fl-k8s-0042");
          await k.rollout("app", "fl-k8s-0042");
        },
        failing: ["env-api-key"],
      },
      {
        name: "wrong env var name (APIKEY instead of API_KEY)",
        async run(k) {
          smPatch(k, "app", "fl-k8s-0042", {
            template: {
              spec: {
                containers: [
                  {
                    name: "app",
                    env: [
                      {
                        name: "APIKEY",
                        valueFrom: { secretKeyRef: { name: "app-secret", key: "api-key" } },
                      },
                    ],
                  },
                ],
              },
            },
          });
          await k.rollout("app", "fl-k8s-0042");
        },
        failing: ["env-api-key"],
      },
    ],
  },

  // 043 — Inject a Secret as an Env Var (two keys)
  "k8s-0043": {
    initial: [
      ["deployment", "web", "fl-k8s-0043"],
      ["secret", "tls-credentials", "fl-k8s-0043"],
    ],
    async solve(k) {
      smPatch(k, "web", "fl-k8s-0043", {
        template: {
          spec: {
            containers: [
              {
                name: "web",
                env: [
                  {
                    name: "TLS_CERT",
                    valueFrom: {
                      secretKeyRef: { name: "tls-credentials", key: "cert-file" },
                    },
                  },
                  {
                    name: "TLS_KEY",
                    valueFrom: {
                      secretKeyRef: { name: "tls-credentials", key: "key-file" },
                    },
                  },
                ],
              },
            ],
          },
        },
      });
      await k.rollout("web", "fl-k8s-0043");
    },
    variants: [
      {
        name: "only TLS_CERT injected, TLS_KEY missing",
        async run(k) {
          smPatch(k, "web", "fl-k8s-0043", {
            template: {
              spec: {
                containers: [
                  {
                    name: "web",
                    env: [
                      {
                        name: "TLS_CERT",
                        valueFrom: {
                          secretKeyRef: { name: "tls-credentials", key: "cert-file" },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          });
          await k.rollout("web", "fl-k8s-0043");
        },
        failing: ["env-tls-key"],
      },
      {
        name: "TLS_CERT points to wrong key (key-file instead of cert-file)",
        async run(k) {
          smPatch(k, "web", "fl-k8s-0043", {
            template: {
              spec: {
                containers: [
                  {
                    name: "web",
                    env: [
                      {
                        name: "TLS_CERT",
                        valueFrom: {
                          secretKeyRef: { name: "tls-credentials", key: "key-file" },
                        },
                      },
                      {
                        name: "TLS_KEY",
                        valueFrom: {
                          secretKeyRef: { name: "tls-credentials", key: "key-file" },
                        },
                      },
                    ],
                  },
                ],
              },
            },
          });
          await k.rollout("web", "fl-k8s-0043");
        },
        failing: ["env-tls-cert"],
      },
    ],
  },

  // 044 — Mount a Secret as a Volume
  "k8s-0044": {
    initial: [
      ["deployment", "api", "fl-k8s-0044"],
      ["secret", "api-keys", "fl-k8s-0044"],
    ],
    async solve(k) {
      smPatch(k, "api", "fl-k8s-0044", {
        template: {
          spec: {
            volumes: [{ name: "keys-vol", secret: { secretName: "api-keys" } }],
            containers: [
              { name: "api", volumeMounts: [{ name: "keys-vol", mountPath: "/etc/api-keys" }] },
            ],
          },
        },
      });
      await k.rollout("api", "fl-k8s-0044");
    },
    variants: [
      {
        name: "volume declared but no volumeMount on container",
        async run(k) {
          smPatch(k, "api", "fl-k8s-0044", {
            template: {
              spec: { volumes: [{ name: "keys-vol", secret: { secretName: "api-keys" } }] },
            },
          });
          await k.rollout("api", "fl-k8s-0044");
        },
        failing: ["secret-mounted"],
      },
      {
        name: "emptyDir volume instead of Secret volume (wrong volume type)",
        async run(k) {
          smPatch(k, "api", "fl-k8s-0044", {
            template: {
              spec: {
                volumes: [{ name: "keys-vol", emptyDir: {} }],
                containers: [
                  { name: "api", volumeMounts: [{ name: "keys-vol", mountPath: "/etc/api-keys" }] },
                ],
              },
            },
          });
          await k.rollout("api", "fl-k8s-0044");
        },
        failing: ["secret-mounted"],
      },
    ],
  },

  // 045 — Image-Pull Secret Reference
  "k8s-0045": {
    initial: [["deployment", "private-app", "fl-k8s-0045"]],
    async solve(k) {
      k.run(
        "create",
        "secret",
        "docker-registry",
        "registry-creds",
        "--docker-server=registry.example.com",
        "--docker-username=user",
        "--docker-password=FAKE_TOKEN",
        "-n",
        "fl-k8s-0045",
      );
      smPatch(k, "private-app", "fl-k8s-0045", {
        template: { spec: { imagePullSecrets: [{ name: "registry-creds" }] } },
      });
      await k.rollout("private-app", "fl-k8s-0045");
    },
    variants: [
      {
        name: "generic secret instead of docker-registry type",
        async run(k) {
          k.run(
            "create",
            "secret",
            "generic",
            "registry-creds",
            "--from-literal=.dockerconfigjson=FAKE_JSON",
            "-n",
            "fl-k8s-0045",
          );
          smPatch(k, "private-app", "fl-k8s-0045", {
            template: { spec: { imagePullSecrets: [{ name: "registry-creds" }] } },
          });
          await k.rollout("private-app", "fl-k8s-0045");
        },
        failing: ["secret-type"],
      },
      {
        name: "docker-registry secret created with wrong name (credentials instead of registry-creds)",
        async run(k) {
          k.run(
            "create",
            "secret",
            "docker-registry",
            "credentials",
            "--docker-server=registry.example.com",
            "--docker-username=user",
            "--docker-password=FAKE_TOKEN",
            "-n",
            "fl-k8s-0045",
          );
          smPatch(k, "private-app", "fl-k8s-0045", {
            template: { spec: { imagePullSecrets: [{ name: "credentials" }] } },
          });
          await k.rollout("private-app", "fl-k8s-0045");
        },
        failing: ["secret-type", "secret-exists"],
      },
    ],
  },

  // ── Circuit C: Multi-container Patterns & Security ─────────────────────────────────────────

  // 046 — Spot the Sidecar (label the pod template)
  "k8s-0046": {
    initial: [["deployment", "app", "fl-k8s-0046"]],
    async solve(k) {
      // Strategic-merge on labels (a map) merges keys — existing labels are preserved.
      smPatch(k, "app", "fl-k8s-0046", {
        template: { metadata: { labels: { "sidecar-identified": "true" } } },
      });
      await k.rollout("app", "fl-k8s-0046");
    },
    variants: [
      {
        // Labelling the Deployment itself does not change the pod template, so no rollout
        // is triggered. await k.rollout() ensures the reset pod is Ready before we check.
        name: "label added to Deployment metadata instead of pod template",
        async run(k) {
          await k.rollout("app", "fl-k8s-0046");
          k.run("label", "deployment", "app", "sidecar-identified=true", "-n", "fl-k8s-0046");
        },
        failing: ["sidecar-label"],
      },
      {
        name: "wrong label value (false instead of true)",
        async run(k) {
          smPatch(k, "app", "fl-k8s-0046", {
            template: { metadata: { labels: { "sidecar-identified": "false" } } },
          });
          await k.rollout("app", "fl-k8s-0046");
        },
        failing: ["sidecar-label"],
      },
    ],
  },

  // 047 — Add a Sidecar Container
  "k8s-0047": {
    initial: [["deployment", "web", "fl-k8s-0047"]],
    async solve(k) {
      smPatch(k, "web", "fl-k8s-0047", {
        template: {
          spec: {
            containers: [
              {
                name: "metrics-exporter",
                image: "busybox:1.36",
                command: ["sh", "-c", "while true; do echo metrics ok; sleep 10; done"],
              },
            ],
          },
        },
      });
      await k.rollout("web", "fl-k8s-0047");
    },
    variants: [
      {
        // nginx:1.27 is guaranteed available (used by the main web container in setup).
        name: "wrong image (nginx:1.27 instead of busybox:1.36)",
        async run(k) {
          smPatch(k, "web", "fl-k8s-0047", {
            template: {
              spec: {
                containers: [
                  {
                    name: "metrics-exporter",
                    image: "nginx:1.27",
                    command: ["sh", "-c", "while true; do echo metrics ok; sleep 10; done"],
                  },
                ],
              },
            },
          });
          await k.rollout("web", "fl-k8s-0047");
        },
        failing: ["sidecar-image"],
      },
      {
        name: "wrong container name (sidecar instead of metrics-exporter)",
        async run(k) {
          smPatch(k, "web", "fl-k8s-0047", {
            template: {
              spec: {
                containers: [
                  {
                    name: "sidecar",
                    image: "busybox:1.36",
                    command: ["sh", "-c", "while true; do echo metrics ok; sleep 10; done"],
                  },
                ],
              },
            },
          });
          await k.rollout("web", "fl-k8s-0047");
        },
        failing: ["sidecar-image"],
      },
    ],
  },

  // 048 — Drop Privilege Escalation
  "k8s-0048": {
    initial: [["deployment", "api", "fl-k8s-0048"]],
    async solve(k) {
      smPatch(k, "api", "fl-k8s-0048", {
        template: {
          spec: {
            containers: [{ name: "api", securityContext: { allowPrivilegeEscalation: false } }],
          },
        },
      });
      await k.rollout("api", "fl-k8s-0048");
    },
    variants: [
      {
        name: "set allowPrivilegeEscalation: true (opposite of correct)",
        async run(k) {
          smPatch(k, "api", "fl-k8s-0048", {
            template: {
              spec: {
                containers: [{ name: "api", securityContext: { allowPrivilegeEscalation: true } }],
              },
            },
          });
          await k.rollout("api", "fl-k8s-0048");
        },
        failing: ["security-context"],
      },
      {
        name: "set privileged: false instead (different field, check fails)",
        async run(k) {
          smPatch(k, "api", "fl-k8s-0048", {
            template: {
              spec: { containers: [{ name: "api", securityContext: { privileged: false } }] },
            },
          });
          await k.rollout("api", "fl-k8s-0048");
        },
        failing: ["security-context"],
      },
    ],
  },

  // 049 — Read-Only Root Filesystem (uses busybox so no nginx crash)
  "k8s-0049": {
    initial: [["deployment", "hardened", "fl-k8s-0049"]],
    async solve(k) {
      smPatch(k, "hardened", "fl-k8s-0049", {
        template: {
          spec: {
            containers: [{ name: "app", securityContext: { readOnlyRootFilesystem: true } }],
          },
        },
      });
      await k.rollout("hardened", "fl-k8s-0049");
    },
    variants: [
      {
        name: "set readOnlyRootFilesystem: false (disabled)",
        async run(k) {
          smPatch(k, "hardened", "fl-k8s-0049", {
            template: {
              spec: {
                containers: [{ name: "app", securityContext: { readOnlyRootFilesystem: false } }],
              },
            },
          });
          await k.rollout("hardened", "fl-k8s-0049");
        },
        failing: ["security-context"],
      },
      {
        name: "set allowPrivilegeEscalation: false (wrong field)",
        async run(k) {
          smPatch(k, "hardened", "fl-k8s-0049", {
            template: {
              spec: {
                containers: [{ name: "app", securityContext: { allowPrivilegeEscalation: false } }],
              },
            },
          });
          await k.rollout("hardened", "fl-k8s-0049");
        },
        failing: ["security-context"],
      },
    ],
  },

  // ── Circuit D: Health Probes ───────────────────────────────────────────────────────────────

  // 050 — Add a Readiness Probe (httpGet / port 80)
  "k8s-0050": {
    initial: [["deployment", "web", "fl-k8s-0050"]],
    async solve(k) {
      smPatch(k, "web", "fl-k8s-0050", {
        template: {
          spec: {
            containers: [{ name: "web", readinessProbe: { httpGet: { path: "/", port: 80 } } }],
          },
        },
      });
      await k.rollout("web", "fl-k8s-0050");
    },
    variants: [
      {
        name: "tcpSocket probe instead of httpGet (wrong handler type)",
        async run(k) {
          smPatch(k, "web", "fl-k8s-0050", {
            template: {
              spec: {
                containers: [{ name: "web", readinessProbe: { tcpSocket: { port: 80 } } }],
              },
            },
          });
          await k.rollout("web", "fl-k8s-0050");
        },
        failing: ["probe"],
      },
      {
        name: "liveness probe added instead of readiness",
        async run(k) {
          smPatch(k, "web", "fl-k8s-0050", {
            template: {
              spec: {
                containers: [{ name: "web", livenessProbe: { httpGet: { path: "/", port: 80 } } }],
              },
            },
          });
          await k.rollout("web", "fl-k8s-0050");
        },
        failing: ["probe"],
      },
    ],
  },

  // 051 — Add a Liveness Probe (tcpSocket / port 80)
  // Setup already has a readiness probe; this adds a liveness probe alongside it.
  "k8s-0051": {
    initial: [["deployment", "api", "fl-k8s-0051"]],
    async solve(k) {
      smPatch(k, "api", "fl-k8s-0051", {
        template: {
          spec: {
            containers: [{ name: "api", livenessProbe: { tcpSocket: { port: 80 } } }],
          },
        },
      });
      await k.rollout("api", "fl-k8s-0051");
    },
    variants: [
      {
        name: "httpGet liveness probe instead of tcpSocket",
        async run(k) {
          smPatch(k, "api", "fl-k8s-0051", {
            template: {
              spec: {
                containers: [{ name: "api", livenessProbe: { httpGet: { path: "/", port: 80 } } }],
              },
            },
          });
          await k.rollout("api", "fl-k8s-0051");
        },
        failing: ["probe"],
      },
      {
        // JSON patch replaces the readinessProbe entirely so it becomes tcpSocket-only,
        // avoiding a two-handler conflict (httpGet + tcpSocket in one probe is invalid).
        name: "tcpSocket readiness probe added instead of liveness probe",
        async run(k) {
          jsonPatch(k, "api", "fl-k8s-0051", [
            {
              op: "replace",
              path: "/spec/template/spec/containers/0/readinessProbe",
              value: { tcpSocket: { port: 80 } },
            },
          ]);
          await k.rollout("api", "fl-k8s-0051");
        },
        failing: ["probe"],
      },
    ],
  },

  // 052 — Tune Probe Timings (readiness httpGet, specific initialDelaySeconds/periodSeconds/failureThreshold)
  "k8s-0052": {
    initial: [["deployment", "slow-start", "fl-k8s-0052"]],
    async solve(k) {
      smPatch(k, "slow-start", "fl-k8s-0052", {
        template: {
          spec: {
            containers: [
              {
                name: "app",
                readinessProbe: {
                  httpGet: { path: "/", port: 80 },
                  initialDelaySeconds: 5,
                  periodSeconds: 15,
                  failureThreshold: 6,
                },
              },
            ],
          },
        },
      });
      await k.rollout("slow-start", "fl-k8s-0052");
    },
    variants: [
      {
        name: "correct probe type and port but default timings (initialDelaySeconds not set)",
        async run(k) {
          smPatch(k, "slow-start", "fl-k8s-0052", {
            template: {
              spec: {
                containers: [{ name: "app", readinessProbe: { httpGet: { path: "/", port: 80 } } }],
              },
            },
          });
          await k.rollout("slow-start", "fl-k8s-0052");
        },
        failing: ["probe"],
      },
      {
        name: "tcpSocket probe instead of httpGet (wrong handler type)",
        async run(k) {
          smPatch(k, "slow-start", "fl-k8s-0052", {
            template: {
              spec: {
                containers: [
                  {
                    name: "app",
                    readinessProbe: {
                      tcpSocket: { port: 80 },
                      initialDelaySeconds: 5,
                      periodSeconds: 15,
                      failureThreshold: 6,
                    },
                  },
                ],
              },
            },
          });
          await k.rollout("slow-start", "fl-k8s-0052");
        },
        failing: ["probe"],
      },
    ],
  },

  // 053 — Fix a Broken Probe (change port from 8080 to 80)
  // Setup has readinessProbe httpGet port 8080 — broken because nginx listens on 80.
  // The pod is NotReady at baseline so both probe and rollout checks fail.
  "k8s-0053": {
    initial: [["deployment", "api", "fl-k8s-0053"]],
    async solve(k) {
      jsonPatch(k, "api", "fl-k8s-0053", [
        {
          op: "replace",
          path: "/spec/template/spec/containers/0/readinessProbe/httpGet/port",
          value: 80,
        },
      ]);
      await k.rollout("api", "fl-k8s-0053");
    },
    alternatives: [
      {
        name: "kubectl apply with corrected probe spec",
        async run(k) {
          smPatch(k, "api", "fl-k8s-0053", {
            template: {
              spec: {
                containers: [
                  {
                    name: "api",
                    readinessProbe: {
                      httpGet: { path: "/", port: 80 },
                      initialDelaySeconds: 3,
                      periodSeconds: 5,
                    },
                  },
                ],
              },
            },
          });
          await k.rollout("api", "fl-k8s-0053");
        },
      },
    ],
    variants: [
      {
        // JSON patch replaces probe entirely so only tcpSocket remains (no two-handler conflict).
        name: "fix port but switch to tcpSocket instead of httpGet (wrong handler)",
        async run(k) {
          jsonPatch(k, "api", "fl-k8s-0053", [
            {
              op: "replace",
              path: "/spec/template/spec/containers/0/readinessProbe",
              value: { tcpSocket: { port: 80 } },
            },
          ]);
          await k.rollout("api", "fl-k8s-0053");
        },
        failing: ["probe"],
      },
      {
        name: "delete the probe entirely instead of fixing it",
        async run(k) {
          jsonPatch(k, "api", "fl-k8s-0053", [
            { op: "remove", path: "/spec/template/spec/containers/0/readinessProbe" },
          ]);
          await k.rollout("api", "fl-k8s-0053");
        },
        failing: ["probe"],
      },
    ],
  },
};
