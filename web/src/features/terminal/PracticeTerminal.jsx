import { useEffect, useRef, useState } from "react";
import "./PracticeTerminal.scss";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

/**
 * The learner's shell. It is deliberately independent of the selected exercise: it mounts
 * once per workspace, so switching exercises never drops the session or its scrollback.
 */
export function PracticeTerminal() {
  const container = useRef(null);
  const [connected, setConnected] = useState(false);
  // Bumping `session` tears this connection down and opens a fresh shell.
  const [session, setSession] = useState(0);
  const [closed, setClosed] = useState(false);
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
      setClosed(true);
      terminal.write("\r\n[Terminal disconnected. Use Reconnect to open a new shell.]\r\n");
    };
    const disposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "input", data }));
    });
    return () => {
      observer.disconnect();
      disposable.dispose();
      // A deliberate teardown (reconnect/unmount) must not look like a dropped connection.
      socket.onclose = null;
      socket.close();
      terminal.dispose();
    };
  }, [session]);
  return (
    <section className="terminal-shell">
      <div className="terminal-bar">
        <span>
          <span
            className={`status-led ${connected ? "green" : ""}`}
            data-testid="terminal-connection-status"
            data-connected={String(connected)}
          />{" "}
          Linux workstation
        </span>
        <span>
          {closed && (
            <button
              className="terminal-reconnect"
              onClick={() => {
                setClosed(false);
                setSession((current) => current + 1);
              }}
            >
              Reconnect
            </button>
          )}{" "}
          bash · kubectl
        </span>
      </div>
      <div ref={container} className="terminal" />
    </section>
  );
}
