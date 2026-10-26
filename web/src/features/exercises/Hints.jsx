import { useState } from "react";
import "./Hints.scss";
import { api } from "../../api/client.js";
import { Inline } from "../../components/Markdown.jsx";
import { useAction } from "./useAction.js";

/** Reveals hints one at a time; each is fetched only when asked for. */
export function Hints({ exerciseId, total }) {
  const [shown, setShown] = useState([]);
  const { run, busy, error } = useAction(async () => {
    const { hint } = await api.getHint(exerciseId, shown.length + 1);
    setShown((current) => [...current, hint.text]);
  });
  if (total === 0) return null;
  return (
    <div className="hints">
      {shown.map((text, i) => (
        <p className="hint" data-testid="hint" key={i}>
          <span className="hint-index" aria-hidden="true">
            {i + 1}
          </span>
          <span className="hint-text">
            <Inline text={text} />
          </span>
        </p>
      ))}
      {shown.length < total && (
        <button className="hint-button" disabled={busy} onClick={run}>
          <span className="hint-glyph" aria-hidden="true">
            ◈
          </span>
          {shown.length === 0 ? "Need a hint?" : `Next hint (${shown.length}/${total})`}
        </button>
      )}
      {error && (
        <div className="error" data-testid="error-message">
          {error}
        </div>
      )}
    </div>
  );
}
