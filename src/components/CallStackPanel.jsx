export default function CallStackPanel({ callStack }) {
  const frames = callStack ? [...callStack].reverse() : [];

  return (
    <div className="panel panel-callstack">
      <div className="panel-title"><span className="panel-icon"></span> call stack</div>
      <div className="callstack-content" id="callStackContent">
        {frames.length === 0 ? (
          <div className="empty-state">—</div>
        ) : (
          frames.map((frame, i) => (
            <div className={`stack-frame ${i === 0 ? 'active' : ''}`} key={i}>
              <div className="stack-frame-name">{frame.name || '(anonymous)'}</div>
              <div className="stack-frame-loc">line {frame.line}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
