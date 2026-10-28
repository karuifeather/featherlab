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
      let href = null;
      try {
        const u = new URL(match[2]);
        if (u.protocol === "https:" && !u.username && !u.password) href = match[2];
      } catch {
        /* invalid URL — treat as plain text */
      }
      if (href) {
        parts.push({ type: "link", text: match[1], href });
      } else {
        parts.push({ type: "text", text: match[0] });
      }
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

/** True if line contains a pipe outside inline code spans. */
function hasPipe(line) {
  let inCode = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "`") inCode = !inCode;
    else if (!inCode && line[i] === "|") return true;
  }
  return false;
}

/** Split a pipe table row into trimmed cell strings. Handles escaped pipes (\|) and pipes
 *  inside inline code spans. */
function splitCells(row) {
  let start = 0;
  let end = row.length;
  if (row[0] === "|") start = 1;
  if (row.length > 1 && row[end - 1] === "|" && row[end - 2] !== "\\") end -= 1;

  const cells = [];
  let current = "";
  let inCode = false;
  for (let i = start; i < end; i++) {
    const ch = row[i];
    if (ch === "`") {
      inCode = !inCode;
      current += ch;
    } else if (!inCode && ch === "\\" && i + 1 < end && row[i + 1] === "|") {
      current += "|";
      i++;
    } else if (!inCode && ch === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Count cells in a separator row (| --- | --- |) for column-count validation. */
function parseSeparatorCells(line) {
  return line
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
      // Pipe table: header row followed by a separator row with matching column count.
    } else if (hasPipe(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const headers = splitCells(line).map(parseInline);
      const sepCells = parseSeparatorCells(lines[i + 1]);
      if (headers.length === 0 || headers.length !== sepCells.length) {
        // Column count mismatch — not a valid table; treat header line as paragraph text.
        if (list) flush();
        paragraph.push(line.trim());
      } else {
        flush();
        i += 2; // skip separator
        const rows = [];
        while (i < lines.length && hasPipe(lines[i])) {
          const cells = splitCells(lines[i]).map(parseInline);
          while (cells.length < headers.length) cells.push([]);
          rows.push(cells.slice(0, headers.length));
          i++;
        }
        i--; // outer loop will increment
        blocks.push({ type: "table", headers, rows });
      }
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
