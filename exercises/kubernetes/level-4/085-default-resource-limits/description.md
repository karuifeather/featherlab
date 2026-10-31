A LimitRange can automatically apply default resource requests and limits to containers that do not specify them. This "defaulting" happens at Pod admission — before the Pod is created. LimitRanges can also enforce min/max bounds so no container in the namespace can exceed a given resource ceiling.

Your task:

In namespace `fl-k8s-0085`, create a LimitRange named `default-limits` with a single `Container`-type entry that sets:

| Field             | cpu    | memory      |
| ----------------- | ------ | ----------- |
| `default` (limit) | `200m` | `128Mi`     |
| `defaultRequest`  | `100m` | `64Mi`      |
| `max`             | `1`    | _(not set)_ |

The LimitRange must be of type `Container`.

Reference: `kubectl explain limitrange.spec.limits`
