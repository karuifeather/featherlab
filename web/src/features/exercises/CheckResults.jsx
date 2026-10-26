import { useEffect, useRef, useState } from "react";
import "./CheckResults.scss";

const ICON = { passed: "✓", failed: "○", error: "!" };

// IMPORTANT: these exact strings are asserted by the E2E suite. Do not reword them.
function heading(result) {
  if (result.success) return "✓ Passed";
  if (result.outcome === "incomplete") return "Could not finish grading";
  return `${result.counts.passed}/${result.counts.total} checks passed · ${result.score.percent}%`;
}

export function CheckResults({ result }) {
  const incomplete = result.outcome === "incomplete";

  // Detect checks that flipped to passing since the previous attempt, so a retry can
  // celebrate exactly what the learner just fixed instead of re-animating everything.
  const prevStatuses = useRef(null);
  const rootRef = useRef(null);
  const [pulse, setPulse] = useState(() => new Set());

  // Reveal results as soon as they arrive, even if they were below the fold.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [result]);

  useEffect(() => {
    const prev = prevStatuses.current;
    if (prev) {
      const flipped = new Set(
        result.checks
          .filter((c) => c.status === "passed" && prev[c.id] && prev[c.id] !== "passed")
          .map((c) => c.id),
      );
      if (flipped.size) {
        setPulse(flipped);
        const t = setTimeout(() => setPulse(new Set()), 650);
        prevStatuses.current = Object.fromEntries(result.checks.map((c) => [c.id, c.status]));
        return () => clearTimeout(t);
      }
    }
    prevStatuses.current = Object.fromEntries(result.checks.map((c) => [c.id, c.status]));
  }, [result]);

  return (
    <section
      ref={rootRef}
      className="results"
      data-testid="check-results"
      data-outcome={result.outcome}
      data-success={String(result.success)}
      aria-live="polite"
    >
      <div className="results-head">
        <h3>{heading(result)}</h3>
        {!incomplete && (
          <span className="results-score" aria-hidden="true">
            {result.counts.passed}/{result.counts.total}
          </span>
        )}
      </div>

      {!incomplete && (
        <div className={`results-meter ${result.success ? "is-full" : ""}`} aria-hidden="true">
          <span style={{ width: `${result.score.percent}%` }} />
        </div>
      )}

      <div className="checks">
        {result.checks.map((check, i) => (
          <div
            className={`check status-${check.status} ${pulse.has(check.id) ? "pulse" : ""}`}
            style={{ "--i": i }}
            key={check.id}
          >
            <span className="check-icon" aria-hidden="true">
              {ICON[check.status] ?? "•"}
            </span>
            <div className="check-body">
              <span className="check-label">{check.label}</span>
              {check.status !== "passed" && <div className="feedback">{check.feedback}</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
