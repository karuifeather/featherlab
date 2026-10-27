import Docker from "dockerode";
import { WebSocketServer } from "ws";
import { DEFAULT_WORKSTATION } from "../infrastructure/environment.mjs";
import { hostAllowed, originAllowed } from "./http.mjs";

const MAX_SESSIONS = 8;

/**
 * Browser terminal: a WebSocket bridged to an interactive `docker exec` in the learner
 * workstation. This is the learner's channel, separate from the application's management
 * runner. The shell runs as the unprivileged `learner` user inside the container; the host
 * shell is never exposed. The command, user and container are fixed here: nothing the
 * browser sends selects them.
 */
export function attachTerminal(
  server,
  { getPort, workstation = DEFAULT_WORKSTATION, docker = new Docker() } = {},
) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const allowed =
      req.url === "/ws/terminal" &&
      hostAllowed(req, getPort()) &&
      originAllowed(req, getPort()) &&
      wss.clients.size < MAX_SESSIONS;
    if (!allowed) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
  wss.on("connection", async (ws) => {
    let exec;
    let stream;
    // Registered first so a browser that disconnects while the exec is starting is cleaned up.
    ws.on("close", () => stream?.destroy());

    // Terminal size invariant: the PTY must always end up at the last size the browser
    // reported. The browser sends its fitted size the instant the socket opens, which is
    // before the exec below exists, so the message listener is attached synchronously and
    // early messages are held, not dropped. (Dropping that first resize left the PTY at
    // 0x0 — `stty size` said "0 0" — and vim fell back to terminfo's 24 rows, leaving the
    // rest of the panel empty until some unrelated layout change happened to resize it.)
    let wanted = null; // latest {w, h} the browser asked for
    let applied = ""; // "WxH" the PTY was last set to, so repeats cost no Docker call
    let retryOnOutput = false;
    let resizing = false;
    const earlyInput = [];
    // Single-flight: one Docker resize at a time, because the daemon does not promise to
    // apply concurrent requests in order. Sizes that arrive meanwhile only update `wanted`;
    // when the in-flight call finishes it catches up to the latest one.
    const applySize = async () => {
      if (!wanted || !stream || resizing) return;
      const key = `${wanted.w}x${wanted.h}`;
      if (key === applied) return;
      applied = key;
      resizing = true;
      try {
        await exec.resize({ ...wanted });
      } catch (error) {
        // A resize can race the process start. Output proves the shell is running, so the
        // next chunk retries (as does the next resize message) — no timer guesses.
        applied = "";
        retryOnOutput = true;
        throw error;
      } finally {
        resizing = false;
      }
      await applySize();
    };
    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "input" && typeof msg.data === "string" && msg.data.length < 65536) {
          if (stream) stream.write(msg.data);
          else earlyInput.push(msg.data);
        }
        if (
          msg.type === "resize" &&
          Number.isInteger(msg.cols) &&
          Number.isInteger(msg.rows) &&
          msg.cols > 0 &&
          msg.rows > 0 &&
          msg.cols <= 500 &&
          msg.rows <= 500
        ) {
          wanted = { w: msg.cols, h: msg.rows };
          await applySize();
        }
      } catch (error) {
        console.error("Terminal event:", error.message);
      }
    });

    try {
      exec = await docker.getContainer(workstation).exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: ["/bin/bash", "-l"],
        User: "learner",
        WorkingDir: "/home/learner",
        Env: ["TERM=xterm-256color"],
      });
      // `Tty: true` must be repeated on start. The daemon decides between a raw stream and
      // its multiplexed stdout/stderr framing from the *start* request, not from the exec
      // config above. Without it every chunk arrives behind an 8-byte header
      // (01 00 00 00 + big-endian length), and xterm prints the length byte whenever it is
      // printable: an 86-byte prompt frame shows as a stray "V", an 80-byte `ls` row as "P".
      // `ConsoleSize` ([rows, cols]) sizes the PTY at creation when the browser's size is
      // already known, so the shell never starts at 0x0; daemons that ignore it are covered
      // by the explicit resize right after.
      stream = await exec.start({
        hijack: true,
        stdin: true,
        Tty: true,
        ...(wanted ? { ConsoleSize: [wanted.h, wanted.w] } : {}),
      });
      if (ws.readyState !== 1) return stream.destroy();
      stream.on("data", (buf) => {
        if (retryOnOutput) {
          retryOnOutput = false;
          applySize().catch(() => {}); // re-arms itself on failure
        }
        if (ws.readyState === 1) ws.send(buf, { binary: true });
      });
      await applySize().catch(() => {});
      for (const data of earlyInput.splice(0)) stream.write(data);
      stream.on("error", (e) => {
        if (ws.readyState === 1) ws.send(`\r\nTerminal error: ${e.message}\r\n`);
      });
      // Close codes tell the browser why the session ended (see PracticeTerminal):
      // 1000 = the shell exited, 1011 = no shell could be started, 1001 = shutdown.
      stream.on("end", () => ws.close(1000, "Shell exited"));
    } catch (error) {
      console.error("Terminal could not start:", error.message);
      if (ws.readyState === 1) {
        ws.send("\r\nCould not open the terminal. Is the practice workstation running?\r\n");
        ws.close(1011, "Terminal unavailable");
      }
    }
  });

  return {
    /**
     * Gracefully close all active WebSocket terminal sessions, then shut down the WSS.
     * Sends close frames and waits up to 2 seconds before force-terminating stragglers.
     */
    closeSessions() {
      return new Promise((resolve) => {
        const clients = [...wss.clients];
        if (clients.length === 0) {
          wss.close(resolve);
          return;
        }
        let remaining = clients.length;
        const timeout = setTimeout(() => {
          for (const ws of wss.clients) ws.terminate();
          wss.close(resolve);
        }, 2000);
        for (const ws of clients) {
          ws.once("close", () => {
            remaining--;
            if (remaining === 0) {
              clearTimeout(timeout);
              wss.close(resolve);
            }
          });
          ws.close(1001, "Server shutting down");
        }
      });
    },
  };
}
