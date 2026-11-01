export interface Level {
  number: number;
  theme: string;
  exerciseCount: number;
  checkCount: number;
  implemented: true;
}

export interface PlannedGroup {
  label: string;
  range: string;
  description: string;
}

export const IMPLEMENTED_LEVELS: Level[] = [
  {
    number: 0,
    theme: "Kubernetes foundations",
    exerciseCount: 10,
    checkCount: 7,
    implemented: true,
  },
  { number: 1, theme: "Deployment lifecycle", exerciseCount: 18, checkCount: 6, implemented: true },
  {
    number: 2,
    theme: "Configuration, health, recovery",
    exerciseCount: 25,
    checkCount: 6,
    implemented: true,
  },
  { number: 3, theme: "Application patterns", exerciseCount: 25, checkCount: 7, implemented: true },
  {
    number: 4,
    theme: "Resource management & scheduling",
    exerciseCount: 19,
    checkCount: 8,
    implemented: true,
  },
  { number: 5, theme: "Services and DNS", exerciseCount: 27, checkCount: 7, implemented: true },
  {
    number: 6,
    theme: "Ingress and Gateway API",
    exerciseCount: 26,
    checkCount: 6,
    implemented: true,
  },
  { number: 7, theme: "NetworkPolicy", exerciseCount: 24, checkCount: 7, implemented: true },
];

export const PLANNED_GROUPS: PlannedGroup[] = [
  { label: "Level 8", range: "L8", description: "Storage — PVs, PVCs, StorageClasses" },
  { label: "Level 9", range: "L9", description: "ServiceAccounts and RBAC" },
  { label: "Level 10", range: "L10", description: "Kustomize, Helm, and CRDs" },
  { label: "Levels 11–12", range: "L11–12", description: "CKAD mastery and troubleshooting" },
  {
    label: "Levels 13–15",
    range: "L13–15",
    description: "Cluster administration and CKA readiness",
  },
  {
    label: "Levels 16–21",
    range: "L16–21",
    description: "Cloud-native security and CKS readiness",
  },
];

export const TOTAL_EXERCISES = IMPLEMENTED_LEVELS.reduce((sum, l) => sum + l.exerciseCount, 0);
export const TOTAL_CHECKS = IMPLEMENTED_LEVELS.reduce((sum, l) => sum + l.checkCount, 0);
