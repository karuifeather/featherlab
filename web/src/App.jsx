import { useState } from "react";
import { Launcher } from "./components/Launcher.jsx";
import { Workspace } from "./features/workspace/Workspace.jsx";

export function App() {
  const [track, setTrack] = useState(null);
  return (
    <main className="app">
      <header className="topbar">
        <button className="logo" onClick={() => setTrack(null)}>
          <span className="brand-icon">✦</span> featherlab
        </button>
        <span className="local">
          <span className="status-led green" /> Runs locally
        </span>
      </header>
      {track ? <Workspace track={track} /> : <Launcher onEnter={setTrack} />}
    </main>
  );
}
