import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client.js";

/**
 * Fetch and cache track progress from /api/progress/track/:trackId.
 *
 * progressMap: Map<exerciseId, { state, unmetPrerequisites, title, completed, ... }>
 * summary: { total, completed, available, locked } | null
 *
 * On API failure the map stays empty so the rest of the UI remains functional
 * (exercises are treated as "available" by callers that default on missing entries).
 */
export function useTrackProgress(trackId) {
  const [state, setState] = useState({
    progressMap: new Map(),
    summary: null,
    loading: true,
    error: null,
  });
  // Incrementing this triggers a re-fetch without changing trackId.
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getTrackProgress(trackId)
      .then((data) => {
        if (cancelled) return;
        setState({
          progressMap: new Map(data.exercises.map((e) => [e.exerciseId, e])),
          summary: data.summary,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ progressMap: new Map(), summary: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, epoch]);

  const refresh = useCallback(() => setEpoch((n) => n + 1), []);

  return { ...state, refresh };
}
