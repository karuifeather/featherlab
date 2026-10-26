import { useState } from "react";
import "./Workspace.scss";
import { ExercisePanel } from "../exercises/ExercisePanel.jsx";
import { ExerciseSidebar } from "../exercises/ExerciseSidebar.jsx";
import { useExerciseList } from "../exercises/useExerciseList.js";
import { PracticeTerminal } from "../terminal/PracticeTerminal.jsx";

export function Workspace({ track }) {
  const { exercises, error } = useExerciseList(track);
  const [chosenId, setChosenId] = useState(null);

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

  return (
    <div className="workspace">
      <ExerciseSidebar
        track={track}
        exercises={exercises}
        selectedId={selected?.id}
        onSelect={setChosenId}
      />
      {selected ? (
        <ExercisePanel key={selected.id} exerciseId={selected.id} ordinal={ordinal} />
      ) : (
        <div className="workspace-panel-placeholder muted">
          No exercises available for this track yet.
        </div>
      )}
      <PracticeTerminal />
    </div>
  );
}
