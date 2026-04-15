export default function BottomBar({ breakpoints, breakpointData, timelineEvents, onToggleBreakpoint }) {
  const bps = (breakpointData || []).sort((a, b) => a.line - b.line);

  const typeIcons = { normal: '●', conditional: '◆', logpoint: '◇', hitcount: '◈' };
  const typeLabels = {
    normal: '', conditional: 'cond', logpoint: 'log', hitcount: 'hit'
  };

  return (
    <div className="bottom-bar">
      <div className="panel panel-breakpoints">
        <div className="panel-title"><span className="panel-icon">&#9679;</span> BREAKPOINTS</div>
        <div className="bp-list" id="bpList">
          {bps.length === 0 ? (
            <span className="empty-state">None set. Click a line number or right-click for options.</span>
          ) : (
            bps.map(bp => (
              <div
                className={`bp-chip bp-chip-${bp.type}`}
                key={bp.id}
                onClick={() => onToggleBreakpoint(bp.line)}
                title={
                  bp.type === 'conditional' ? `Condition: ${bp.condition}` :
                  bp.type === 'logpoint' ? `Log: ${bp.logMessage}` :
                  bp.type === 'hitcount' ? `Break at hit #${bp.hitTarget} (current: ${bp.hitCount})` :
                  `Line ${bp.line}`
                }
              >
                <span className="bp-chip-icon">{typeIcons[bp.type] || '●'}</span>
                L{bp.line}
                {bp.type !== 'normal' && (
                  <span className="bp-chip-type">{typeLabels[bp.type]}</span>
                )}
                {bp.type === 'conditional' && bp.condition && (
                  <span className="bp-chip-detail">{bp.condition.slice(0, 15)}</span>
                )}
                {bp.type === 'logpoint' && bp.logMessage && (
                  <span className="bp-chip-detail">{bp.logMessage.slice(0, 15)}</span>
                )}
                {bp.type === 'hitcount' && (
                  <span className="bp-chip-detail">#{bp.hitTarget}</span>
                )}
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
