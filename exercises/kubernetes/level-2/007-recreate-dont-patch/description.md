On-call needs more detail from the `audit-log` Pod in `fl-k8s-0007`: it must run with
`LOG_LEVEL=debug` instead of `info`. It is a standalone Pod (no Deployment manages it), and the
`audit-log` Service sends traffic to it.

Kubernetes allows only a few fields of a running Pod to change. When you need to change
anything else, the Pod has to be replaced by a new one. Make the change, and make sure that
when you are done the replacement looks like the original in every other respect that
matters: same name, same image, and still reachable through its Service.
