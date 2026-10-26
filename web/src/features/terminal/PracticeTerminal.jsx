import { useEffect, useRef, useState } from "react";
import "./PracticeTerminal.scss";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

const STATUS_LABEL = {
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Disconnected",
};

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
    const styles = getComputedStyle(document.documentElement);
    const token = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
      fontSize: 14,
      lineHeight: 1.35,
      letterSpacing: 0.2,
      theme: {
        background: token("--terminal-bg", "#0b1211"),
        foreground: token("--terminal-fg", "#d6e4e0"),
        cursor: token("--terminal-cursor", "#83c0bb"),
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

    // Resizing is coalesced to one fit per animation frame so a pane drag stays smooth
    // and never floods the socket with resize messages.
    let rafId = 0;
    const onResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (!container.current || !container.current.clientWidth) return;
        fit.fit();
        if (socket.readyState === WebSocket.OPEN)
          socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
      });
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(container.current);

    socket.onopen = () => {
      terminal.clear();
      setStatus("connected");
      onResize();
      terminal.focus();
    };
    socket.onmessage = (event) =>
      terminal.write(typeof event.data === "string" ? event.data : new Uint8Array(event.data));
    socket.onclose = () => {
      setStatus("disconnected");
      terminal.write("\r\n[Terminal disconnected. Use Reconnect to open a new shell.]\r\n");
    };
    const disposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "input", data }));
    });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
      disposable.dispose();
      // A deliberate teardown (reconnect/unmount) must not look like a dropped connection.
      socket.onclose = null;
      socket.close();
      terminal.dispose();
    };
  }, [session]);

  const connected = status === "connected";

  return (
    <section className={`terminal-shell ${focused ? "is-focused" : ""}`}>
      <div className="terminal-bar">
        <div className="terminal-bar-left">
          <span className="terminal-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="terminal-title">
            <span
              className={`status-led ${connected ? "green" : ""} status-${status}`}
              data-testid="terminal-connection-status"
              data-connected={String(connected)}
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
              {focused ? "⤡" : "⤢"}
            </button>
          )}
        </div>
      </div>
      <div ref={container} className="terminal" />
    </section>
  );
}
