export default function VariablesPanel({ variables }) {
  const entries = Object.entries(variables || {});

  return (
    <div className="panel panel-vars">
      <div className="panel-title"><span className="panel-icon">&#9632;</span> VARIABLES</div>
      <div className="vars-content" id="varsContent">
        {entries.length === 0 ? (
          <div className="empty-state">No variables in scope.</div>
        ) : (
          entries.map(([name, v]) => (
            <div className="var-row" key={name}>
              <span className="var-name">{name}</span>
              <span className="var-type">{v.type || 'unknown'}</span>
              <span className={`var-value ${v.type || ''}`}>
                {v.v !== undefined ? String(v.v) : '—'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
