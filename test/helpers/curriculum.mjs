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
  1: [
    // Circuit A — Understand Deployment Behavior
    "k8s-0019", // Meet the ReplicaSet
    "k8s-0020", // Metadata and Pod Templates
    "k8s-0021", // Desired State Revisited
    // Circuit B — Make Safe Changes
    "k8s-0022", // Generate a Deployment Manifest
    "k8s-0023", // Update an Image
    "k8s-0024", // Observe a Rolling Update
    "k8s-0025", // Preview Before Applying
    // Circuit C — Rollout Strategies and History
    "k8s-0026", // RollingUpdate vs Recreate
    "k8s-0027", // RollingUpdate Controls
    "k8s-0028", // Release Metadata and Revision History
    "k8s-0029", // Pause and Resume
    // Circuit D — Recovery
    "k8s-0030", // Guided Rollback
    "k8s-0031", // Restore the Correct Revision
    "k8s-0032", // Restart, Update, or Roll Back?
    // Circuit E — API Compatibility
    "k8s-0033", // Repair an Outdated Manifest
    // Circuit F — Level 1 Mastery
    "k8s-0034", // Release Management Challenge
    // Pre-existing Level 1 labs (now placed after the deployment lifecycle sequence)
    "k8s-0003", // Namespace Matters
    "k8s-0006", // Resource Boundaries
  ],
  2: ["k8s-0004", "k8s-0005", "k8s-0007", "k8s-0008", "k8s-0009", "k8s-0010"],
});

export const CURRICULUM_ORDER = Object.freeze(Object.values(CURRICULUM).flat());

/** The Level 0 capstone every later level is gated behind. */
export const FOUNDATIONS_CHALLENGE = "k8s-0018";
