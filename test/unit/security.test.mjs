import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebSocket } from "ws";
import { createApp } from "../../src/app.mjs";
import { startServer } from "../../src/server.mjs";
import { createFakeCluster } from "../helpers/fake-cluster.mjs";

const quiet = { warn() {}, error() {} };

/** A docker double that records which container and command the terminal asked for. */
function fakeDocker() {
  const calls = [];
  return {
    calls,
    getContainer: (name) => ({
      exec: async (options) => {
        calls.push({ container: name, ...options });
        throw new Error("fake docker: no shell available");
      },
    }),
  };
}

let server;
let docker;

before(async () => {
  docker = fakeDocker();
  server = await startServer(0, {
    service: createApp({ runner: createFakeCluster(), logger: quiet }).service,
    workstation: "featherlab-test-unit-workstation",
    docker,
  });
});
after(() => server.close());

/** fetch() cannot set Host, so use http.request to forge it. */
function request(path, headers, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: server.port, path, method, headers },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test("a rebinding Host header is refused for API, static and POST requests", async () => {
  for (const host of ["evil.example", `evil.example:${server.port}`, "127.0.0.1", "0.0.0.0:80"]) {
    for (const path of ["/api/status", "/api/exercises", "/", "/assets/x.js"]) {
      const { status, body } = await request(path, { Host: host });
      assert.equal(status, 403, `${host} ${path}`);
      assert.equal(JSON.parse(body).code, "FORBIDDEN_HOST");
    }
    assert.equal(
      (await request("/api/exercises/k8s-0001/check", { Host: host }, "POST")).status,
      403,
    );
  }
});

test("loopback Host headers are accepted", async () => {
  for (const host of [`127.0.0.1:${server.port}`, `localhost:${server.port}`]) {
    assert.equal((await request("/api/status", { Host: host })).status, 200);
  }
});

function connect(headers) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/terminal`, { headers });
    // The server may speak before "open" is observed here, so capture the first message now.
    const first = new Promise((done) => ws.once("message", (m) => done(m.toString())));
    ws.on("open", () => resolve({ opened: true, ws, first }));
    ws.on("unexpected-response", () => resolve({ opened: false }));
    ws.on("error", () => resolve({ opened: false }));
  });
}

test("terminal upgrades are refused for foreign Host or Origin, and open no shell", async () => {
  const before = docker.calls.length;
  for (const headers of [
    { Host: "evil.example" },
    { Origin: "http://evil.example" },
    { Origin: "http://evil.example", Host: `127.0.0.1:${server.port}` },
  ]) {
    const result = await connect(headers);
    assert.equal(result.opened, false, JSON.stringify(headers));
  }
  assert.equal(docker.calls.length, before, "a refused upgrade must not reach docker");
});

test("the terminal only ever execs a fixed login shell as `learner` in the configured workstation", async () => {
  const { opened, ws, first } = await connect({ Origin: `http://127.0.0.1:${server.port}` });
  assert.equal(opened, true);
  const message = await first;
  // The browser cannot choose the container, command or user, and Docker errors stay private.
  assert.match(message, /Could not open the terminal/);
  assert.doesNotMatch(message, /fake docker/);
  const call = docker.calls.at(-1);
  assert.equal(call.container, "featherlab-test-unit-workstation");
  assert.equal(call.User, "learner");
  assert.deepEqual(call.Cmd, ["/bin/bash", "-l"]);
  ws.close();
});
