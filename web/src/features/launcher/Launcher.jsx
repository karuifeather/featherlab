import { useEffect, useState } from "react";
import "./Launcher.scss";
import { api } from "../../api/client.js";
import { Curriculum } from "./Curriculum.jsx";
import { TRACKS } from "./tracks.js";
import { hasStarted, useLauncherData } from "./useLauncherData.js";

const TRACK_IDS = TRACKS.map((t) => t.id);

/**
 * Workspace home: one row per track with its real progress and a Start/Continue action,
 * then the curriculum of the track the learner is working in. All counts, states and the
 * resume target come from the API; nothing is shown that the backend did not report.
 */
export function Launcher({ onEnter }) {
  const [updateInfo, setUpdateInfo] = useState(null);
  const data = useLauncherData(TRACK_IDS);

  useEffect(() => {
    api
      .getVersion()
      .then((info) => {
        if (info?.isOutdated) setUpdateInfo(info);
      })
      .catch(() => {});
  }, []);

  // The curriculum follows the resumed track, else the first one.
  const activeTrack = TRACKS.find((t) => t.id === data?.resume?.trackId) ?? TRACKS[0];
  const activeProgress = data?.progress[activeTrack.id];

  const openExercise = (trackId, exerciseId) => {
    // An explicit pick from the curriculum is a selection, exactly as in the sidebar:
    // persist it so Continue Learning resumes here. Failure only loses the resume update.
    api.select(exerciseId).catch(() => {});
    onEnter(trackId, exerciseId);
  };

  return (
    <div className="launcher">
      <div className="launcher-content page-container">
        {updateInfo && (
          <div className="update-nudge" role="status">
            <span aria-hidden="true">↑</span> featherlab {updateInfo.latest} is available — run{" "}
            <code>featherlab update</code>
          </div>
        )}

        <section className="launcher-section" aria-labelledby="launcher-workspaces">
          <h1 id="launcher-workspaces" className="section-label">
            Workspaces
          </h1>
          <div className="track-list">
            {TRACKS.map((track) => (
              <TrackRow
                key={track.id}
                track={track}
                data={data}
                onEnter={(exerciseId) => onEnter(track.id, exerciseId)}
              />
            ))}
          </div>
        </section>

        {activeProgress && activeProgress.exercises.length > 0 && (
          <section className="launcher-section" aria-labelledby="launcher-curriculum">
            <div className="section-head">
              <h2 id="launcher-curriculum" className="section-label">
                Curriculum
              </h2>
              <span className="section-meta">
                {activeTrack.name} · {activeProgress.summary.total} exercises
              </span>
            </div>
            <Curriculum
              exercises={activeProgress.exercises}
              currentId={
                hasStarted(data.resume, activeProgress.summary, activeTrack.id)
                  ? data.resume.exerciseId
                  : null
              }
              onOpen={(exerciseId) => openExercise(activeTrack.id, exerciseId)}
            />
          </section>
        )}

        <footer className="launcher-footer">
          Runs locally · No account · Data stays on this machine
        </footer>
      </div>
    </div>
  );
}

function TrackRow({ track, data, onEnter }) {
  const loading = data === null;
  const progress = data?.progress[track.id] ?? null;
  const summary = progress?.summary ?? null;
  const resume = data?.resume?.trackId === track.id ? data.resume : null;
  const started = hasStarted(resume, summary, track.id);
  // The backend resolves the destination (explicit selection, or its first-available
  // fallback); without persistence it is null and the workspace opens on the first exercise.
  const target = resume?.exerciseId ?? null;
  const targetInfo = progress?.exercises.find((e) => e.exerciseId === target) ?? null;
  const percent =
    summary && summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;

  return (
    <article className="track-row" aria-labelledby={`track-${track.id}`}>
      <div className="track-row-main">
        <span className="track-icon" aria-hidden="true">
          {track.glyph}
        </span>
        <div className="track-row-text">
          <h2 id={`track-${track.id}`} className="track-name">
            {track.name}
          </h2>
          {/* The cluster name stays available on hover; the line itself stays short. */}
          <p
            className="track-meta"
            title={data?.cluster ? `kind cluster: ${data.cluster}` : undefined}
          >
            {track.description}
            {data?.cluster && " · Local kind cluster"}
          </p>
        </div>
      </div>

      <div className="track-row-progress">
        {summary && summary.total > 0 && (
          <>
            <div
              className="track-meter"
              role="progressbar"
              aria-label={`${track.name} progress`}
              aria-valuemin={0}
              aria-valuemax={summary.total}
              aria-valuenow={summary.completed}
              aria-valuetext={`${summary.completed} of ${summary.total} completed`}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="track-count" data-testid="track-progress-count">
              {summary.completed} of {summary.total} completed
            </span>
          </>
        )}
      </div>

      <div className="track-row-action">
        {targetInfo && (
          <span className="track-target" data-testid="resume-target">
            <span className="track-target-label">{started ? "Resume" : "Start with"}</span>
            <span className="track-target-title">{targetInfo.title}</span>
          </span>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={loading}
          onClick={() => onEnter(target)}
        >
          {loading ? "Loading…" : started ? "Continue Learning" : "Start Learning"}
          {!loading && (
            <span className="btn-arrow" aria-hidden="true">
              →
            </span>
          )}
        </button>
      </div>
    </article>
  );
}
