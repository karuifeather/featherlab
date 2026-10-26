import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist/web");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export async function staticFile(req, res) {
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
