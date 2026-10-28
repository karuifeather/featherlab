The internal `status-page` site in `fl-k8s-0005` is down. Its Pods are `Running` and nothing
is crashing, yet the `status-page` Service has no endpoints, so requests go nowhere.

Kubernetes only sends Service traffic to Pods that report Ready. Work out why these Pods are
not Ready and fix the Deployment so that both replicas are Ready and routable. The readiness
check exists for a reason: keep an HTTP readiness probe on the container.

`kubectl get endpointslices -n fl-k8s-0005` shows what the Service is currently routing to.
