#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Release gate for the npm tarball: everything the installed CLI needs is present, and
 * nothing that must not ship (tests, sources, secrets, notes) is.
 */
const REQUIRED = [
  "package.json",
  "README.md",
  "LICENSE",
  "bin/featherlab.mjs",
  "src/app.mjs",
  "src/server.mjs",
  "dist/web/index.html",
];

/**
 * Every file of every exercise (definition, description, solution, setup manifests) must
 * ship: a missing setup manifest only shows up when a learner opens that exercise.
 */
export function contentFiles(root = ROOT) {
  return readdirSync(path.join(root, "exercises"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .map((file) => file.split(path.sep).join("/"))
    .sort();
}

export const requiredFiles = () => [...REQUIRED, ...contentFiles()];
const ALLOWED_PREFIXES = ["bin/", "src/", "exercises/", "dist/web/"];
const ALLOWED_ROOT = ["package.json", "README.md", "LICENSE"];
const FORBIDDEN = [
  /(^|\/)\.env/,
  /(^|\/)\.claude\//,
  /(^|\/)notes\//,
  /(^|\/)test\//,
  /\.test\.mjs$/,
  /\.(pem|key|kubeconfig)$/,
  /(^|\/)(host|workstation)-kubeconfig$/,
  /\.map$/,
];

/** @returns {string[]} human-readable problems; empty when the package is fine */
export function checkPackedFiles(files, expected = requiredFiles()) {
  const problems = [];
  const present = new Set(files);
  for (const required of expected)
    if (!present.has(required)) problems.push(`missing from tarball: ${required}`);
  for (const file of files) {
    const allowed = ALLOWED_ROOT.includes(file) || ALLOWED_PREFIXES.some((p) => file.startsWith(p));
    if (!allowed) problems.push(`unexpected file in tarball: ${file}`);
    if (FORBIDDEN.some((pattern) => pattern.test(file)))
      problems.push(`forbidden file in tarball: ${file}`);
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
  });
  const files = JSON.parse(out)[0].files.map((f) => f.path);
  const problems = checkPackedFiles(files);
  if (problems.length > 0) {
    console.error(problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  console.log(`Tarball OK (${files.length} files).`);
}
