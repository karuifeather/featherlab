import test from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseMarkdown } from "../../web/src/lib/markdown.js";

test("inline code and bold are tokenized; everything else is plain text", () => {
  assert.deepEqual(parseInline("Run `kubectl get` **now** please"), [
    { type: "text", text: "Run " },
    { type: "code", text: "kubectl get" },
    { type: "text", text: " " },
    { type: "strong", text: "now" },
    { type: "text", text: " please" },
  ]);
});

test("HTML and links are inert text, never markup", () => {
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
