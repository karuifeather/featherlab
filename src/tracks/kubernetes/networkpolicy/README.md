# NetworkPolicy Infrastructure

Level 7 environment for FeatherLab (profile: `kind-networkpolicy`).

## CNI

**kindnet** — the default kind CNI. Since kind v0.24.0 / kindnet v1.4.0, kindnet
enforces standard Kubernetes NetworkPolicy by default. No separate CNI installation
is needed for FeatherLab's supported cluster image
(`kindest/node:v1.37.0`).

The `ensureNetworkPolicyCapable()` function in `lifecycle.mjs` verifies that the kindnet
DaemonSet is healthy before a Level 7 exercise activates. It does **not** install or
replace the CNI.

## Enforcement proof

The following was verified against kind v0.33.0 and kindest/node:v1.37.0
on 2026-11-01:

1. Baseline TCP connectivity between Pods works without any policy.
2. A default-deny ingress NetworkPolicy blocks client → server (curl exit 28, timeout).
3. An allow rule for a specific client Pod restores connectivity for that client only.
4. An unauthorized client remains blocked after the allow rule is added.
5. A default-deny egress policy blocks client → server (curl exit 6, DNS also blocked).
6. An egress allow rule restores connectivity to the specific server after also
   allowing DNS (UDP/TCP 53 to kube-dns).

See `test/integration/level7-networkpolicy-proof.test.mjs` for the automated proof.

## Deny signature

- **Ingress block**: curl exit 28 (operation timed out — TCP silently dropped).
- **Egress block without DNS allow**: curl exit 6 (couldn't resolve host — DNS blocked).
- **Egress block with DNS allowed**: curl exit 28 (DNS resolves; TCP to server dropped).
- **Connection refused**: curl exit 7 (actively refused, e.g. no server listening).

The `k8s.traffic-blocked` validator accepts exit codes 6, 7, and 28 as evidence of
a successful NetworkPolicy block, after first confirming the server Pod is Ready.

## Security

- NetworkPolicy is namespace-scoped; exercises own their namespaces and all policies
  within them.
- Exercise setup may label namespaces (via namespace manifests declared in
  `lifecycle.namespaces`); learners label Pods and fix policies.
- No cluster-scoped NetworkPolicy (GlobalNetworkPolicy) is used; only standard
  `networking.k8s.io/v1 NetworkPolicy`.
- The kube-system namespace is protected; exercises may not create resources there.
- DNS egress allow rules must target CoreDNS **pods** via `namespaceSelector` +
  `podSelector` (label `k8s-app: kube-dns` in `kube-system`), **not** the kube-dns
  Service ClusterIP via `ipBlock`. kube-proxy DNAT rewrites the ClusterIP to a CoreDNS
  Pod IP before NetworkPolicy sees the packet, so an `ipBlock` rule never matches.
