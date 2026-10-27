import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/app.mjs";

/** Write `{ "relative/path": "text" }` into a fresh temp directory and return its path. */
export function makeContent(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), "featherlab-content-"));
  for (const [relative, text] of Object.entries(files)) {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}

const BASE = {
  schemaVersion: 1,
  id: "demo-0001",
  type: "task",
  title: "Demo",
  summary: "A demo exercise.",
  track: "kubernetes",
  level: 0,
  difficulty: "beginner",
  estimatedMinutes: 3,
  environment: { profile: "kind-default" },
  requirements: ["Do the thing"],
};

/** The namespace a fixture exercise owns, following the `fl-<id>` convention. */
export const nsOf = (id) => `fl-${id}`;

/**
 * YAML (JSON is valid YAML) for a definition built from BASE plus overrides. Unless
 * overridden, the exercise owns `fl-<id>` and checks for a Pod `demo` there.
 */
export function definition(overrides = {}) {
  const id = overrides.id ?? BASE.id;
  return JSON.stringify(
    {
      ...BASE,
      lifecycle: { namespaces: [nsOf(id)] },
      checks: [
        {
          id: "exists",
          type: "k8s.resource-exists",
          label: "Pod demo exists",
          params: { kind: "Pod", name: "demo", namespace: nsOf(id) },
        },
      ],
      ...overrides,
    },
    null,
    2,
  );
}

export function exerciseFiles(slug, overrides = {}, extra = {}) {
  return {
    [`kubernetes/level-0/${slug}/exercise.yaml`]: definition(overrides),
    [`kubernetes/level-0/${slug}/description.md`]: "Demo description.",
    ...Object.fromEntries(
      Object.entries(extra).map(([name, text]) => [`kubernetes/level-0/${slug}/${name}`, text]),
    ),
  };
}

export function appFor(files, runner, options = {}) {
  return createApp({
    runner,
    contentRoot: makeContent(files),
    logger: { warn() {}, error() {} },
    ...options,
  });
}
