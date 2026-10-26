import "./Launcher.scss";

export function Launcher({ onEnter }) {
  return (
    <div className="launcher">
      <div className="eyebrow">YOUR LOCAL PRACTICE LAB</div>
      <h1>
        Build the skills.
        <br />
        <em>Prove them in the terminal.</em>
      </h1>
      <p>Real Kubernetes, practical exercises, no cloud account. Pick a track to get started.</p>
      <div className="tracks">
        <button className="track" onClick={() => onEnter("kubernetes")}>
          <div className="track-icon">☸</div>
          <h2>Kubernetes</h2>
          <p>CKA / CKS learning, practice and troubleshooting.</p>
          <span className="track-link">Enter workspace →</span>
        </button>
        <div className="track disabled">
          <div className="track-icon">▤</div>
          <h2>PostgreSQL</h2>
          <p>SQL, administration, optimization and diagnostics.</p>
          <span className="muted">Planned for later</span>
        </div>
      </div>
      <footer>No signup · No tracking · Data stays on your machine</footer>
    </div>
  );
}
