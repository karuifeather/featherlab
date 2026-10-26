import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Docker from "dockerode";
import { WebSocketServer } from "ws";
import { WORKSTATION, resetExercise } from "./lib/runtime.mjs";
import { gradePod, TASK } from "./lib/result.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/web");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
const docker = new Docker();

async function inspectPod() {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      [
        "exec",
        WORKSTATION,
        "kubectl",
        "-n",
        TASK.namespace,
        "get",
        "pod",
        TASK.name,
        "-o",
        "json",
        "--request-timeout=8s",
      ],
      { timeout: 12000, maxBuffer: 2_000_000 },
    );
    return JSON.parse(stdout);
  } catch (error) {
    if (/NotFound|not found/i.test(`${error.stderr} ${error.message}`)) return null;
    throw error;
  }
}

function reply(res, code, data) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}

function originAllowed(req, port) {
  const origin = req.headers.origin;
  return !origin || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

async function staticFile(req, res) {
  const url = new URL(req.url, "http://localhost");
  // Convert pathname to a safe relative path; never allow traversal beyond bundled web assets.
  const realFile = url.pathname.startsWith("/assets/")
    ? path.join(root, url.pathname.slice(1))
    : path.join(root, "index.html");
  if (!realFile.startsWith(root + path.sep)) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const info = await stat(realFile);
    if (!info.isFile()) throw new Error("Not a file");
    res.writeHead(200, {
      "Content-Type": mime[path.extname(realFile)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(await readFile(realFile));
  } catch {
    res.writeHead(404);
    res.end("Web UI missing. Run npm run build before launching.");
  }
}

export async function startServer(port = 4317) {
  const allowedPort = Number(port);
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/api/status" && req.method === "GET")
        return reply(res, 200, {
          ready: true,
          cluster: "featherlab",
          track: "kubernetes",
          exercise: TASK,
        });
      if (req.url === "/api/check" && req.method === "POST") {
        if (!originAllowed(req, allowedPort)) return reply(res, 403, { error: "Forbidden origin" });
        return reply(res, 200, gradePod(await inspectPod()));
      }
      if (req.url === "/api/reset" && req.method === "POST") {
        if (!originAllowed(req, allowedPort)) return reply(res, 403, { error: "Forbidden origin" });
        resetExercise();
        return reply(res, 200, { reset: true });
      }
      if (req.method === "GET") return await staticFile(req, res);
      reply(res, 405, { error: "Method not allowed" });
    } catch (error) {
      console.error(error);
      reply(res, 500, { error: error.message });
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    if (req.url !== "/ws/terminal" || !originAllowed(req, allowedPort)) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
  wss.on("connection", async (ws) => {
    let stream;
    try {
      const instance = docker.getContainer(WORKSTATION);
      const exec = await instance.exec({
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
      if (ws.readyState === 1) {
        ws.send(`\r\nCould not open terminal: ${error.message}\r\n`);
        ws.close();
      }
    }
    ws.on("close", () => stream?.destroy());
  });
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(allowedPort, "127.0.0.1", resolve),
  );
  return {
    port: allowedPort,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
