const ICON = { passed: "✓", failed: "○", error: "!" };

function heading(result) {
  if (result.success) return "✓ Passed";
  if (result.outcome === "incomplete") return "Could not finish grading";
  return `${result.counts.passed}/${result.counts.total} checks passed · ${result.score.percent}%`;
}

export function CheckResults({ result }) {
  return (
    <section className="results">
      <h3>{heading(result)}</h3>
      {result.checks.map((check) => (
        <div className="check" key={check.id}>
          <span className={check.status === "passed" ? "passed" : "failed"}>
            {ICON[check.status]}
          </span>
          <div>
            {check.label}
            {check.status !== "passed" && <div className="feedback">{check.feedback}</div>}
          </div>
        </div>
      ))}
    </section>
  );
}
