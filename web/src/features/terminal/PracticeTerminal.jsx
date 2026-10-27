import { useEffect, useRef, useState } from "react";
import "./PracticeTerminal.scss";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { terminalTheme } from "./terminalTheme.js";

const STATUS_LABEL = {
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Disconnected",
};

/**
 * Why the socket closed, from its close code. The server closes with 1000 when the shell
 * itself ends (`exit`, logout), 1001 when featherlab shuts down, and 1011 when no shell
 * could be started; anything else (typically 1006) is a dropped connection.
 */
function disconnectMessage(code) {
  if (code === 1000) return "the shell exited";
  if (code === 1001) return "featherlab was stopped or restarted";
  if (code === 1011) return "the workstation shell could not be started";
  return "the connection was lost";
}

function MaximizeIcon({ restore }) {
  // Outward corners = maximize; inward corners = restore.
  const d = restore
    ? "M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4"
    : "M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4";
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The learner's shell. It is deliberately independent of the selected exercise: it mounts
 * once per workspace, so switching exercises never drops the session or its scrollback.
 * Terminal output is written straight to xterm, never routed through React state.
 */
export function PracticeTerminal({ focused = false, onToggleFocus }) {
  const container = useRef(null);
  const [status, setStatus] = useState("connecting");
  // Bumping `session` tears this connection down and opens a fresh shell.
  const [session, setSession] = useState(0);

  useEffect(() => {
    // No `convertEol`: the PTY already turns LF into CRLF for normal output, and full-screen
    // programs (vim, less, top) emit a bare LF to mean "cursor down" without returning to
    // column 0 — rewriting it would misplace their output.
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
      fontSize: 14,
      lineHeight: 1.3,
      theme: terminalTheme(),
      scrollback: 5000,
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

    // Size invariant: the PTY's rows×cols must equal xterm's grid, or full-screen programs
    // (vim, less, top) draw for the wrong size. The grid is refitted whenever its box or
    // cell metrics can change — the host resizing (window, split drag, maximize, sidebar,
    // a hidden mobile tab being shown), browser zoom (a window resize that may not change
    // the host box), and the web font finishing loading. Each fit is coalesced to one per
    // animation frame. The size is sent when the socket opens and afterwards only when the
    // grid actually changes (`onResize`), never twice in a row, so there is no feedback
    // loop; the server holds a size that arrives before its shell is ready (see
    // src/api/terminal.mjs).
    let sentSize = "";
    const sendSize = () => {
      const size = `${terminal.cols}x${terminal.rows}`;
      if (size === sentSize || socket.readyState !== WebSocket.OPEN) return;
      sentSize = size;
      socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
    };
    let rafId = 0;
    let disposed = false; // fonts.ready can settle after teardown
    const refit = () => {
      if (rafId || disposed) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        // A hidden host (inactive mobile tab) measures 0; fitting it would collapse the grid.
        if (!container.current || !container.current.clientWidth) return;
        fit.fit();
      });
    };
    const observer = new ResizeObserver(refit);
    observer.observe(container.current);
    window.addEventListener("resize", refit);
    document.fonts?.ready.then(refit);
    const resizeDisposable = terminal.onResize(sendSize);

    socket.onopen = () => {
      terminal.clear();
      setStatus("connected");
      // Fit synchronously so the very first size reported is the real one, not xterm's 80×24.
      if (container.current?.clientWidth) fit.fit();
      sendSize();
      terminal.focus();
    };
    socket.onmessage = (event) =>
      terminal.write(typeof event.data === "string" ? event.data : new Uint8Array(event.data));
    socket.onclose = (event) => {
      setStatus("disconnected");
      terminal.write(
        `\r\n[Terminal disconnected: ${disconnectMessage(event.code)}. Use Reconnect to open a new shell.]\r\n`,
      );
    };
    const disposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "input", data }));
    });

    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("resize", refit);
      resizeDisposable.dispose();
      disposable.dispose();
      // A deliberate teardown (reconnect/unmount) must not look like a dropped connection.
      socket.onclose = null;
      socket.close();
      terminal.dispose();
    };
  }, [session]);

  const connected = status === "connected";

  return (
    <section
      className={`terminal-shell ${focused ? "is-focused" : ""}`}
      aria-label="Practice terminal"
    >
      <div className="terminal-bar">
        <div className="terminal-bar-left">
          <span className="terminal-title" role="status">
            <span
              className={`status-led ${connected ? "green" : ""} status-${status}`}
              data-testid="terminal-connection-status"
              data-connected={String(connected)}
              aria-hidden="true"
            />
            Linux workstation
            <span className="terminal-status-text">· {STATUS_LABEL[status]}</span>
          </span>
        </div>
        <div className="terminal-bar-right">
          {status === "disconnected" && (
            <button
              type="button"
              className="terminal-reconnect"
              onClick={() => {
                setStatus("connecting");
                setSession((current) => current + 1);
              }}
            >
              Reconnect
            </button>
          )}
          <span className="terminal-hint">bash · kubectl</span>
          {onToggleFocus && (
            <button
              type="button"
              className="terminal-focus-toggle"
              onClick={onToggleFocus}
              aria-pressed={focused}
              aria-label={focused ? "Restore layout" : "Maximize terminal"}
              title={focused ? "Restore layout" : "Maximize terminal"}
            >
              <MaximizeIcon restore={focused} />
            </button>
          )}
        </div>
      </div>
      <div ref={container} className="terminal-host" />
    </section>
  );
}
