import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseInline, parseMarkdown } from "../../web/src/lib/markdown.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("inline code and bold are tokenized; everything else is plain text", () => {
  assert.deepEqual(parseInline("Run `kubectl get` **now** please"), [
    { type: "text", text: "Run " },
    { type: "code", text: "kubectl get" },
    { type: "text", text: " " },
    { type: "strong", text: "now" },
    { type: "text", text: " please" },
  ]);
});

test("https links are parsed; http://, javascript: and other schemes are inert text", () => {
  const parts = parseInline(
    "[docs](https://kubernetes.io/docs) and [bad](javascript:alert(1)) and [plain](http://example.com)",
  );
  assert.equal(parts[0].type, "link");
  assert.equal(parts[0].href, "https://kubernetes.io/docs");
  assert.equal(parts[0].text, "docs");
  // Only https: matches; http:// and javascript: are inert text.
  assert.ok(parts.every((p) => p.type !== "link" || p.href.startsWith("https://")));
  // The http and javascript [text](url) pairs appear as plain text, not as link tokens.
  const linkCount = parts.filter((p) => p.type === "link").length;
  assert.equal(linkCount, 1);
});

test("HTML and javascript: links are inert text, never markup", () => {
  const [block] = parseMarkdown('<img src=x onerror="alert(1)"> [a](javascript:alert(1))');
  assert.equal(block.inline.length, 1);
  assert.equal(block.inline[0].type, "text");
});

test("paragraphs, lists and fenced code become blocks", () => {
  const blocks = parseMarkdown(
    "Intro line\ncontinues.\n\n- one\n- `two`\n\n```bash\nkubectl get pods\n```\n",
  );
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["p", "ul", "code"],
  );
  assert.equal(blocks[0].inline[0].text, "Intro line continues.");
  assert.equal(blocks[1].items.length, 2);
  assert.equal(blocks[2].text, "kubectl get pods");
});

test("headings # ## ### produce heading blocks with correct levels", () => {
  const blocks = parseMarkdown("# Title\n\n## Section\n\n### Sub\n\nParagraph.");
  assert.deepEqual(
    blocks.map((b) => b.type),
    ["heading", "heading", "heading", "p"],
  );
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[1].level, 2);
  assert.equal(blocks[2].level, 3);
  assert.equal(blocks[0].inline[0].text, "Title");
});

test("pipe table becomes a table block with headers and rows", () => {
  const src = [
    "| Command | Shows |",
    "| ------- | ----- |",
    "| `kubectl get pods` | pod list |",
    "| `kubectl logs` | stdout |",
  ].join("\n");
  const [block] = parseMarkdown(src);
  assert.equal(block.type, "table");
  assert.equal(block.headers.length, 2);
  assert.equal(block.rows.length, 2);
  assert.equal(block.headers[0][0].text, "Command");
  assert.equal(block.rows[0][0][0].type, "code");
  assert.equal(block.rows[0][0][0].text, "kubectl get pods");
  assert.equal(block.rows[0][1][0].type, "text");
  assert.equal(block.rows[0][1][0].text, "pod list");
});

// Regression: parse the real k8s-0011 description.md and verify table + link handling.
test("k8s-0011 description: table and documentation links parse correctly", () => {
  const descPath = path.resolve(
    __dirname,
    "../../exercises/kubernetes/level-0/011-inspect-a-pod/description.md",
  );
  const source = readFileSync(descPath, "utf8");
  const blocks = parseMarkdown(source);

  // The first block is the pipe table (Command | Shows).
  const table = blocks.find((b) => b.type === "table");
  assert.ok(table, "expected a table block");
  assert.equal(table.headers.length, 2, "table should have 2 columns");
  assert.equal(table.rows.length, 3, "table should have 3 data rows");

  // First cell of first row must be inline code.
  const firstCell = table.rows[0][0];
  assert.ok(
    firstCell.some((p) => p.type === "code" && p.text.includes("kubectl get pods")),
    "first cell should be inline code with kubectl get pods",
  );

  // The last paragraph contains three https:// links (Pods, labels, kubectl quick reference).
  const allInlines = blocks.filter((b) => b.type === "p").flatMap((b) => b.inline);
  const links = allInlines.filter((p) => p.type === "link");
  assert.equal(links.length, 3, `expected 3 links, got ${links.length}`);
  assert.ok(
    links.every((l) => l.href.startsWith("https://kubernetes.io/")),
    "all links must point to kubernetes.io",
  );

  // No text token in any block should contain a pipe or a Markdown link bracket pattern.
  const allTextParts = blocks.flatMap((b) => {
    if (b.type === "p") return b.inline;
    if (b.type === "ul") return b.items.flat();
    return [];
  });
  const hasPipe = allTextParts.some((p) => p.type === "text" && p.text.includes("|"));
  assert.equal(hasPipe, false, "no text token should contain a pipe character");
  const hasBracket = allTextParts.some((p) => p.type === "text" && p.text.includes("]("));
  assert.equal(hasBracket, false, 'no text token should contain Markdown link syntax "]("');
});
