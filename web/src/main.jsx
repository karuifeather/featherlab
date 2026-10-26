import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import "./style.css";

function PracticeTerminal() {
  const container = useRef(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      theme: {
        background: "#10141b",
        foreground: "#dbe4ef",
        cursor: "#a5c9ff",
      },
      scrollback: 5000,
      convertEol: true,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container.current);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch {
      /* Use the built-in renderer when WebGL2 is unavailable. */
    }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${proto}//${location.host}/ws/terminal`);
    socket.binaryType = "arraybuffer";
    terminal.write("Connecting to local workstation...\r\n");
    const onResize = () => {
      if (!container.current || !container.current.clientWidth) return;
      fit.fit();
      if (socket.readyState === WebSocket.OPEN)
        socket.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        );
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(container.current);
    socket.onopen = () => {
      terminal.clear();
      setConnected(true);
      onResize();
      terminal.focus();
    };
    socket.onmessage = (event) =>
      terminal.write(typeof event.data === "string" ? event.data : new Uint8Array(event.data));
    socket.onclose = () => {
      setConnected(false);
      terminal.write("\r\n[Terminal disconnected. Refresh to reconnect.]\r\n");
    };
    const disposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "input", data }));
    });
    return () => {
      observer.disconnect();
      disposable.dispose();
      socket.close();
      terminal.dispose();
    };
  }, []);
  return (
    <section className="terminal-shell">
      <div className="terminal-bar">
        <span>
          <span className={`status-led ${connected ? "green" : ""}`} /> Linux workstation
        </span>
        <span>bash · kubectl</span>
      </div>
      <div ref={container} className="terminal" />
    </section>
  );
}

function App() {
  const [session, setSession] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [hint, setHint] = useState(false);

  async function action(path, setter, callback) {
    setter(true);
    setError("");
    try {
      const response = await fetch(path, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      callback(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setter(false);
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <button className="logo" onClick={() => setSession(false)}>
          <span className="brand-icon">✦</span> featherlab
        </button>
        <span className="local">
          <span className="status-led green" /> Runs locally
        </span>
      </header>
      {!session ? (
        <div className="launcher">
          <div className="eyebrow">YOUR LOCAL PRACTICE LAB</div>
          <h1>
            Build the skills.
            <br />
            <em>Prove them in the terminal.</em>
          </h1>
          <p>
            Real Kubernetes, practical exercises, no cloud account. Pick a track to get started.
          </p>
          <div className="tracks">
            <button className="track" onClick={() => setSession(true)}>
              <div className="track-icon">☸</div>
              <h2>Kubernetes</h2>
              <p>CKA / CKS learning, practice and troubleshooting.</p>
              <span className="track-link">Enter workspace →</span>
            </button>
            <div className="track disabled">
              <div className="track-icon">▤</div>
              <h2>PostgreSQL</h2>
              <p>SQL, administration, optimization and diagnostics.</p>
              <span className="muted">Planned for later</span>
            </div>
          </div>
          <footer>No signup · No tracking · Data stays on your machine</footer>
        </div>
      ) : (
        <div className="workspace">
          <aside className="sidebar">
            <div className="sidebar-head">
              KUBERNETES <span className="tiny-chip">CKA</span>
            </div>
            <div className="level active">
              <span>▾</span> Level 0 · Basics
            </div>
            <button className="lesson selected">
              01 <span>Your first Pod</span>
            </button>
            <button className="lesson" disabled>
              02 <span>Coming soon</span>
            </button>
            <div className="locked">▸ 🔒 Level 1 · Workloads</div>
            <div className="locked">▸ 🔒 Level 2 · Networking</div>
            <div className="locked">▸ 🔒 Level 3 · Storage</div>
            <div className="sidebar-bottom">☸ kind · isolated cluster</div>
          </aside>
          <div className="problem">
            <div className="crumb">Level 0 / Exercise 01</div>
            <div className="problem-header">
              <h1>Your first Pod</h1>
              <span className="difficulty">Beginner</span>
            </div>
            <p>
              Use the terminal to create a Pod in the <code>default</code> namespace.
            </p>
            <div className="requirements">
              <h3>Requirements</h3>
              <ul>
                <li>
                  Pod name: <code>web</code>
                </li>
                <li>
                  Container image: <code>nginx:1.27</code>
                </li>
                <li>
                  The Pod must be <code>Running</code> and <code>Ready</code>.
                </li>
              </ul>
            </div>
            <p className="note">
              There is no single required command. featherlab grades the resulting Kubernetes
              resources.
            </p>
            <button className="hint-button" onClick={() => setHint(!hint)}>
              ◈ {hint ? "Hide hint" : "Need a hint?"}
            </button>
            {hint && (
              <p className="hint">
                Try <code>kubectl run --help</code> to see how to create a single Pod using an
                image.
              </p>
            )}
            {result && (
              <section className="results">
                <h3>
                  {result.success ? "✓ Passed" : `${result.passed}/${result.total} checks passed`}
                </h3>
                {result.checks.map((c) => (
                  <div className="check" key={c.id}>
                    <span className={c.pass ? "passed" : "failed"}>{c.pass ? "✓" : "○"}</span>
                    {c.label}
                  </div>
                ))}
              </section>
            )}
            {error && <div className="error">{error}</div>}
            <div className="problem-actions">
              <button
                className="check-btn"
                disabled={checking}
                onClick={() => action("/api/check", setChecking, setResult)}
              >
                {checking ? "Checking…" : "Check solution"}
              </button>
              <button
                className="reset-btn"
                disabled={resetting}
                onClick={() => action("/api/reset", setResetting, () => setResult(null))}
              >
                {resetting ? "Resetting…" : "Reset task"}
              </button>
            </div>
          </div>
          <PracticeTerminal />
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
