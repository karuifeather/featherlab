import { parseInline, parseMarkdown } from "../lib/markdown.js";
import "./Markdown.scss";

function InlineParts({ parts }) {
  return parts.map((part, i) =>
    part.type === "code" ? (
      <code key={i}>{part.text}</code>
    ) : part.type === "strong" ? (
      <strong key={i}>{part.text}</strong>
    ) : part.type === "link" ? (
      <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
        {part.text}
      </a>
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
    if (block.type === "heading") {
      // Exercise titles are h1; descriptions use h3/h4 to stay in hierarchy.
      const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h3" : "h4";
      return (
        <Tag className="md-heading" key={i}>
          <InlineParts parts={block.inline} />
        </Tag>
      );
    }
    if (block.type === "table")
      return (
        <div className="md-table-wrap" key={i}>
          <table className="md-table">
            <thead>
              <tr>
                {block.headers.map((cell, j) => (
                  <th key={j}>
                    <InlineParts parts={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, j) => (
                <tr key={j}>
                  {row.map((cell, k) => (
                    <td key={k}>
                      <InlineParts parts={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    return (
      <p key={i}>
        <InlineParts parts={block.inline} />
      </p>
    );
  });
}
