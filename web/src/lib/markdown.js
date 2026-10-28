/**
 * A focused Markdown subset for exercise text: paragraphs, bullet lists, pipe tables,
 * fenced code blocks, headings, `inline code`, **bold** and [links](https://…). It produces
 * plain data that the React component renders as elements, so exercise content can never
 * inject HTML. Links are restricted to https:// URLs; anything else is inert text.
 */

export function parseInline(text) {
  const parts = [];
  // Link pattern must come before bold/code so [text](url) is not split by other patterns.
  const pattern = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ type: "text", text: text.slice(last, match.index) });
    if (match[1] !== undefined) {
      parts.push({ type: "link", text: match[1], href: match[2] });
    } else if (match[3] !== undefined) {
      parts.push({ type: "code", text: match[3] });
    } else {
      parts.push({ type: "strong", text: match[4] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

/** Split a pipe table row into trimmed cell strings, stripping leading/trailing `|`. */
function splitCells(row) {
  return row
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

/** Return true if a line is a table separator row (e.g. `| --- | --- |`). */
function isSeparator(line) {
  return /^\|?[\s\-:|]+(\|[\s\-:|]+)*\|?$/.test(line.trim()) && line.includes("-");
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
    // Fenced code block.
    if (line.trimStart().startsWith("```")) {
      flush();
      const code = [];
      for (i++; i < lines.length && !lines[i].trimStart().startsWith("```"); i++)
        code.push(lines[i]);
      blocks.push({ type: "code", text: code.join("\n") });
      // Heading: #, ##, ###.
    } else if (/^#{1,3}\s+/.test(line)) {
      flush();
      const m = line.match(/^(#{1,3})\s+(.*)/);
      blocks.push({ type: "heading", level: m[1].length, inline: parseInline(m[2]) });
      // Pipe table: header row followed by a separator row.
    } else if (line.includes("|") && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      flush();
      const headers = splitCells(line).map(parseInline);
      i += 2; // skip separator
      const rows = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(splitCells(lines[i]).map(parseInline));
        i++;
      }
      i--; // outer loop will increment
      blocks.push({ type: "table", headers, rows });
      // Bullet list.
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (paragraph.length) flush();
      (list ??= []).push(line.replace(/^\s*[-*]\s+/, ""));
      // Blank line.
    } else if (line.trim() === "") {
      flush();
      // Paragraph continuation.
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}
