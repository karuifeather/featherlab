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
  4: [
    // Circuit A — Resource Requests and Limits (M5.6)
    "k8s-0079", // Your First Resource Request
    "k8s-0080", // CPU and Memory Units
    "k8s-0081", // Per-Container Budgets
    // Circuit B — QoS, ResourceQuota, LimitRange (M5.6)
    "k8s-0082", // QoS Classes
    "k8s-0083", // Budget a Namespace
    "k8s-0084", // Why Was Creation Rejected?
    "k8s-0085", // Default Resource Limits
    "k8s-0086", // Repair a Constrained Workload
    // Circuit C — Node Inspection and Placement (M5.6)
    "k8s-0087", // A Pod's Node Assignment
    "k8s-0088", // Select an Eligible Node
    "k8s-0089", // Repair a Pending Deployment
    // Circuit E — Node Affinity (M5.6)
    "k8s-0090", // Required Node Affinity
    "k8s-0091", // Preferred Node Affinity
    "k8s-0092", // Pod Anti-Affinity for Spread
    "k8s-0093", // Diagnose an Unschedulable Pod
    // Circuit G — HPA and Mastery (M5.6)
    "k8s-0094", // Your First HPA
    "k8s-0095", // HPA with CPU Policy
    "k8s-0096", // Investigate a Pending Pod
    "k8s-0097", // Master Scheduling Placement
  ],
  5: [
    // Circuit A — ClusterIP Fundamentals (M5.7)
    "k8s-0098", // Your First Service
    "k8s-0099", // Connect to a Service
    "k8s-0100", // Service Ports
    "k8s-0101", // Named Ports
    "k8s-0102", // Repair a Selector
    "k8s-0103", // Service Fundamentals Challenge
    // Circuit B — EndpointSlices and Backend Readiness (M5.7)
    "k8s-0104", // Find the Backends
    "k8s-0105", // Multiple Backends
    "k8s-0106", // Readiness Matters
    "k8s-0107", // Empty EndpointSlice
    "k8s-0108", // Restore a Broken Service
    // Circuit C — DNS (M5.7)
    "k8s-0109", // Resolve a Service
    "k8s-0110", // Reach Another Namespace
    "k8s-0111", // DNS Search Paths
    "k8s-0112", // Headless Service
    "k8s-0113", // ExternalName Service
    // Circuit D — Service Types (M5.7)
    "k8s-0114", // NodePort Configuration
    "k8s-0115", // Service Type Troubleshooting
    // Circuit E — Blue/Green Deployment (M5.7)
    "k8s-0116", // Two Versions, One Service
    "k8s-0117", // Switch to Green
    "k8s-0118", // Roll Back to Blue
    "k8s-0119", // Broken Release Recovery
    // Circuit F — Canary Traffic (M5.7)
    "k8s-0120", // Configure a Canary
    "k8s-0121", // Observe Both Versions
    "k8s-0122", // Promote or Roll Back
    // Circuit G — DNS Troubleshooting and Mastery (M5.7)
    "k8s-0123", // Debug DNS
    "k8s-0124", // Services and DNS Mastery
  ],
  6: [
    // Circuit A — Ingress Fundamentals
    "k8s-0125", // Your First Ingress
    "k8s-0126", // Route by Hostname
    "k8s-0127", // Route by Path
    "k8s-0128", // Fix the Backend
    "k8s-0129", // Ingress Routing Troubleshooting
    // Circuit B — Gateway API Architecture
    "k8s-0130", // Inspect the GatewayClass
    "k8s-0131", // Your First Gateway Route
    "k8s-0132", // Hostname Routing with Gateway
    "k8s-0133", // Path-Based Routing
    "k8s-0134", // Route Attachment
    "k8s-0135", // Gateway Status Diagnostics
    // Circuit C — HTTP Matching
    "k8s-0136", // Match the Correct Path
    "k8s-0137", // Route by Request Header
    "k8s-0138", // HTTP Redirect
    "k8s-0139", // Repair a Routing Conflict
    // Circuit D — TLS and HTTPS
    "k8s-0140", // HTTPS with Ingress
    "k8s-0141", // HTTPS with Gateway
    "k8s-0142", // Fix a TLS Configuration
    "k8s-0143", // Secure Routing Challenge
    // Circuit E — Cross-Namespace Routing
    "k8s-0144", // Route Across Namespaces
    "k8s-0145", // Inspect the Cross-Namespace Failure
    "k8s-0146", // Multi-Backend Cross-Namespace
    "k8s-0147", // Cross-Namespace Routing Mastery
    // Circuit F — Canary HTTPRoute
    "k8s-0148", // Configure a Canary HTTPRoute
    "k8s-0149", // Promote the Canary
    // Level 6 Mastery
    "k8s-0150", // Level 6 Routing Mastery
  ],
});

export const CURRICULUM_ORDER = Object.freeze(Object.values(CURRICULUM).flat());

/** The Level 0 capstone every later level is gated behind. */
export const FOUNDATIONS_CHALLENGE = "k8s-0018";
