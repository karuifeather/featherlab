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
  2: [
    // Circuit A — ConfigMaps
    "k8s-0035", // Inject a Setting With env.value
    "k8s-0036", // Create and Read a ConfigMap
    "k8s-0037", // Config as Environment Variables
    "k8s-0038", // Load All Keys With envFrom
    "k8s-0039", // Mount a ConfigMap as a Volume
    "k8s-0040", // Update a Live ConfigMap
    // Circuit B — Secrets
    "k8s-0041", // Create a Secret
    "k8s-0042", // Read a Secret Value
    "k8s-0043", // Inject a Secret as an Env Var
    "k8s-0044", // Mount a Secret as a Volume
    "k8s-0045", // Image-Pull Secret Reference
    // Circuit C — Multi-container Patterns & Security
    "k8s-0046", // Spot the Sidecar
    "k8s-0047", // Add a Sidecar Container
    "k8s-0048", // Drop Privilege Escalation
    "k8s-0049", // Read-Only Root Filesystem
    // Circuit D — Health Probes
    "k8s-0050", // Add a Readiness Probe
    "k8s-0051", // Add a Liveness Probe
    "k8s-0052", // Tune Probe Timings
    "k8s-0053", // Fix a Broken Probe
    // Pre-existing Level 2 labs (workload debugging, now after M5.4 content)
    "k8s-0004", // Wrong Image
    "k8s-0005", // Why Not Ready?
    "k8s-0007", // Recreate, Don't Patch
    "k8s-0008", // Crashing Container
    "k8s-0009", // Two Broken Workloads
    "k8s-0010", // Workload Recovery Mastery
  ],
  3: [
    // Circuit A — One-Time Pods and Init Containers (M5.5)
    "k8s-0054", // Run a One-Time Pod
    "k8s-0055", // Inspect a Completed Task
    "k8s-0056", // Fix a Startup Command
    "k8s-0057", // Initialize Before Starting
    "k8s-0058", // Prepare Shared Files
    "k8s-0059", // Diagnose Failed Initialization
    "k8s-0060", // Application Startup Challenge
    // Circuit B — Native Sidecars
    "k8s-0061", // A Supporting Container
    "k8s-0062", // Sidecar and Shared Files
    "k8s-0063", // Startup Ordering with Native Sidecar
    "k8s-0064", // Repair the Native Sidecar
    // Circuit C — Jobs
    "k8s-0065", // Your First Job
    "k8s-0066", // Job Status and Logs
    "k8s-0067", // Recover a Failed Job
    "k8s-0068", // Multiple Completions and Parallelism
    "k8s-0069", // Retry and Deadline Controls
    // Circuit E — CronJobs (M5.5)
    "k8s-0070", // Create a Scheduled Job
    "k8s-0071", // Run the Template Now
    "k8s-0072", // Suspend and Maintain a CronJob
    "k8s-0073", // Repair a Broken Schedule
    // Circuit F — DaemonSets and Workload Selection (M5.5)
    "k8s-0074", // Meet the DaemonSet
    "k8s-0075", // Maintain a Node-Local Helper
    "k8s-0076", // Observe DaemonSet Scheduling
    "k8s-0077", // Choose the Correct Controller
    // Final Challenge (M5.5)
    "k8s-0078", // Application Patterns Mastery
  ],
});

export const CURRICULUM_ORDER = Object.freeze(Object.values(CURRICULUM).flat());

/** The Level 0 capstone every later level is gated behind. */
export const FOUNDATIONS_CHALLENGE = "k8s-0018";
