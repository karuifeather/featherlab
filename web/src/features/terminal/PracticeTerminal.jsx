import { useCallback, useEffect, useRef, useState } from "react";
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

const FONT_MIN = 10;
const FONT_MAX = 24;
const FONT_DEFAULT = 14;
const MAX_TABS = 8;

function disconnectMessage(code) {
  if (code === 1000) return "the shell exited";
  if (code === 1001) return "featherlab was stopped or restarted";
  if (code === 1011) return "the workstation shell could not be started";
  return "the connection was lost";
}

function MaximizeIcon({ restore }) {
  const d = restore
    ? "M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4"
    : "M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4";
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect
        x="5.5"
        y="5.5"
        width="8"
        height="8"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M10.5 3v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1H4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Copies the terminal's selection; resolves to whether anything reached the clipboard.
 * Must be called from inside the mouseup that ended the selection: the async API needs that
 * user activation, and the execCommand fallback (plain-http hosts, where navigator.clipboard
 * does not exist) only works inside the event handler. For the fallback, xterm's own `copy`
 * listener supplies the selected text.
 */
function copySelection(terminal) {
  const text = terminal.getSelection();
  if (!text) return Promise.resolve(false);
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  }
  try {
    return Promise.resolve(document.execCommand("copy"));
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * One xterm instance with its own WebSocket shell. Always mounted; hidden via CSS when
 * the tab is not active so the shell and its scrollback survive tab switching.
 *
 * fontSize must NOT be a dep of the session effect — font changes apply via a separate
 * effect so they never tear down and re-open the WebSocket.
 */
function TerminalSession({ epoch, active, fontSize, onStatus, onCopied }) {
  const container = useRef(null);
  // Stable refs hold the current session's terminal and fit addon so the font effect can
  // reach them without taking a dep on epoch.
  const termRef = useRef(null);
  const fitRef = useRef(null);
  // Ref for fontSize so the session effect reads the current value at run time
  // without taking fontSize as a dep (which would reconnect on every font change).
  const fontSizeRef = useRef(fontSize);
  useEffect(() => {
    fontSizeRef.current = fontSize;
  }, [fontSize]);

  // Session effect: creates the xterm instance and WebSocket shell. Runs only when epoch
  // changes (reconnect) — font size changes are intentionally excluded from deps.
  useEffect(() => {
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
      fontSize: fontSizeRef.current,
      lineHeight: 1.3,
      theme: terminalTheme(),
      scrollback: 5000,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container.current);
    termRef.current = terminal;
    fitRef.current = fit;
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch {
      /* fall back to built-in renderer */
    }

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${proto}//${location.host}/ws/terminal`);
    socket.binaryType = "arraybuffer";
    terminal.write("Connecting to local workstation...\r\n");

    let sentSize = "";
    const sendSize = () => {
      const size = `${terminal.cols}x${terminal.rows}`;
      if (size === sentSize || socket.readyState !== WebSocket.OPEN) return;
      sentSize = size;
      socket.send(JSON.stringify({ type: "resize", cols: terminal.cols, rows: terminal.rows }));
    };
    let rafId = 0;
    let disposed = false;
    const refit = () => {
      if (rafId || disposed) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
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
      onStatus("connected");
      if (container.current?.clientWidth) fit.fit();
      sendSize();
      terminal.focus();
    };
    socket.onmessage = (event) =>
      terminal.write(typeof event.data === "string" ? event.data : new Uint8Array(event.data));
    socket.onclose = (event) => {
      onStatus("disconnected");
      terminal.write(
        `\r\n[Terminal disconnected: ${disconnectMessage(event.code)}. Use Reconnect to open a new shell.]\r\n`,
      );
    };
    const inputDisposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "input", data }));
    });

    // Copy on select: a selection is copied as soon as the mouse is released, like a
    // desktop terminal. Not on xterm's onSelectionChange, which fires for every cell a drag
    // crosses. The mouseup is watched on the document because a drag often ends outside.
    const host = container.current;
    let selecting = false;
    const onMouseDown = (event) => {
      if (event.button === 0) selecting = true;
    };
    const onMouseUp = () => {
      if (!selecting) return;
      selecting = false;
      copySelection(terminal).then((copied) => {
        if (copied && !disposed) onCopied();
      });
    };
    host.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      disposed = true;
      host.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      termRef.current = null;
      fitRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("resize", refit);
      resizeDisposable.dispose();
      inputDisposable.dispose();
      socket.onclose = null;
      socket.close();
      terminal.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  // Font effect: applies fontSize changes without touching the WebSocket.
  // Only applies when active so xterm measures against a laid-out element.
  // Showing a tab fires the ResizeObserver which handles the refit there.
  useEffect(() => {
    if (!active || !termRef.current || !fitRef.current) return;
    termRef.current.options.fontSize = fontSize;
    fitRef.current.fit();
  }, [active, fontSize]);

  return (
    <div
      ref={container}
      className="terminal-host"
      style={active ? undefined : { display: "none" }}
      aria-hidden={!active}
    />
  );
}

/**
 * The learner's terminal panel. Supports multiple independent shell tabs, font size
 * controls (A−/A+), and a maximize toggle. All tab sessions stay mounted so their
 * shells and scrollback survive switching.
 */
export function PracticeTerminal({ focused = false, onToggleFocus }) {
  const nextId = useRef(2);
  const [tabs, setTabs] = useState([{ id: 1, epoch: 0 }]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [statusMap, setStatusMap] = useState({ 1: "connecting" });
  const [fontSize, setFontSize] = useState(() => {
    try {
      const stored = parseInt(localStorage.getItem("fl-terminal-font-size"), 10);
      return stored >= FONT_MIN && stored <= FONT_MAX ? stored : FONT_DEFAULT;
    } catch {
      return FONT_DEFAULT;
    }
  });

  const activeStatus = statusMap[activeTabId] ?? "connecting";
  const connected = activeStatus === "connected";

  const addTab = () => {
    if (tabs.length >= MAX_TABS) return;
    const id = nextId.current++;
    setTabs((prev) => [...prev, { id, epoch: 0 }]);
    setActiveTabId(id);
    setStatusMap((prev) => ({ ...prev, [id]: "connecting" }));
  };

  const closeTab = (id) => {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === id);
    setTabs((prev) => prev.filter((t) => t.id !== id));
    setActiveTabId((prev) => {
      if (prev !== id) return prev;
      return (tabs[idx - 1] ?? tabs[idx + 1]).id;
    });
    setStatusMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const reconnect = () => {
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, epoch: t.epoch + 1 } : t)));
    setStatusMap((prev) => ({ ...prev, [activeTabId]: "connecting" }));
  };

  const changeFontSize = (delta) => {
    setFontSize((prev) => {
      const next = Math.max(FONT_MIN, Math.min(FONT_MAX, prev + delta));
      try {
        localStorage.setItem("fl-terminal-font-size", String(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  // Bumped on every copy; keys the flash so a second copy restarts its animation.
  const [copyFlash, setCopyFlash] = useState(0);
  const handleCopied = useCallback(() => setCopyFlash((n) => n + 1), []);

  const handleStatus = useCallback((tabId, status) => {
    setStatusMap((prev) => ({ ...prev, [tabId]: status }));
  }, []);

  return (
    <section
      className={`terminal-shell ${focused ? "is-focused" : ""}`}
      aria-label="Practice terminal"
    >
      {/* Tab strip */}
      <div className="terminal-tabs" role="tablist" aria-label="Terminal tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`terminal-tab ${tab.id === activeTabId ? "is-active" : ""}`}
            onClick={() => setActiveTabId(tab.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveTabId(tab.id)}
            tabIndex={tab.id === activeTabId ? 0 : -1}
          >
            bash
            {tabs.length > 1 && (
              <button
                type="button"
                className="terminal-tab-close"
                aria-label={`Close tab ${tab.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {tabs.length < MAX_TABS && (
          <button
            type="button"
            className="terminal-tab-add"
            aria-label="New terminal"
            title="New terminal"
            onClick={addTab}
          >
            +
          </button>
        )}
      </div>

      {/* Status / control bar */}
      <div className="terminal-bar">
        <div className="terminal-bar-left">
          <span className="terminal-title" role="status">
            <span
              className={`status-led ${connected ? "green" : ""} status-${activeStatus}`}
              data-testid="terminal-connection-status"
              data-connected={String(connected)}
              aria-hidden="true"
            />
            Linux workstation
            <span className="terminal-status-text">· {STATUS_LABEL[activeStatus]}</span>
          </span>
        </div>
        <div className="terminal-bar-right">
          {activeStatus === "disconnected" && (
            <button type="button" className="terminal-reconnect" onClick={reconnect}>
              Reconnect
            </button>
          )}
          <div className="terminal-font-controls">
            <button
              type="button"
              className="terminal-font-btn"
              aria-label="Decrease font size"
              title="Decrease font size"
              onClick={() => changeFontSize(-1)}
              disabled={fontSize <= FONT_MIN}
            >
              A−
            </button>
            <button
              type="button"
              className="terminal-font-btn"
              aria-label="Increase font size"
              title="Increase font size"
              onClick={() => changeFontSize(1)}
              disabled={fontSize >= FONT_MAX}
            >
              A+
            </button>
          </div>
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

      {/* Terminal instances — all mounted, only the active one is visible */}
      {tabs.map((tab) => (
        <TerminalSession
          key={tab.id}
          epoch={tab.epoch}
          active={tab.id === activeTabId}
          fontSize={fontSize}
          onStatus={(status) => handleStatus(tab.id, status)}
          onCopied={handleCopied}
        />
      ))}

      {/* Copy-on-select confirmation. An overlay on the panel, not inside .terminal-host:
          FitAddon sizes the grid from that element. */}
      {copyFlash > 0 && (
        <span
          key={copyFlash}
          className="terminal-copy-flash"
          data-testid="terminal-copy-flash"
          onAnimationEnd={() => setCopyFlash(0)}
        >
          <CopyIcon />
        </span>
      )}
      <span className="sr-only" role="status">
        {copyFlash > 0 ? "Selection copied" : ""}
      </span>
    </section>
  );
}
