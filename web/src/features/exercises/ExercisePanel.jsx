import { useEffect, useRef, useState } from "react";
import "./ExercisePanel.scss";
import { api } from "../../api/client.js";
import { Inline, Markdown } from "../../components/Markdown.jsx";
import { CheckResults } from "./CheckResults.jsx";
import { CompletionFeedback } from "./CompletionFeedback.jsx";
import { Hints } from "./Hints.jsx";
import { useAction } from "./useAction.js";

/**
 * One exercise: statement, requirements, hints, grading and reset. Mount it with
 * `key={exerciseId}` so switching exercises starts from clean state. It never touches the
 * terminal, which lives alongside it in the workspace.
 */
export function ExercisePanel({
  exerciseId,
  ordinal,
  exerciseProgress,
  nextExercise,
  onProgressUpdate,
  onSelectNext,
}) {
  const [exercise, setExercise] = useState(null);
  const [setup, setSetup] = useState({ state: "preparing", message: "" });
  const [loadError, setLoadError] = useState("");
  const [result, setResult] = useState(null);
  // Track whether this exercise was already completed before this grading session.
  // Captured once on mount (from exerciseProgress); stable for the lifetime of this key.
  const alreadyCompletedRef = useRef(exerciseProgress?.completed ?? false);
  const [firstCompletion, setFirstCompletion] = useState(false);

  // When track progress loads after the initial mount (parallel fetch), update the ref so a
  // previously-completed exercise does not falsely trigger the first-completion banner.
  useEffect(() => {
    if (exerciseProgress?.completed) {
      alreadyCompletedRef.current = true;
    }
  }, [exerciseProgress]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getExercise(exerciseId);
        if (cancelled) return;
        setExercise(data.exercise);
      } catch (e) {
        if (!cancelled) setLoadError(e.message);
        return;
      }
      // Activation is idempotent: it (re)creates whatever the exercise needs.
      try {
        await api.activate(exerciseId);
        if (!cancelled) setSetup({ state: "ready", message: "" });
      } catch (e) {
        if (!cancelled) setSetup({ state: "failed", message: e.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  const check = useAction(async () => {
    const data = await api.check(exerciseId);
    setResult(data.result);
    // Detect first-time completion: the result carries a progress field with completed=true
    // and this exercise was not already completed at session start.
    if (data.result.success && data.result.progress?.completed && !alreadyCompletedRef.current) {
      setFirstCompletion(true);
      alreadyCompletedRef.current = true;
      // Ask Workspace to refresh the track progress so new unlocks appear.
      onProgressUpdate?.();
    } else if (data.result.success && data.result.progress) {
      // Repeat success: refresh progress for updated stats, no first-completion banner.
      onProgressUpdate?.();
    }
  });

  const reset = useAction(async () => {
    await api.reset(exerciseId);
    setResult(null);
    setSetup({ state: "ready", message: "" });
  });

  // Activation holds the server-side lock for this exercise; wait for it instead of
  // letting a click race it into a "busy" error.
  const disabled = check.busy || reset.busy || setup.state === "preparing";

  if (loadError)
    return (
      <div className="problem" data-testid="exercise-panel">
        <div className="error" data-testid="error-message">
          {loadError}
        </div>
      </div>
    );
  if (!exercise)
    return (
      <div className="problem" data-testid="exercise-panel">
        <div className="problem-scroll">
          <ExercisePanelSkeleton />
        </div>
      </div>
    );

  return (
    <div className="problem" data-testid="exercise-panel">
      <div className="problem-scroll">
        <div className="crumb">
          <span>Level {exercise.level}</span>
          <span className="crumb-sep">/</span>
          <span>Exercise {String(ordinal).padStart(2, "0")}</span>
          {exercise.estimatedMinutes ? (
            <>
              <span className="crumb-sep">/</span>
              <span>~{exercise.estimatedMinutes} min</span>
            </>
          ) : null}
        </div>

        <div className="problem-header">
          <h1>{exercise.title}</h1>
          <span className="difficulty">{exercise.difficulty}</span>
        </div>

        {exercise.summary && <p className="problem-summary">{exercise.summary}</p>}

        <Markdown source={exercise.description} />

        <div className="requirements" data-testid="requirements">
          <h3>Requirements</h3>
          <ul>
            {exercise.requirements.map((requirement) => (
              <li key={requirement}>
                <Inline text={requirement} />
              </li>
            ))}
          </ul>
        </div>

        {setup.state === "failed" && (
          <div className="error" data-testid="error-message">
            Could not prepare the environment: {setup.message}
          </div>
        )}

        <Hints exerciseId={exercise.id} total={exercise.hintCount} />

        {result && <CheckResults result={result} />}

        {result?.success && (
          <CompletionFeedback
            firstCompletion={firstCompletion}
            nextExercise={nextExercise}
            onNext={onSelectNext}
          />
        )}

        {(check.error || reset.error) && (
          <div className="error" data-testid="error-message">
            {check.error || reset.error}
          </div>
        )}
      </div>

      <div className="problem-actions">
        <div className={`action-progress ${check.busy ? "active" : ""}`} aria-hidden="true">
          <span className="action-progress-bar" />
        </div>
        <div className="action-buttons">
          <button
            className="check-btn"
            data-busy={check.busy ? "true" : undefined}
            disabled={disabled}
            onClick={check.run}
          >
            {check.busy ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                Checking…
              </>
            ) : (
              "Check solution"
            )}
          </button>
          <button className="reset-btn" disabled={disabled} onClick={reset.run}>
            {reset.busy ? "Resetting…" : "Reset task"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExercisePanelSkeleton() {
  return (
    <div className="problem-skeleton" aria-hidden="true">
      <div className="sk sk-crumb" />
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      <div className="sk sk-line short" />
      <div className="sk sk-block" />
    </div>
  );
}
