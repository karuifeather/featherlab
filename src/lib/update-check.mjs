import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Read at call time so tests can override FEATHERLAB_REGISTRY_URL per-invocation.
function registryUrl() {
  return process.env.FEATHERLAB_REGISTRY_URL ?? "https://registry.npmjs.org/featherlab/latest";
}

// Reject anything that isn't a plain x.y.z version. Pre-release tags contain hyphens that
// confuse the semverGt comparator (e.g. "1.2.3-beta.1".split(".") produces a NaN patch).
function isValidSemver(v) {
  return typeof v === "string" && /^\d+\.\d+\.\d+$/.test(v);
}

// How long to reuse a successful cache entry before re-fetching.
const HIT_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
// How long to suppress retries after a 404 (package not yet published).
const MISS_TTL_MS = 60 * 60 * 1000; // 1 h

function semverGt(a, b) {
  const [aMaj, aMin, aPatch] = a.split(".").map(Number);
  const [bMaj, bMin, bPatch] = b.split(".").map(Number);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPatch > bPatch;
}

/**
 * Reads the update cache synchronously and returns a result if it is fresh.
 * Returns null when the cache is missing, corrupt, expired, or a miss (no `latest`).
 *
 * Used by the passive CLI notification path so no async work ever delays command
 * completion. When this returns null the caller should fire checkForUpdate() as
 * a background task (fire-and-forget) to populate the cache for the next invocation.
 */
export function readCachedUpdateInfo(stateDir, currentVersion) {
  if (process.env.FEATHERLAB_NO_UPDATE_CHECK) return null;
  try {
    const cache = JSON.parse(readFileSync(path.join(stateDir, "update-check.json"), "utf8"));
    const ttl = cache.latest ? HIT_TTL_MS : MISS_TTL_MS;
    if (Date.now() - cache.checkedAt < ttl) {
      if (!cache.latest) return null;
      return {
        current: currentVersion,
        latest: cache.latest,
        isOutdated: semverGt(cache.latest, currentVersion),
      };
    }
  } catch {
    // Cache missing or corrupt.
  }
  return null;
}

/**
 * Checks whether a newer version of featherlab is available on npm.
 *
 * Result is cached in `<stateDir>/update-check.json` to avoid hitting the registry on every
 * command. Pass `force: true` to bypass the cache (used by `featherlab update`).
 *
 * Returns `{current, latest, isOutdated}` on success; `null` when the registry is unreachable,
 * the package is not yet published, or `FEATHERLAB_NO_UPDATE_CHECK=1` is set.
 */
export async function checkForUpdate(stateDir, currentVersion, { force = false } = {}) {
  if (process.env.FEATHERLAB_NO_UPDATE_CHECK) return null;

  const cacheFile = path.join(stateDir, "update-check.json");

  if (!force) {
    try {
      const cache = JSON.parse(readFileSync(cacheFile, "utf8"));
      const ttl = cache.latest ? HIT_TTL_MS : MISS_TTL_MS;
      if (Date.now() - cache.checkedAt < ttl) {
        if (!cache.latest) return null;
        return {
          current: currentVersion,
          latest: cache.latest,
          isOutdated: semverGt(cache.latest, currentVersion),
        };
      }
    } catch {
      // Cache missing or corrupt — fall through to fetch.
    }
  }

  let latest = null;
  try {
    const res = await fetch(registryUrl(), {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      // Validate before accepting — a malformed version field must not reach semverGt.
      if (isValidSemver(data?.version)) latest = data.version;
    }
    // Write result either way (null for 404/invalid) so we observe the miss TTL.
    try {
      writeFileSync(cacheFile, JSON.stringify({ latest, checkedAt: Date.now() }), { mode: 0o600 });
    } catch {
      // State dir may not exist yet (e.g. before first `featherlab start`).
    }
  } catch {
    return null; // Offline or timed out — silently skip.
  }

  if (!latest) return null;
  return { current: currentVersion, latest, isOutdated: semverGt(latest, currentVersion) };
}
