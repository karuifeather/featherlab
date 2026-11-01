# NodePort Configuration

## ClusterIP vs NodePort

A **ClusterIP** Service gives a stable virtual IP that is only reachable inside the cluster.
A **NodePort** Service does the same, but also opens a port on every node in the cluster
(in the range 30000–32767) so traffic from outside the cluster can reach the Pods.

```
External client → <node-ip>:<nodePort> → Service ClusterIP → Pod
```

Kubernetes assigns the nodePort automatically unless you specify one. You can find the
assigned value with:

```bash
kubectl get svc web -n fl-k8s-0114 -o jsonpath='{.spec.ports[0].nodePort}'
```

## kind limitations

In a kind cluster, nodes run inside Docker containers. The nodePort is open on the node,
but Docker's network bridging means the port may not be reachable from your laptop
without extra configuration (`extraPortMappings` in the kind cluster config). This lab
only checks that the Service is configured correctly — not that the port is reachable from
outside.

## The task

Namespace `fl-k8s-0114` has a `web` Deployment with no Service.

Create a **NodePort** Service named `web` that exposes port `80` and routes to the `web`
Deployment. Let Kubernetes assign the nodePort automatically.

## Reference

- [Services — NodePort](https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport)
