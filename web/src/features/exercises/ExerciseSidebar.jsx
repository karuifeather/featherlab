export function ExerciseSidebar({ track, exercises, selectedId, onSelect }) {
  const levels = Map.groupBy(exercises, (e) => e.level);
  return (
    <aside className="sidebar">
      <div className="sidebar-head">{track.toUpperCase()}</div>
      {[...levels].map(([level, items]) => (
        <div key={level}>
          <div className="level active">
            <span>▾</span> Level {level}
          </div>
          {items.map((exercise, i) => (
            <button
              key={exercise.id}
              className={`lesson ${exercise.id === selectedId ? "selected" : ""}`}
              onClick={() => onSelect(exercise.id)}
            >
              {String(i + 1).padStart(2, "0")} <span>{exercise.title}</span>
            </button>
          ))}
        </div>
      ))}
      <div className="sidebar-bottom">☸ kind · isolated cluster</div>
    </aside>
  );
}
