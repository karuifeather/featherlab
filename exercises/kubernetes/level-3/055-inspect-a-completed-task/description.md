A Pod named `data-probe` has been created in `fl-k8s-0055` for you. It runs a one-time task with
`restartPolicy: Never` and exits immediately. Inspect its output, then create a second Pod that
also runs a task and exits successfully.

**Logs survive container exit**

`kubectl logs` works on completed Pods just like running ones. The container's stdout is kept
until the Pod is deleted. Use this to audit what a batch job produced:

```bash
kubectl logs data-probe -n fl-k8s-0055
```

**What you will do**

1. Run the above command to read `data-probe`'s output.
2. Create a Pod named `inspector` in `fl-k8s-0055` using `busybox:1.36` that runs
   `echo "found it"` and exits successfully.

```bash
kubectl run inspector \
  --image=busybox:1.36 \
  --restart=Never \
  -n fl-k8s-0055 \
  --command -- echo "found it"
```

3. Wait for `inspector` to reach `Succeeded`:

```bash
kubectl wait pod/inspector -n fl-k8s-0055 \
  --for=jsonpath={.status.phase}=Succeeded \
  --timeout=60s
```

Grading checks that both `data-probe` and `inspector` are in phase `Succeeded`.
