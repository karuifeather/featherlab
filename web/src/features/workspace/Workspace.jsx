import { useCallback, useRef, useState } from "react";
import "./Workspace.scss";
import { api } from "../../api/client.js";
import { ExercisePanel } from "../exercises/ExercisePanel.jsx";
import { ExerciseSidebar } from "../exercises/ExerciseSidebar.jsx";
import { useExerciseList } from "../exercises/useExerciseList.js";
import { useTrackProgress } from "../exercises/useTrackProgress.js";
import { PracticeTerminal } from "../terminal/PracticeTerminal.jsx";
import { useSplitPane } from "./useSplitPane.js";

/**
 * Find the next selectable (available, not the current) exercise after `selectedId`.
 * Returns null when the selected exercise is the last or no available exercise follows.
 */
function findNextAvailable(exercises, selectedId, progressMap) {
  const idx = exercises.findIndex((e) => e.id === selectedId);
  if (idx === -1) return null;
  for (let i = idx + 1; i < exercises.length; i++) {
    const state = progressMap.get(exercises[i].id)?.state;
    // "available" or "completed" can both be visited
    if (state !== "locked") return exercises[i];
  }
  return null;
}

export function Workspace({ track, initialExerciseId }) {
  const { exercises, error } = useExerciseList(track);
  const {
    progressMap,
    summary,
    loading: progressLoading,
    refresh: refreshProgress,
  } = useTrackProgress(track);
  const [chosenId, setChosenId] = useState(initialExerciseId ?? null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState("problem");
  const [focusTerminal, setFocusTerminal] = useState(false);
  const { containerRef, gridStyle, separatorProps } = useSplitPane({
    storageKey: `fl-split-${track}`,
  });

  // Prevent a stale select response from overwriting a newer selection.
  const latestSelectId = useRef(null);

  // Must come before early returns so hooks are always called in the same order.
  const handleProgressUpdate = useCallback(() => {
    refreshProgress();
  }, [refreshProgress]);

  if (!exercises) return <div className="workspace-loading muted">Loading exercises…</div>;
  if (error)
    return (
      <div className="workspace-loading error" data-testid="error-message">
        {error}
      </div>
    );

  const selected = exercises.find((e) => e.id === chosenId) ?? exercises[0];
  const ordinal = selected
    ? exercises.filter((e) => e.level === selected.level).indexOf(selected) + 1
    : 0;

  const selectedProgress = selected ? progressMap.get(selected.id) : undefined;
  const nextExercise = selected ? findNextAvailable(exercises, selected.id, progressMap) : null;

  const pick = (id) => {
    // Guard: never open a locked exercise
    if (progressMap.get(id)?.state === "locked") return;

    setChosenId(id);
    setDrawerOpen(false);
    setMobileTab("problem");

    // Persist resume state in the background. Race-condition safe: we only care that
    // the *last* selection wins; stale responses carry no state we need.
    latestSelectId.current = id;
    api.select(id).catch(() => {
      // Persistence failure is non-fatal; resume just won't be updated.
    });
  };

  const workspaceClass = [
    "workspace",
    collapsed ? "sidebar-collapsed" : "",
    drawerOpen ? "drawer-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={workspaceClass}>
      <ExerciseSidebar
        track={track}
        exercises={exercises}
        selectedId={selected?.id}
        onSelect={pick}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        progressMap={progressMap}
        progressLoading={progressLoading}
        summary={summary}
      />
      {drawerOpen && (
        <button
          type="button"
          className="drawer-scrim"
          aria-label="Close lessons"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className="work-main">
        <div className="work-tabs" role="tablist" aria-label="Workspace panels">
          <button
            type="button"
            className="work-tab lessons-tab"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open lessons"
          >
            ☰ Lessons
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "problem"}
            className={`work-tab ${mobileTab === "problem" ? "active" : ""}`}
            onClick={() => setMobileTab("problem")}
          >
            Problem
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === "terminal"}
            className={`work-tab ${mobileTab === "terminal" ? "active" : ""}`}
            onClick={() => setMobileTab("terminal")}
          >
            Terminal
          </button>
        </div>

        <div
          className={`split ${focusTerminal ? "split--focus-terminal" : ""}`}
          ref={containerRef}
          style={gridStyle}
          data-mobile-tab={mobileTab}
        >
          <div className="split-problem">
            {selected ? (
              <ExercisePanel
                key={selected.id}
                exerciseId={selected.id}
                ordinal={ordinal}
                exerciseProgress={selectedProgress}
                nextExercise={nextExercise}
                onProgressUpdate={handleProgressUpdate}
                onSelectNext={pick}
              />
            ) : (
              <div className="workspace-panel-placeholder muted">
                No exercises available for this track yet.
              </div>
            )}
          </div>

          <div className="split-handle" {...separatorProps}>
            <span className="split-handle-grip" aria-hidden="true" />
          </div>

          <div className="split-terminal">
            <PracticeTerminal
              focused={focusTerminal}
              onToggleFocus={() => setFocusTerminal((f) => !f)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
