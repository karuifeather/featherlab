import test, { after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { checkForUpdate, readCachedUpdateInfo } from "../../src/lib/update-check.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Start a minimal HTTP server that responds with `body` (JSON) and `status`. */
function startRegistry({ status = 200, body }) {
  return new Promise((resolve) => {
    const server = http.createServer((_, res) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

const servers = [];
async function registry(opts) {
  const s = await startRegistry(opts);
  servers.push(s);
  return s;
}
after(async () => {
  for (const s of servers) await s.close();
});

function tmpDir() {
  return mkdtempSync(path.join(os.tmpdir(), "fl-uc-test-"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("returns isOutdated:true when registry version is higher", async () => {
  const reg = await registry({ body: { version: "9.9.9" } });
  const stateDir = tmpDir();
  process.env.FEATHERLAB_REGISTRY_URL = reg.url;
  try {
    const result = await checkForUpdate(stateDir, "0.1.0", { force: true });
    assert.deepEqual(result, { current: "0.1.0", latest: "9.9.9", isOutdated: true });
  } finally {
    delete process.env.FEATHERLAB_REGISTRY_URL;
  }
});

test("returns isOutdated:false when already on latest", async () => {
  const reg = await registry({ body: { version: "0.2.0" } });
  const stateDir = tmpDir();
  process.env.FEATHERLAB_REGISTRY_URL = reg.url;
  try {
    const result = await checkForUpdate(stateDir, "0.2.0", { force: true });
    assert.equal(result?.isOutdated, false);
  } finally {
    delete process.env.FEATHERLAB_REGISTRY_URL;
  }
});

test("returns null when registry returns 404 (package not yet published)", async () => {
  const reg = await registry({ status: 404, body: { error: "Not found" } });
  const stateDir = tmpDir();
  process.env.FEATHERLAB_REGISTRY_URL = reg.url;
  try {
    const result = await checkForUpdate(stateDir, "0.1.0", { force: true });
    assert.equal(result, null);
  } finally {
    delete process.env.FEATHERLAB_REGISTRY_URL;
  }
});

test("returns null when registry returns a non-semver version string", async () => {
  const reg = await registry({ body: { version: "not-a-version" } });
  const stateDir = tmpDir();
  process.env.FEATHERLAB_REGISTRY_URL = reg.url;
  try {
    const result = await checkForUpdate(stateDir, "0.1.0", { force: true });
    assert.equal(result, null);
  } finally {
    delete process.env.FEATHERLAB_REGISTRY_URL;
  }
});

test("returns null when registry response has no version field", async () => {
  const reg = await registry({ body: { name: "featherlab" } });
  const stateDir = tmpDir();
  process.env.FEATHERLAB_REGISTRY_URL = reg.url;
  try {
    const result = await checkForUpdate(stateDir, "0.1.0", { force: true });
    assert.equal(result, null);
  } finally {
    delete process.env.FEATHERLAB_REGISTRY_URL;
  }
});

test("cache hit: returns cached result without making a network request", async () => {
  const stateDir = tmpDir();
  writeFileSync(
    path.join(stateDir, "update-check.json"),
    JSON.stringify({ latest: "5.0.0", checkedAt: Date.now() }),
  );
  // Point at a port with no listener — a network call would fail immediately.
  process.env.FEATHERLAB_REGISTRY_URL = "http://127.0.0.1:1";
  try {
    const result = await checkForUpdate(stateDir, "0.1.0");
    assert.equal(result?.latest, "5.0.0");
  } finally {
    delete process.env.FEATHERLAB_REGISTRY_URL;
  }
});

test("force:true bypasses a valid cache and re-fetches", async () => {
  const stateDir = tmpDir();
  // Cache says 5.0.0, but the live registry says 6.0.0 — force should fetch the real value.
  writeFileSync(
    path.join(stateDir, "update-check.json"),
    JSON.stringify({ latest: "5.0.0", checkedAt: Date.now() }),
  );
  const reg = await registry({ body: { version: "6.0.0" } });
  process.env.FEATHERLAB_REGISTRY_URL = reg.url;
  try {
    const result = await checkForUpdate(stateDir, "0.1.0", { force: true });
    assert.equal(result?.latest, "6.0.0");
  } finally {
    delete process.env.FEATHERLAB_REGISTRY_URL;
  }
});

test("FEATHERLAB_NO_UPDATE_CHECK suppresses all checks", async () => {
  const reg = await registry({ body: { version: "9.9.9" } });
  const stateDir = tmpDir();
  process.env.FEATHERLAB_REGISTRY_URL = reg.url;
  process.env.FEATHERLAB_NO_UPDATE_CHECK = "1";
  try {
    const result = await checkForUpdate(stateDir, "0.1.0", { force: true });
    assert.equal(result, null);
  } finally {
    delete process.env.FEATHERLAB_REGISTRY_URL;
    delete process.env.FEATHERLAB_NO_UPDATE_CHECK;
  }
});

// ---------------------------------------------------------------------------
// readCachedUpdateInfo — synchronous cache reader
// ---------------------------------------------------------------------------

test("readCachedUpdateInfo: returns cached result when fresh", () => {
  const stateDir = tmpDir();
  writeFileSync(
    path.join(stateDir, "update-check.json"),
    JSON.stringify({ latest: "9.0.0", checkedAt: Date.now() }),
  );
  const result = readCachedUpdateInfo(stateDir, "0.1.0");
  assert.deepEqual(result, { current: "0.1.0", latest: "9.0.0", isOutdated: true });
});

test("readCachedUpdateInfo: returns null when cache is expired", () => {
  const stateDir = tmpDir();
  writeFileSync(
    path.join(stateDir, "update-check.json"),
    JSON.stringify({ latest: "9.0.0", checkedAt: 0 }),
  );
  assert.equal(readCachedUpdateInfo(stateDir, "0.1.0"), null);
});

test("readCachedUpdateInfo: returns null when cache file is absent", () => {
  assert.equal(readCachedUpdateInfo(tmpDir(), "0.1.0"), null);
});

test("readCachedUpdateInfo: returns null when FEATHERLAB_NO_UPDATE_CHECK is set", () => {
  const stateDir = tmpDir();
  writeFileSync(
    path.join(stateDir, "update-check.json"),
    JSON.stringify({ latest: "9.0.0", checkedAt: Date.now() }),
  );
  process.env.FEATHERLAB_NO_UPDATE_CHECK = "1";
  try {
    assert.equal(readCachedUpdateInfo(stateDir, "0.1.0"), null);
  } finally {
    delete process.env.FEATHERLAB_NO_UPDATE_CHECK;
  }
});

test("readCachedUpdateInfo: returns null for a miss entry (no `latest`)", () => {
  const stateDir = tmpDir();
  writeFileSync(
    path.join(stateDir, "update-check.json"),
    JSON.stringify({ latest: null, checkedAt: Date.now() }),
  );
  assert.equal(readCachedUpdateInfo(stateDir, "0.1.0"), null);
});

test("expired cache causes a fresh fetch", async () => {
  const stateDir = tmpDir();
  // Expired entry (checkedAt far in the past).
  writeFileSync(
    path.join(stateDir, "update-check.json"),
    JSON.stringify({ latest: "0.0.1", checkedAt: 0 }),
  );
  const reg = await registry({ body: { version: "7.0.0" } });
  process.env.FEATHERLAB_REGISTRY_URL = reg.url;
  try {
    const result = await checkForUpdate(stateDir, "0.1.0");
    assert.equal(result?.latest, "7.0.0");
  } finally {
    delete process.env.FEATHERLAB_REGISTRY_URL;
  }
});
