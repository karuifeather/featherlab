import { useState } from "react";
import "./ExerciseSidebar.scss";

const DIFFICULTY_RANK = { beginner: 1, easy: 1, intermediate: 2, medium: 2, advanced: 3, hard: 3 };

function DifficultyDots({ difficulty }) {
  const rank = DIFFICULTY_RANK[String(difficulty).toLowerCase()] ?? 2;
  return (
    <span
      className={`difficulty-dots rank-${rank}`}
      title={difficulty}
      aria-label={`Difficulty: ${difficulty}`}
    >
      {[1, 2, 3].map((n) => (
        <span key={n} className={`dot ${n <= rank ? "on" : ""}`} aria-hidden="true" />
      ))}
    </span>
  );
}

export function ExerciseSidebar({
  track,
  exercises,
  selectedId,
  onSelect,
  collapsed = false,
  onToggleCollapse,
}) {
  const levels = [...Map.groupBy(exercises, (e) => e.level)];
  const [collapsedLevels, setCollapsedLevels] = useState(() => new Set());

  const toggleLevel = (level) =>
    setCollapsedLevels((prev) => {
      const next = new Set(prev);
      next.has(level) ? next.delete(level) : next.add(level);
      return next;
    });

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sidebar-title">{track.toUpperCase()}</span>
        {onToggleCollapse && (
          <button
            type="button"
            className="sidebar-collapse"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "»" : "«"}
          </button>
        )}
      </div>

      <nav className="sidebar-levels" aria-label="Exercises">
        {levels.map(([level, items]) => {
          const open = !collapsedLevels.has(level);
          return (
            <div className="level-group" key={level}>
              <button
                type="button"
                className="level-header"
                aria-expanded={open}
                title={`Level ${level}`}
                onClick={() => toggleLevel(level)}
              >
                <span className={`level-caret ${open ? "open" : ""}`} aria-hidden="true">
                  ▾
                </span>
                <span className="level-label">Level {level}</span>
                <span className="level-count">{items.length}</span>
              </button>
              {open && (
                <div className="level-items">
                  {items.map((exercise, i) => {
                    const active = exercise.id === selectedId;
                    return (
                      <button
                        key={exercise.id}
                        className={`lesson ${active ? "selected" : ""}`}
                        data-testid="lesson"
                        aria-current={active ? "true" : undefined}
                        title={exercise.title}
                        onClick={() => onSelect(exercise.id)}
                      >
                        <span className="lesson-ord">{String(i + 1).padStart(2, "0")}</span>
                        <span className="lesson-title">{exercise.title}</span>
                        <DifficultyDots difficulty={exercise.difficulty} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <span className="status-led green" /> kind · isolated cluster
      </div>
    </aside>
  );
}
