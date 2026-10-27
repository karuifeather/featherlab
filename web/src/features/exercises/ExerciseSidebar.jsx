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

/** Readable prerequisite list, falling back to raw IDs when titles are unavailable. */
function prereqLabel(unmetIds, progressMap) {
  if (!unmetIds || unmetIds.length === 0) return null;
  return unmetIds.map((id) => progressMap.get(id)?.title ?? id).join(", ");
}

export function ExerciseSidebar({
  track,
  exercises,
  selectedId,
  onSelect,
  collapsed = false,
  onToggleCollapse,
  progressMap = new Map(),
  progressLoading = false,
  progressError = null,
  summary = null,
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
        <div className="sidebar-head-text">
          <span className="sidebar-title">{track.toUpperCase()}</span>
          {!progressLoading && summary && summary.total > 0 && (
            <span
              className="sidebar-progress"
              aria-label={`${summary.completed} of ${summary.total} exercises completed`}
            >
              {summary.completed} / {summary.total}
            </span>
          )}
        </div>
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
                    // Default to "available" while progress is loading so exercises
                    // never flash as locked before data arrives.
                    const info = progressMap.get(exercise.id);
                    const state = progressLoading ? "available" : (info?.state ?? "available");
                    const isLocked = state === "locked";
                    const isCompleted = state === "completed";
                    const unmetTitles = isLocked
                      ? prereqLabel(info?.unmetPrerequisites, progressMap)
                      : null;
                    const ariaLabel = isLocked
                      ? `${exercise.title} — locked${unmetTitles ? `, requires: ${unmetTitles}` : ""}`
                      : exercise.title;

                    return (
                      <button
                        key={exercise.id}
                        className={`lesson ${active ? "selected" : ""} ${isCompleted ? "completed" : ""} ${isLocked ? "locked" : ""}`}
                        data-testid="lesson"
                        aria-current={active ? "true" : undefined}
                        aria-disabled={isLocked ? "true" : undefined}
                        aria-label={ariaLabel}
                        title={
                          isLocked && unmetTitles ? `Requires: ${unmetTitles}` : exercise.title
                        }
                        onClick={isLocked ? undefined : () => onSelect(exercise.id)}
                      >
                        <span className="lesson-ord" aria-hidden="true">
                          {isCompleted ? "✓" : isLocked ? "⊘" : String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="lesson-main">
                          <span className="lesson-title">{exercise.title}</span>
                          {isLocked && unmetTitles && (
                            <span className="lesson-prereq-note" aria-hidden="true">
                              Requires: {unmetTitles}
                            </span>
                          )}
                        </div>
                        {!isLocked && <DifficultyDots difficulty={exercise.difficulty} />}
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
        {/* Static description of the environment, not a live health check: no status LED. */}
        <span>kind · isolated cluster</span>
        {progressError && (
          <span className="sidebar-progress-error" role="alert" aria-live="polite">
            Progress unavailable
          </span>
        )}
      </div>
    </aside>
  );
}
