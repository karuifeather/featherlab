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
      // Sort by explicit order (float). Items without an order keep their original
      // relative position (stable sort returns 0 — never fall through to id compare,
      // which would break tests whose exercise stubs have no order field).
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
                    const ariaLabel = isLocked
                      ? `${item.title} — locked${unmetTitles ? `, requires: ${unmetTitles}` : ""}`
                      : item.title;
                    // Ordinal counts only labs
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
                        onClick={isLocked ? undefined : () => onSelect(item.id)}
                      >
                        <span className="lesson-ord" aria-hidden="true">
                          {isCompleted ? "✓" : isLocked ? "⊘" : String(labOrdinal).padStart(2, "0")}
                        </span>
                        <div className="lesson-main">
                          <span className="lesson-title">{item.title}</span>
                          {isLocked && unmetTitles && (
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
        <span className="kc-sidebar-sub">
          Quiz · {quiz.questionCount ?? quiz.questions?.length ?? "?"} questions
        </span>
      </div>
    </button>
  );
}
