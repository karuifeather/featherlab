import { useEffect, useState } from "react";
import "./Launcher.scss";
import { MeshBackground } from "./MeshBackground.jsx";
import { api } from "../api/client.js";

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

/**
 * Fetch resume state and track summary for available tracks.
 * Returns null while loading, or { resume, summary, exerciseTitle } once settled.
 */
function useResumeState() {
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getResume().catch(() => ({ resume: null })),
      api.getTrackProgress("kubernetes").catch(() => null),
    ]).then(([resumeData, progressData]) => {
      if (cancelled) return;
      const resume = resumeData?.resume ?? null;
      let exerciseTitle = null;
      if (resume && progressData) {
        const match = progressData.exercises.find((e) => e.exerciseId === resume.exerciseId);
        exerciseTitle = match?.title ?? null;
      }
      setState({
        resume,
        summary: progressData?.summary ?? null,
        exerciseTitle,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function Launcher({ onEnter }) {
  const [updateInfo, setUpdateInfo] = useState(null);
  const resumeState = useResumeState();

  useEffect(() => {
    api
      .getVersion()
      .then((info) => {
        if (info?.isOutdated) setUpdateInfo(info);
      })
      .catch(() => {});
  }, []);

  const handleEnter = (trackId, initialExerciseId) => {
    onEnter(trackId, initialExerciseId ?? null);
  };

  return (
    <div className="launcher">
      <MeshBackground />
      <div className="launcher-content">
        <div className="eyebrow">
          <span className="status-led green" /> Local practice lab · ready
        </div>
        {updateInfo && (
          <div className="update-nudge" role="status">
            <span className="update-nudge-icon" aria-hidden="true">
              ↑
            </span>
            featherlab {updateInfo.latest} is available — run <code>featherlab update</code>
          </div>
        )}
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
                onClick={() => {
                  const resumeId =
                    resumeState?.resume?.trackId === track.id
                      ? resumeState.resume.exerciseId
                      : null;
                  handleEnter(track.id, resumeId);
                }}
              >
                <TrackBody
                  track={track}
                  resumeState={track.id === "kubernetes" ? resumeState : null}
                />
              </button>
            ) : (
              <div key={track.id} className="track disabled" aria-disabled="true">
                <TrackBody track={track} resumeState={null} />
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

function TrackBody({ track, resumeState }) {
  const hasResume =
    resumeState !== null && resumeState !== undefined && resumeState?.resume !== null;
  const summary = resumeState?.summary;
  const completedCount = summary?.completed ?? 0;
  const totalCount = summary?.total ?? 0;

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

      {hasResume ? (
        <div className="track-resume">
          {totalCount > 0 && (
            <span className="track-progress-count">
              {completedCount} of {totalCount} completed
            </span>
          )}
          <span className="track-cta track-cta--resume">
            Continue Learning{" "}
            <span className="track-arrow" aria-hidden="true">
              →
            </span>
          </span>
          {resumeState.exerciseTitle && (
            <span
              className="track-resume-title"
              aria-label={`Resume: ${resumeState.exerciseTitle}`}
            >
              {resumeState.exerciseTitle}
            </span>
          )}
        </div>
      ) : (
        <span className="track-cta">
          Enter workspace{" "}
          <span className="track-arrow" aria-hidden="true">
            →
          </span>
        </span>
      )}
    </>
  );
}
