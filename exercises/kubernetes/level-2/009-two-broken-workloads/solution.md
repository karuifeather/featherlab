orders: the Service selects `app=order`; the Pods are labelled `app=orders`. The EndpointSlice
is empty.

payments: Pods are in `CreateContainerConfigError`; Events say
`configmap "payment-config" not found`. The real ConfigMap is `payments-config`.

```bash
kubectl patch service orders -n fl-k8s-0009 -p '{"spec":{"selector":{"app":"orders"}}}'
kubectl patch deployment payments -n fl-k8s-0009 --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/env/0/valueFrom/configMapKeyRef/name","value":"payments-config"}]'
kubectl rollout status deployment/payments -n fl-k8s-0009
kubectl get endpointslices -n fl-k8s-0009
```

Creating a ConfigMap named `payment-config` makes the Pods start but does not meet the
requirement to use the existing `payments-config`.
