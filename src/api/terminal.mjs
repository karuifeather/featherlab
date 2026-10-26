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
    let stream;
    // Registered first so a browser that disconnects while the exec is starting is cleaned up.
    ws.on("close", () => stream?.destroy());
    try {
      const exec = await docker.getContainer(workstation).exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: ["/bin/bash", "-l"],
        User: "learner",
        WorkingDir: "/home/learner",
        Env: ["TERM=xterm-256color"],
      });
      stream = await exec.start({ hijack: true, stdin: true });
      if (ws.readyState !== 1) return stream.destroy();
      stream.on("data", (buf) => {
        if (ws.readyState === 1) ws.send(buf, { binary: true });
      });
      stream.on("error", (e) => {
        if (ws.readyState === 1) ws.send(`\r\nTerminal error: ${e.message}\r\n`);
      });
      stream.on("end", () => ws.close());
      ws.on("message", async (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "input" && typeof msg.data === "string" && msg.data.length < 65536)
            stream.write(msg.data);
          if (
            msg.type === "resize" &&
            Number.isInteger(msg.cols) &&
            Number.isInteger(msg.rows) &&
            msg.cols > 0 &&
            msg.rows > 0 &&
            msg.cols <= 500 &&
            msg.rows <= 500
          )
            await exec.resize({ w: msg.cols, h: msg.rows });
        } catch (error) {
          console.error("Terminal event:", error.message);
        }
      });
    } catch (error) {
      console.error("Terminal could not start:", error.message);
      if (ws.readyState === 1) {
        ws.send("\r\nCould not open the terminal. Is the practice workstation running?\r\n");
        ws.close();
      }
    }
  });
}
