import { useCallback, useEffect, useRef, useState } from "react";
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
 *
 * The practice cluster is shared, so opening this exercise may have to reset another one
 * that holds it. The server refuses that unless asked; the panel then shows a confirmation
 * (setup state "confirm") instead of discarding the learner's work. `switchConfirmed` skips
 * it when the learner already chose to move on (e.g. "Next exercise" after a pass).
 */
export function ExercisePanel({
  exerciseId,
  ordinal,
  exerciseProgress,
  nextExercise,
  onProgressUpdate,
  onSelectNext,
  onOpenExercise,
  titleOf = () => null,
  switchConfirmed = false,
}) {
  const [exercise, setExercise] = useState(null);
  // state: preparing | ready | failed | confirm (another exercise holds the environment)
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

  // False once unmounted, so a late activation response cannot touch a stale panel.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Only the first activation of this mount may skip the confirmation.
  const switchConfirmedRef = useRef(switchConfirmed);

  const prepare = useCallback(
    async ({ discardActive = false } = {}) => {
      setSetup({ state: "preparing", message: "" });
      try {
        const opened = await api.activate(exerciseId, { discardActive });
        // `recreated`: the saved environment was missing (e.g. after an upgrade), so it was
        // prepared again from scratch; say so instead of silently losing the old state.
        if (mounted.current)
          setSetup({ state: "ready", message: "", recreated: opened?.recreated === true });
      } catch (e) {
        if (!mounted.current) return;
        if (e.code === "ENVIRONMENT_IN_USE")
          setSetup({
            state: "confirm",
            message: e.message,
            activeExerciseId: e.details?.activeExerciseId,
          });
        else setSetup({ state: "failed", message: e.message });
      }
    },
    [exerciseId],
  );

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
      // Reopening the exercise that holds the environment keeps the learner's work.
      await prepare({ discardActive: switchConfirmedRef.current });
    })();
    return () => {
      cancelled = true;
    };
  }, [exerciseId, prepare]);

  /** Another tab or the CLI took the environment: go back through the confirmation. */
  const lostEnvironment = (e) =>
    e.code === "EXERCISE_NOT_ACTIVE" || e.code === "ENVIRONMENT_IN_USE";

  const check = useAction(async () => {
    let data;
    try {
      data = await api.check(exerciseId);
    } catch (e) {
      if (!lostEnvironment(e)) throw e;
      setResult(null);
      await prepare();
      return;
    }
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
    try {
      await api.reset(exerciseId);
    } catch (e) {
      if (!lostEnvironment(e)) throw e;
      setResult(null);
      await prepare();
      return;
    }
    setResult(null);
    setSetup({ state: "ready", message: "" });
  });

  // Activation holds the server-side lock for this exercise; wait for it instead of
  // letting a click race it into a "busy" error.
  const disabled =
    check.busy || reset.busy || setup.state === "preparing" || setup.state === "confirm";

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

        {setup.state === "confirm" && (
          <EnvironmentConfirm
            activeTitle={titleOf(setup.activeExerciseId)}
            message={setup.message}
            onStart={() => prepare({ discardActive: true })}
            onBack={
              setup.activeExerciseId && onOpenExercise
                ? () => onOpenExercise(setup.activeExerciseId)
                : undefined
            }
          />
        )}

        {setup.state === "ready" && setup.recreated && (
          <p className="muted" data-testid="environment-recreated">
            This exercise&apos;s practice environment was missing (for example after a FeatherLab
            upgrade), so it was prepared again from scratch.
          </p>
        )}

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

function EnvironmentConfirm({ activeTitle, message, onStart, onBack }) {
  return (
    <section
      className="env-confirm"
      data-testid="environment-confirm"
      aria-labelledby="env-confirm-title"
    >
      <h3 id="env-confirm-title">
        {activeTitle
          ? `Your cluster is set up for “${activeTitle}”`
          : "Your cluster is set up for another exercise"}
      </h3>
      <p>
        {activeTitle
          ? "Starting this exercise resets that exercise's Kubernetes resources, including any unfinished work. Your progress and history stay saved."
          : message}
      </p>
      <div className="env-confirm-actions">
        <button type="button" className="check-btn" onClick={onStart}>
          Start this exercise
        </button>
        {onBack && (
          <button type="button" className="reset-btn" onClick={onBack}>
            {activeTitle ? `Back to “${activeTitle}”` : "Go back"}
          </button>
        )}
      </div>
    </section>
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
