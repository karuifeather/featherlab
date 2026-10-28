import { useState } from "react";

/**
 * The track's exercises grouped by level, with the backend's state for each (completed,
 * available, locked). Each level is an expandable row — only the active level expands
 * by default, so the list stays scannable as the curriculum grows.
 */
export function Curriculum({ exercises, currentId, onOpen }) {
  const titles = new Map(exercises.map((e) => [e.exerciseId, e.title]));
  const levels = [...Map.groupBy(exercises, (e) => e.level)].sort(([a], [b]) => a - b);

  // Find which level contains the current exercise (for default expansion).
  const activeLevel =
    currentId != null
      ? (levels.find(([, items]) => items.some((e) => e.exerciseId === currentId))?.[0] ?? null)
      : null;

  // Collapse every level except the active one; collapse nothing when there is no active level.
  const [collapsedLevels, setCollapsedLevels] = useState(() =>
    activeLevel != null
      ? new Set(levels.map(([l]) => l).filter((l) => l !== activeLevel))
      : new Set(),
  );

  const toggleLevel = (level) =>
    setCollapsedLevels((prev) => {
      const next = new Set(prev);
      next.has(level) ? next.delete(level) : next.add(level);
      return next;
    });

  return (
    <div className="curriculum">
      {levels.map(([level, items]) => {
        const open = !collapsedLevels.has(level);
        const total = items.length;
        const completed = items.filter((e) => e.state === "completed").length;

        return (
          <div className="curriculum-level" key={level}>
            <button
              type="button"
              className="curriculum-level-header"
              aria-expanded={open}
              onClick={() => toggleLevel(level)}
            >
              <span className={`curriculum-level-caret ${open ? "open" : ""}`} aria-hidden="true">
                ▾
              </span>
              <span className="curriculum-level-name">Level {level}</span>
              <span className="curriculum-level-summary">
                {completed}/{total}
              </span>
            </button>

            {open && (
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
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}
