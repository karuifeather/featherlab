/**
 * A deliberately tiny Markdown subset for exercise text: paragraphs, bullet lists,
 * fenced code blocks, `inline code` and **bold**. It produces plain data that the React
 * component renders as elements, so exercise content can never inject HTML or links.
 */

export function parseInline(text) {
  const parts = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ type: "text", text: text.slice(last, match.index) });
    parts.push(
      match[1] !== undefined
        ? { type: "code", text: match[1] }
        : { type: "strong", text: match[2] },
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

export function parseMarkdown(source) {
  const blocks = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph = [];
  let list = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", inline: parseInline(paragraph.join(" ")) });
    if (list) blocks.push({ type: "ul", items: list.map(parseInline) });
    paragraph = [];
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      flush();
      const code = [];
      for (i++; i < lines.length && !lines[i].trimStart().startsWith("```"); i++)
        code.push(lines[i]);
      blocks.push({ type: "code", text: code.join("\n") });
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (paragraph.length) flush();
      (list ??= []).push(line.replace(/^\s*[-*]\s+/, ""));
    } else if (line.trim() === "") {
      flush();
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}
