#!/bin/bash
# Generate synthetic TLS certificates for FeatherLab Level 6 exercises.
# Run this script once to (re)generate the fixtures. Output files are committed.
#
# Requirements: openssl >= 1.1.1
# All certificates use the .fl.test pseudo-TLD (never resolvable externally).
# Validity: 10 years (3650 days) so the test suite doesn't silently rot.
#
# After regeneration:
#   1. Commit the updated PEM files.
#   2. Update the expected fingerprints in test/unit/tls-fixtures.test.mjs.
#   3. Run `npm test` to confirm the expiry guard still passes.

set -euo pipefail
cd "$(dirname "$0")"

# CA key and self-signed certificate
openssl genrsa -out ca.key 2048
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt \
  -subj "/CN=FeatherLab Test CA/O=FeatherLab/C=US"

# app.k8s-0140.fl.test — used in Ingress TLS exercises
openssl genrsa -out app-k8s-0140.key 2048
openssl req -new -key app-k8s-0140.key -out app-k8s-0140.csr \
  -subj "/CN=app.k8s-0140.fl.test/O=FeatherLab/C=US"
openssl x509 -req -days 3650 -in app-k8s-0140.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out app-k8s-0140.crt \
  -extfile <(printf "subjectAltName=DNS:app.k8s-0140.fl.test")

# app.k8s-0141.fl.test — used in Gateway HTTPS exercises
openssl genrsa -out app-k8s-0141.key 2048
openssl req -new -key app-k8s-0141.key -out app-k8s-0141.csr \
  -subj "/CN=app.k8s-0141.fl.test/O=FeatherLab/C=US"
openssl x509 -req -days 3650 -in app-k8s-0141.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out app-k8s-0141.crt \
  -extfile <(printf "subjectAltName=DNS:app.k8s-0141.fl.test")

# wrong-host.fl.test — intentional hostname mismatch for k8s-0142 (Fix TLS)
openssl genrsa -out wrong-host.key 2048
openssl req -new -key wrong-host.key -out wrong-host.csr \
  -subj "/CN=wrong-host.fl.test/O=FeatherLab/C=US"
openssl x509 -req -days 3650 -in wrong-host.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out wrong-host.crt \
  -extfile <(printf "subjectAltName=DNS:wrong-host.fl.test")

# mastery.k8s-0150.fl.test — used in the Level 6 mastery challenge
openssl genrsa -out mastery-k8s-0150.key 2048
openssl req -new -key mastery-k8s-0150.key -out mastery-k8s-0150.csr \
  -subj "/CN=mastery.k8s-0150.fl.test/O=FeatherLab/C=US"
openssl x509 -req -days 3650 -in mastery-k8s-0150.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out mastery-k8s-0150.crt \
  -extfile <(printf "subjectAltName=DNS:mastery.k8s-0150.fl.test")

# Clean up CSRs and serial files (not needed after issuance)
rm -f *.csr *.srl

echo "TLS fixtures generated. Commit the .crt, .key, and ca.crt files."
echo "Update test/unit/tls-fixtures.test.mjs with new expiry dates."
