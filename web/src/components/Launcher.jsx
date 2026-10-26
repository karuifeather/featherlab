import "./Launcher.scss";
import { MeshBackground } from "./MeshBackground.jsx";

const TRACKS = [
  {
    id: "kubernetes",
    glyph: "☸",
    name: "Kubernetes",
    blurb: "CKA / CKS learning, practice and troubleshooting against a real cluster.",
    tags: ["CKA", "CKS", "kubectl"],
    available: true,
  },
  {
    id: "postgres",
    glyph: "▤",
    name: "PostgreSQL",
    blurb: "SQL, administration, optimization and diagnostics.",
    tags: ["SQL", "tuning"],
    available: false,
  },
  {
    id: "linux",
    glyph: "⌘",
    name: "Linux",
    blurb: "Shell fluency, processes, networking and system troubleshooting.",
    tags: ["bash", "systemd"],
    available: false,
  },
];

export function Launcher({ onEnter }) {
  return (
    <div className="launcher">
      <MeshBackground />
      <div className="launcher-content">
        <div className="eyebrow">
          <span className="status-led green" /> Local practice lab · ready
        </div>
        <h1>
          Build the skills.
          <br />
          <em>Prove them in the terminal.</em>
        </h1>
        <p className="launcher-lead">
          Real Kubernetes, practical exercises, no cloud account. Everything runs in an isolated
          cluster on your own machine. Pick a track to open the workspace.
        </p>

        <div className="tracks" role="group" aria-label="Practice tracks">
          {TRACKS.map((track) =>
            track.available ? (
              <button
                key={track.id}
                type="button"
                className="track"
                onClick={() => onEnter(track.id)}
              >
                <TrackBody track={track} />
                <span className="track-cta">
                  Enter workspace{" "}
                  <span className="track-arrow" aria-hidden="true">
                    →
                  </span>
                </span>
              </button>
            ) : (
              <div key={track.id} className="track disabled" aria-disabled="true">
                <TrackBody track={track} />
                <span className="track-soon">Planned for later</span>
              </div>
            ),
          )}
        </div>

        <footer className="launcher-footer">
          No signup · No tracking · Data stays on your machine
        </footer>
      </div>
    </div>
  );
}

function TrackBody({ track }) {
  return (
    <>
      <div className="track-top">
        <span className="track-glyph" aria-hidden="true">
          {track.glyph}
        </span>
        {track.available ? (
          <span className="track-badge available">Available</span>
        ) : (
          <span className="track-badge">Soon</span>
        )}
      </div>
      <h2>{track.name}</h2>
      <p>{track.blurb}</p>
      <div className="track-tags" aria-hidden="true">
        {track.tags.map((tag) => (
          <span className="track-tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
    </>
  );
}
