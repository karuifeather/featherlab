/**
 * Learning tracks the launcher can open. Each entry must correspond to a track the backend
 * actually serves (`/api/progress/track/:id`, `/api/exercises?track=:id`); the launcher
 * renders one workspace row per entry and takes every count and state from the API.
 * Add a track here when its backend definition ships — never as a placeholder.
 */
export const TRACKS = [
  {
    id: "kubernetes",
    glyph: "☸",
    name: "Kubernetes",
    description: "Hands-on Kubernetes practice",
  },
];
