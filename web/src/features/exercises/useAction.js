import { useCallback, useState } from "react";

/** Wrap an async API call with busy/error state for a button. */
export function useAction(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useCallback(
    async (...args) => {
      setBusy(true);
      setError("");
      try {
        return await fn(...args);
      } catch (e) {
        setError(e.message);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );
  return { run, busy, error, clearError: () => setError("") };
}
