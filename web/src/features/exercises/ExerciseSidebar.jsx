import { useState } from "react";
import "./ExerciseSidebar.scss";
import "../knowledge-checks/KnowledgeCheckPanel.scss";

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

/**
 * Merge exercises (labs) and quizzes into one sorted list per level.
 * Labs have integer orders; quizzes have float orders (e.g. 1.5) for interleaving.
 */
function mergeByLevel(exercises, quizzes) {
  const allItems = [
    ...exercises.map((e) => ({ ...e, _itemType: "lab" })),
    ...quizzes.map((q) => ({ ...q, _itemType: "quiz" })),
  ];
  const levelMap = new Map();
  for (const item of allItems) {
    if (!levelMap.has(item.level)) levelMap.set(item.level, []);
    levelMap.get(item.level).push(item);
  }
  for (const items of levelMap.values()) {
    items.sort((a, b) => {
      const aOrd = a.order ?? Infinity;
      const bOrd = b.order ?? Infinity;
      return aOrd - bOrd;
    });
  }
  return [...levelMap.entries()].sort(([a], [b]) => a - b);
}

export function ExerciseSidebar({
  track,
  exercises,
  quizzes = [],
  selectedId,
  onSelect,
  collapsed = false,
  onToggleCollapse,
  progressMap = new Map(),
  progressLoading = false,
  progressError = null,
  summary = null,
}) {
  const levels = mergeByLevel(exercises, quizzes);
  // Track which locked items have had their prereq note expanded (click to reveal).
  const [expandedPrereqs, setExpandedPrereqs] = useState(() => new Set());

  // The active level is derived every render so no effect is needed.
  const activeLevel =
    selectedId != null
      ? (levels.find(([, items]) => items.some((item) => item.id === selectedId))?.[0] ?? null)
      : null;

  // Level open/close overrides. The active field records which activeLevel was in force when
  // the user last toggled; when selectedId changes and activeLevel moves, overrides reset so
  // the new active level expands automatically.
  const [ov, setOv] = useState({ active: activeLevel, map: new Map() });
  const overrides = ov.active === activeLevel ? ov.map : new Map();
  const isOpen = (l) =>
    overrides.get(l) ?? (activeLevel == null ? l === levels[0]?.[0] : l === activeLevel);
  const toggleLevel = (l) =>
    setOv({ active: activeLevel, map: new Map(overrides).set(l, !isOpen(l)) });

  const togglePrereq = (id) =>
    setExpandedPrereqs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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
          const open = isOpen(level);
          const totalCount = items.length;
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
                <span className="level-count">{totalCount}</span>
              </button>
              {open && (
                <div className="level-items">
                  {items.map((item) => {
                    if (item._itemType === "quiz") {
                      return (
                        <QuizSidebarItem
                          key={item.id}
                          quiz={item}
                          active={item.id === selectedId}
                          onSelect={onSelect}
                        />
                      );
                    }
                    // Lab item
                    const active = item.id === selectedId;
                    const info = progressMap.get(item.id);
                    const state = progressLoading ? "available" : (info?.state ?? "available");
                    const isLocked = state === "locked";
                    const isCompleted = state === "completed";
                    const unmetTitles = isLocked
                      ? prereqLabel(info?.unmetPrerequisites, progressMap)
                      : null;
                    const prereqExpanded = isLocked && expandedPrereqs.has(item.id);
                    const ariaLabel = isLocked
                      ? `${item.title} — locked${unmetTitles ? `, requires: ${unmetTitles}` : ""}`
                      : item.title;
                    const labOrdinal =
                      items
                        .filter((x) => x._itemType === "lab")
                        .findIndex((x) => x.id === item.id) + 1;

                    return (
                      <button
                        key={item.id}
                        className={`lesson ${active ? "selected" : ""} ${isCompleted ? "completed" : ""} ${isLocked ? "locked" : ""}`}
                        data-testid="lesson"
                        aria-current={active ? "true" : undefined}
                        aria-disabled={isLocked ? "true" : undefined}
                        aria-label={ariaLabel}
                        title={isLocked && unmetTitles ? `Requires: ${unmetTitles}` : item.title}
                        onClick={
                          isLocked
                            ? unmetTitles
                              ? () => togglePrereq(item.id)
                              : undefined
                            : () => onSelect(item.id)
                        }
                      >
                        <span className="lesson-ord" aria-hidden="true">
                          {isCompleted ? "✓" : isLocked ? "⊘" : String(labOrdinal).padStart(2, "0")}
                        </span>
                        <div className="lesson-main">
                          <span className="lesson-title">{item.title}</span>
                          {prereqExpanded && unmetTitles && (
                            <span className="lesson-prereq-note" aria-hidden="true">
                              Requires: {unmetTitles}
                            </span>
                          )}
                        </div>
                        {!isLocked && <DifficultyDots difficulty={item.difficulty} />}
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

function QuizSidebarItem({ quiz, active, onSelect }) {
  return (
    <button
      type="button"
      className={`kc-sidebar-item ${active ? "selected" : ""}`}
      data-testid="knowledge-check-item"
      aria-current={active ? "true" : undefined}
      aria-label={`${quiz.title} — knowledge check`}
      title={quiz.title}
      onClick={() => onSelect(quiz.id)}
    >
      <span className="kc-sidebar-icon" aria-hidden="true">
        ✦
      </span>
      <div className="kc-sidebar-main">
        <span className="kc-sidebar-title">{quiz.title}</span>
      </div>
    </button>
  );
}
