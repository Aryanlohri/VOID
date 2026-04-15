export default function BottomBar({ breakpoints, timelineEvents, onToggleBreakpoint }) {
  const bps = [...breakpoints].sort((a, b) => a - b);

  return (
    <div className="bottom-bar">
      <div className="panel panel-breakpoints">
        <div className="panel-title"><span className="panel-icon">&#9679;</span> BREAKPOINTS</div>
        <div className="bp-list" id="bpList">
          {bps.length === 0 ? (
            <span className="empty-state">None set.</span>
          ) : (
            bps.map(line => (
              <div
                className="bp-chip"
                key={line}
                onClick={() => onToggleBreakpoint(line)}
              >
                ● L{line}
                <span className="bp-remove" title="Remove">✕</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="panel panel-timeline">
        <div className="panel-title"><span className="panel-icon">&#9632;</span> EXECUTION TIMELINE</div>
        <div className="timeline" id="timeline">
          {timelineEvents.map((ev, i) => (
            <div
              className={`tl-block ${ev.type}`}
              key={i}
              title={`${ev.type} @ ${new Date(ev.time).toISOString().slice(11, 23)}`}
            >
              {ev.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
