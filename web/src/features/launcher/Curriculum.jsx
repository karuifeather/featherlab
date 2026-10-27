/**
 * The track's exercises grouped by level, with the backend's state for each (completed,
 * available, locked). States are spelled out in text, not just colour or glyph. Locked rows
 * stay focusable so keyboard and screen-reader users can discover their prerequisites, but
 * they never open — the same rule the workspace sidebar applies.
 */
export function Curriculum({ exercises, currentId, onOpen }) {
  const titles = new Map(exercises.map((e) => [e.exerciseId, e.title]));
  const levels = [...Map.groupBy(exercises, (e) => e.level)];

  return (
    <div className="curriculum">
      {levels.map(([level, items]) => (
        <div className="curriculum-level" key={level}>
          <h3 className="curriculum-level-title">Level {level}</h3>
          <ol className="curriculum-items">
            {items.map((item, i) => {
              const locked = item.state === "locked";
              const completed = item.state === "completed";
              const current = item.exerciseId === currentId;
              const requires = locked
                ? (item.unmetPrerequisites ?? []).map((id) => titles.get(id) ?? id).join(", ")
                : "";
              const stateText = completed ? "Completed" : locked ? "Locked" : "";
              const label = [
                item.title,
                stateText,
                requires && `requires: ${requires}`,
                current && "current",
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <li key={item.exerciseId}>
                  <button
                    type="button"
                    className={`curriculum-item ${completed ? "completed" : ""} ${locked ? "locked" : ""} ${current ? "current" : ""}`}
                    data-testid="curriculum-item"
                    data-state={item.state}
                    aria-disabled={locked ? "true" : undefined}
                    aria-label={label}
                    title={locked && requires ? `Requires: ${requires}` : undefined}
                    onClick={locked ? undefined : () => onOpen(item.exerciseId)}
                  >
                    <span className="curriculum-ord" aria-hidden="true">
                      {completed ? "✓" : locked ? "⊘" : String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="curriculum-title">{item.title}</span>
                    {current && <span className="curriculum-tag">Current</span>}
                    {locked && requires && (
                      <span className="curriculum-note" aria-hidden="true">
                        Requires {requires}
                      </span>
                    )}
                    {completed && (
                      <span className="curriculum-note" aria-hidden="true">
                        Completed
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
