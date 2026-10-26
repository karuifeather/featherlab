import { parseInline, parseMarkdown } from "../lib/markdown.js";

function InlineParts({ parts }) {
  return parts.map((part, i) =>
    part.type === "code" ? (
      <code key={i}>{part.text}</code>
    ) : part.type === "strong" ? (
      <strong key={i}>{part.text}</strong>
    ) : (
      part.text
    ),
  );
}

/** Render a single line of exercise text (requirements, hints). */
export function Inline({ text }) {
  return <InlineParts parts={parseInline(text)} />;
}

/** Render exercise Markdown as React elements; never as raw HTML. */
export function Markdown({ source }) {
  return parseMarkdown(source).map((block, i) => {
    if (block.type === "code")
      return (
        <pre className="code-block" key={i}>
          <code>{block.text}</code>
        </pre>
      );
    if (block.type === "ul")
      return (
        <ul key={i}>
          {block.items.map((parts, j) => (
            <li key={j}>
              <InlineParts parts={parts} />
            </li>
          ))}
        </ul>
      );
    return (
      <p key={i}>
        <InlineParts parts={block.inline} />
      </p>
    );
  });
}
