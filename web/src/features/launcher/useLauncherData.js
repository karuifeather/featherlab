import { useEffect, useState } from "react";
import { api } from "../../api/client.js";

/**
 * Everything the launcher shows, fetched once on mount: resume state, environment status and
 * per-track progress. Each request fails independently to `null`, so a missing piece hides
 * its part of the UI instead of inventing a value.
 *
 * Returns null while loading, then
 *   { resume, cluster, progress: { [trackId]: { exercises, summary } | null } }
 */
export function useLauncherData(trackIds) {
  const [state, setState] = useState(null);
  const key = trackIds.join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = key.split(",");
    Promise.all([
      api.getResume().catch(() => ({ resume: null })),
      api.getStatus().catch(() => null),
      ...ids.map((id) => api.getTrackProgress(id).catch(() => null)),
    ]).then(([resumeData, status, ...progress]) => {
      if (cancelled) return;
      setState({
        resume: resumeData?.resume ?? null,
        cluster: typeof status?.cluster === "string" ? status.cluster : null,
        progress: Object.fromEntries(ids.map((id, i) => [id, progress[i]])),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}

/**
 * Whether the learner has started this track. A backend fallback resume (no explicit
 * selection yet) only counts once something has been completed — otherwise it is a
 * first-time learner who should see "Start Learning".
 */
export function hasStarted(resume, summary, trackId) {
  if (!resume || resume.trackId !== trackId) return false;
  return !resume.fallback || (summary?.completed ?? 0) > 0;
}
