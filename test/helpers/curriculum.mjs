/**
 * The designed Kubernetes curriculum, in display order. Display order is the `order` field
 * within each level, not id order: ids are stable identities, so exercises added later get new
 * ids even when they are taught earlier.
 */
export const CURRICULUM = Object.freeze({
  0: [
    "k8s-0001", // Your first Pod
    "k8s-0011", // Inspect a Pod
    "k8s-0012", // Working With YAML
    "k8s-0013", // Namespaces 101
    "k8s-0014", // Labels and Selectors
    "k8s-0002", // Run a Deployment
    "k8s-0015", // Scale an Application
    "k8s-0016", // Managing Desired State
    "k8s-0017", // Find the Simple Mistake
    "k8s-0018", // Foundations Challenge
  ],
  1: ["k8s-0003", "k8s-0006"],
  2: ["k8s-0004", "k8s-0005", "k8s-0007", "k8s-0008", "k8s-0009", "k8s-0010"],
});

export const CURRICULUM_ORDER = Object.freeze(Object.values(CURRICULUM).flat());

/** The Level 0 capstone every later level is gated behind. */
export const FOUNDATIONS_CHALLENGE = "k8s-0018";
