import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { WebSocket } from "ws";
import { createApp } from "../../src/app.mjs";
import { startServer } from "../../src/server.mjs";
import { createFakeCluster } from "../helpers/fake-cluster.mjs";

const quiet = { warn() {}, error() {} };

// Sized to reproduce the reported glitch: Docker's multiplexed frame header ends with the
// payload length, and 86 = "V", 80 = "P" — the stray letters seen before the prompt and `bin`.
const PROMPT = "learner@workstation:~$ ".padEnd(86, " ");
const LS_ROW = "bin   dev  home  lib64  mnt  proc  run   srv  tmp  var".padEnd(78, " ") + "\r\n";

/**
 * A Docker double that mirrors the daemon rule behind the bug: whether exec output is a raw
 * TTY stream or stdcopy-multiplexed (8-byte header per chunk) is decided by the *start*
 * request's `Tty`, not by the exec's create options.
 */
function daemonLikeDocker({ chunks = [PROMPT, LS_ROW], endAfter = false } = {}) {
  const starts = [];
  const resizes = [];
  return {
    starts,
    resizes,
    getContainer: () => ({
      exec: async () => ({
        start: async (options) => {
          starts.push(options);
          const stream = new PassThrough();
          const frame = (text) => {
            const payload = Buffer.from(text);
            if (options.Tty) return payload;
            const header = Buffer.alloc(8);
            header[0] = 1; // stdout
            header.writeUInt32BE(payload.length, 4);
            return Buffer.concat([header, payload]);
          };
          setTimeout(() => {
            for (const chunk of chunks) stream.write(frame(chunk));
            if (endAfter) setTimeout(() => stream.end(), 20);
          }, 20);
          return stream;
        },
        resize: async (dims) => resizes.push(dims),
      }),
    }),
  };
}

let server;
// Close terminal sessions first: an open upgraded socket would keep server.close() pending.
afterEach(async () => {
  await server?.closeSessions();
  await server?.close();
});

async function serve(docker) {
  server = await startServer(0, {
    service: createApp({ runner: createFakeCluster(), logger: quiet }).service,
    workstation: "featherlab-test-unit-workstation",
    docker,
  });
  return server;
}

function open() {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/terminal`, {
    headers: { Origin: `http://127.0.0.1:${server.port}` },
  });
  const received = [];
  ws.on("message", (data) => received.push(Buffer.from(data)));
  const closed = new Promise((resolve) => ws.on("close", (code) => resolve(code)));
  return { ws, received, closed };
}

const until = async (predicate, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
};

test("terminal output reaches the browser byte-for-byte, with no stream-frame headers", async () => {
  const docker = daemonLikeDocker();
  await serve(docker);
  const { ws, received } = open();
  const expected = PROMPT + LS_ROW;
  await until(() => Buffer.concat(received).length >= expected.length);

  // The exec must be started in TTY mode, or the daemon multiplexes the stream.
  assert.equal(docker.starts[0].Tty, true);
  const text = Buffer.concat(received).toString("latin1");
  assert.equal(text, expected);
  assert.ok(text.startsWith("learner@"), "no stray length byte before the prompt");
  const bytes = [...Buffer.concat(received)];
  assert.ok(
    bytes.every((b) => b > 8),
    "no frame-header control bytes",
  );
  ws.close();
});

test("resize messages are forwarded to the exec", async () => {
  const docker = daemonLikeDocker();
  await serve(docker);
  const { ws, received } = open();
  await until(() => received.length > 0);
  ws.send(JSON.stringify({ type: "resize", cols: 132, rows: 40 }));
  await until(() => docker.resizes.length > 0);
  assert.deepEqual(docker.resizes[0], { w: 132, h: 40 });
  ws.close();
});

// Regression for vim using only part of the panel: the browser sends its size the moment the
// socket opens, while the exec is still being created. That resize used to be dropped,
// leaving the PTY at 0x0 (vim then assumes 24 rows).
test("a size and input sent before the shell is ready are applied once it starts", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const docker = daemonLikeDocker();
  const written = [];
  const realExec = docker.getContainer().exec;
  docker.getContainer = () => ({
    exec: async (options) => {
      await gate;
      const exec = await realExec(options);
      const start = exec.start;
      exec.start = async (opts) => {
        const stream = await start(opts);
        stream.on("data", () => {});
        const write = stream.write.bind(stream);
        stream.write = (data) => (written.push(String(data)), write(data));
        return stream;
      };
      return exec;
    },
  });
  await serve(docker);
  const { ws } = open();
  await new Promise((resolve) => ws.on("open", resolve));
  ws.send(JSON.stringify({ type: "resize", cols: 120, rows: 30 }));
  ws.send(JSON.stringify({ type: "resize", cols: 150, rows: 45 }));
  ws.send(JSON.stringify({ type: "input", data: "vim\r" }));
  await new Promise((r) => setTimeout(r, 50));
  release();
  await until(() => docker.resizes.length > 0 && written.length > 0);

  // Only the latest size matters, and it also sizes the PTY at creation.
  assert.deepEqual(docker.resizes, [{ w: 150, h: 45 }]);
  assert.deepEqual(docker.starts[0].ConsoleSize, [45, 150]);
  assert.deepEqual(written, ["vim\r"]);
  ws.close();
});

test("a repeated size causes no extra Docker resize", async () => {
  const docker = daemonLikeDocker();
  await serve(docker);
  const { ws, received } = open();
  await until(() => received.length > 0);
  for (const size of [
    [100, 30],
    [100, 30],
    [110, 30],
  ])
    ws.send(JSON.stringify({ type: "resize", cols: size[0], rows: size[1] }));
  await until(() => docker.resizes.length >= 2);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(docker.resizes, [
    { w: 100, h: 30 },
    { w: 110, h: 30 },
  ]);
  ws.close();
});

test("resizes are applied one at a time and end at the latest size", async () => {
  const docker = daemonLikeDocker();
  const getContainer = docker.getContainer;
  let inFlight = 0;
  let maxInFlight = 0;
  const pending = [];
  docker.getContainer = () => {
    const container = getContainer();
    return {
      exec: async (options) => {
        const exec = await container.exec(options);
        const resize = exec.resize;
        exec.resize = async (dims) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => pending.push(resolve));
          inFlight--;
          return resize(dims);
        };
        return exec;
      },
    };
  };
  await serve(docker);
  const { ws, received } = open();
  await until(() => received.length > 0);
  for (const cols of [100, 110, 120]) ws.send(JSON.stringify({ type: "resize", cols, rows: 40 }));
  // Release held resizes one by one until none are left.
  await until(() => pending.length > 0);
  while (pending.length) {
    pending.shift()();
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(maxInFlight, 1);
  assert.deepEqual(docker.resizes.at(-1), { w: 120, h: 40 });
  assert.ok(docker.resizes.length <= 2, "intermediate sizes are skipped, not queued");
  ws.close();
});

test("a resize that races the process start is retried on the first output", async () => {
  const docker = daemonLikeDocker();
  const getContainer = docker.getContainer;
  let failures = 1;
  docker.getContainer = () => {
    const container = getContainer();
    return {
      exec: async (options) => {
        const exec = await container.exec(options);
        const resize = exec.resize;
        exec.resize = async (dims) => {
          if (failures-- > 0) throw new Error("exec is not running");
          return resize(dims);
        };
        return exec;
      },
    };
  };
  await serve(docker);
  const { ws } = open();
  ws.on("open", () => ws.send(JSON.stringify({ type: "resize", cols: 90, rows: 33 })));
  await until(() => docker.resizes.length > 0);
  assert.deepEqual(docker.resizes, [{ w: 90, h: 33 }]);
  ws.close();
});

test("a shell that exits closes the socket with 1000 so the UI can say why", async () => {
  await serve(daemonLikeDocker({ endAfter: true }));
  const { closed } = open();
  assert.equal(await closed, 1000);
});

test("a shell that cannot start closes the socket with 1011", async () => {
  await serve({
    getContainer: () => ({
      exec: async () => {
        throw new Error("fake docker: no shell available");
      },
    }),
  });
  const { closed, received } = open();
  assert.equal(await closed, 1011);
  assert.match(Buffer.concat(received).toString(), /Could not open the terminal/);
});
