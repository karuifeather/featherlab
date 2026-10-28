import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

export const PACKAGED_EXERCISES_DIR = fileURLToPath(new URL("../../../exercises", import.meta.url));

const DEFINITION_FILE = "knowledge-check.yaml";
const MAX_DEPTH = 8;
const MAX_FILE_BYTES = 256 * 1024;
const SAFE_RELATIVE = /^(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

export function createKnowledgeCheckSource({ root = PACKAGED_EXERCISES_DIR } = {}) {
  return {
    root,
    discover() {
      let rootReal;
      try {
        rootReal = realpathSync(root);
      } catch {
        throw new Error(`Exercise directory not found: ${root}`);
      }
      const entries = [];
      walk(rootReal, rootReal, 0, entries);
      return entries.sort((a, b) => (a.file < b.file ? -1 : 1));
    },
  };
}

function walk(rootReal, dir, depth, entries) {
  if (depth > MAX_DEPTH) return;
  const children = readdirSync(dir, { withFileTypes: true });
  for (const child of children) {
    if (child.isSymbolicLink()) continue;
    if (child.isDirectory()) walk(rootReal, path.join(dir, child.name), depth + 1, entries);
    else if (child.isFile() && child.name === DEFINITION_FILE)
      entries.push(loadEntry(rootReal, dir));
  }
}

function loadEntry(rootReal, dir) {
  const reader = createReader(dir);
  const file = path.relative(rootReal, path.join(dir, DEFINITION_FILE)).split(path.sep).join("/");
  const entry = { file, data: undefined, problems: [] };
  try {
    const document = parseDocument(reader.readText(DEFINITION_FILE), { schema: "core" });
    if (document.errors.length > 0) {
      const [error] = document.errors;
      const line = error.linePos?.[0]?.line;
      entry.problems.push({
        message: `invalid YAML${line ? ` (line ${line})` : ""}: ${error.message.split("\n")[0]}`,
      });
    } else {
      entry.data = document.toJS();
    }
  } catch (error) {
    entry.problems.push({ message: error.message });
  }
  return entry;
}

function createReader(dir) {
  return {
    readText(relativePath) {
      if (typeof relativePath !== "string" || !SAFE_RELATIVE.test(relativePath))
        throw new Error("path must be relative and stay inside the exercise directory");
      const full = path.join(dir, relativePath);
      let stat;
      try {
        stat = lstatSync(full);
      } catch {
        throw new Error("file does not exist");
      }
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("not a regular file");
      if (stat.size > MAX_FILE_BYTES) throw new Error(`file exceeds ${MAX_FILE_BYTES} bytes`);
      const real = realpathSync(full);
      if (!real.startsWith(realpathSync(dir) + path.sep))
        throw new Error("path escapes the exercise directory");
      return readFileSync(real, "utf8");
    },
  };
}
