import { useEffect, useState } from "react";
import { Launcher } from "./features/launcher/Launcher.jsx";
import { Workspace } from "./features/workspace/Workspace.jsx";

/** Theme override stored on <html data-theme>; unset means "follow the OS". */
function useTheme() {
  const [override, setOverride] = useState(() => {
    try {
      return localStorage.getItem("fl-theme");
    } catch {
      return null;
    }
  });
  const [systemDark, setSystemDark] = useState(
    () => !window.matchMedia("(prefers-color-scheme: light)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemDark(!mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    if (override) el.setAttribute("data-theme", override);
    else el.removeAttribute("data-theme");
    try {
      if (override) localStorage.setItem("fl-theme", override);
      else localStorage.removeItem("fl-theme");
    } catch {
      /* storage unavailable — theme just won't persist across reloads */
    }
  }, [override]);

  const resolved = override ?? (systemDark ? "dark" : "light");
  return { resolved, toggle: () => setOverride(resolved === "dark" ? "light" : "dark") };
}

export function App() {
  const [trackState, setTrackState] = useState(null);
  const { resolved, toggle } = useTheme();

  // Launcher calls onEnter(trackId, initialExerciseId | null)
  const handleEnter = (trackId, initialExerciseId) => {
    setTrackState({ id: trackId, initialExerciseId: initialExerciseId ?? null });
  };

  return (
    <main className="app">
      {/* The launcher header shares the launcher's centred container so their edges line up;
          the workspace header spans the full width like the workspace below it. */}
      <header className={`topbar ${trackState ? "topbar--workspace" : "topbar--launcher"}`}>
        <div className={`topbar-inner ${trackState ? "" : "page-container"}`}>
          <div className="topbar-left">
            <button
              type="button"
              className="logo"
              onClick={() => setTrackState(null)}
              title="Back to workspaces"
            >
              <span className="brand-mark" aria-hidden="true">
                ✦
              </span>
              featherlab
            </button>
            {trackState && (
              <span className="topbar-crumb" aria-label="Current workspace">
                <span aria-hidden="true">/</span> {trackState.id}
              </span>
            )}
          </div>
          <div className="topbar-right">
            <span className="local">Local</span>
            <button
              type="button"
              className="icon-button"
              onClick={toggle}
              aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${resolved === "dark" ? "light" : "dark"} theme`}
            >
              {resolved === "dark" ? "☾" : "☀"}
            </button>
          </div>
        </div>
      </header>
      {trackState ? (
        <Workspace track={trackState.id} initialExerciseId={trackState.initialExerciseId} />
      ) : (
        <Launcher onEnter={handleEnter} />
      )}
    </main>
  );
}
