# Routing Infrastructure

Vendored manifests for the FeatherLab Level 6 routing environment (profile: `kind-routing`).

## Controller

**Traefik v3** — single controller supporting both Kubernetes Ingress (networking.k8s.io/v1)
and Gateway API (gateway.networking.k8s.io/v1). Installed in the `traefik-system` namespace
by the platform provisioner; never installed or modified by learner exercises.

**Pinned versions (to be verified before production use):**

- Traefik: v3.3.x — pin by digest in `traefik.yaml`
- Gateway API CRDs: standard channel v1.2.x — verify against https://gateway-api.sigs.k8s.io/

## Files

- `gateway-api-crds.yaml` — Gateway API standard-channel CRDs (GatewayClass, Gateway,
  HTTPRoute, ReferenceGrant, …). Applied with `--server-side` before Traefik.
- `traefik.yaml` — Traefik deployment, ServiceAccount, RBAC, and Service.
- `gatewayclass.yaml` — The `traefik` GatewayClass (cluster-scoped; platform-owned).

## Security

- Traefik runs with least-privilege RBAC: read access to Ingress, Gateway, HTTPRoute,
  ReferenceGrant, Service, Endpoints, and Secret (for TLS). No write access to any resource.
- Exercises may NOT create or delete GatewayClass or IngressClass (queryOnly in KINDS).
- Exercises may NOT create resources in `traefik-system` (protected namespace).
- Cross-namespace backend references require ReferenceGrant in the target namespace.

## TLS fixtures

Synthetic CA and leaf certificates for exercises are in `../../../../test/helpers/tls-fixtures/`.
All certificates use the `.fl.test` pseudo-TLD. No real credentials are stored here.
The `ca.crt` is included in setup ConfigMaps so exercises can verify HTTPS correctly.

## Updating

1. Download the new Gateway API CRDs from the official release.
2. Update the Traefik image digest in `traefik.yaml`.
3. Run the Batch 0 proof-of-capability test:
   `FEATHERLAB_KIND_TESTS=1 node --test test/integration/level6-routing-proof.test.mjs`
4. Verify all Level 6 exercises still pass.
