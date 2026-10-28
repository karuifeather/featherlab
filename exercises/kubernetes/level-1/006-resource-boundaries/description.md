The platform team now requires every application container to declare how much CPU and memory
it needs (its **requests**) and the most it may use (its **limits**). Without requests the
scheduler cannot place Pods sensibly; without limits one runaway container can starve its
neighbours.

The `ledger` Deployment in `fl-k8s-0006` runs two containers: the application (`app`) and a
small helper (`metrics`) whose resources were already tuned by another team. Configure the
`app` container as required, without changing the helper, and let the Deployment roll out.

Kubernetes accepts several spellings of the same amount (`0.1` CPU is `100m`; `64Mi` is
`67108864` bytes). Any equivalent value is accepted.
