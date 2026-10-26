import { useState } from "react";
import "./Workspace.scss";
import { ExercisePanel } from "../exercises/ExercisePanel.jsx";
import { ExerciseSidebar } from "../exercises/ExerciseSidebar.jsx";
import { useExerciseList } from "../exercises/useExerciseList.js";
import { PracticeTerminal } from "../terminal/PracticeTerminal.jsx";
import { useSplitPane } from "./useSplitPane.js";

export function Workspace({ track }) {
  const { exercises, error } = useExerciseList(track);
  const [chosenId, setChosenId] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState("problem");
  const [focusTerminal, setFocusTerminal] = useState(false);
  const { containerRef, gridStyle, separatorProps } = useSplitPane({
    storageKey: `fl-split-${track}`,
  });

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

  const pick = (id) => {
    setChosenId(id);
    setDrawerOpen(false);
    setMobileTab("problem");
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
              <ExercisePanel key={selected.id} exerciseId={selected.id} ordinal={ordinal} />
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
