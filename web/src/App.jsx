import { useEffect, useState } from "react";
import { Launcher } from "./components/Launcher.jsx";
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
  const [track, setTrack] = useState(null);
  const { resolved, toggle } = useTheme();

  return (
    <main className="app">
      <header className="topbar">
        <div className="topbar-left">
          <button className="logo" onClick={() => setTrack(null)}>
            <span className="brand-mark" aria-hidden="true">
              ✦
            </span>{" "}
            featherlab
          </button>
        </div>
        <div className="topbar-right">
          <span className="local">
            <span className="status-led green" /> Runs locally
          </span>
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
      </header>
      {track ? <Workspace track={track} /> : <Launcher onEnter={setTrack} />}
    </main>
  );
}
