import { useEffect, useState } from "react";
import { api } from "../../api/client.js";

export function useExerciseList(track) {
  const [state, setState] = useState({ exercises: null, error: "" });
  useEffect(() => {
    let cancelled = false;
    api
      .listExercises(`?track=${encodeURIComponent(track)}`)
      .then((data) => !cancelled && setState({ exercises: data.exercises, error: "" }))
      .catch((e) => !cancelled && setState({ exercises: [], error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [track]);
  return state;
}
