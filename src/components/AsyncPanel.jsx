export default function AsyncPanel({ promises = [] }) {
  return (
    <div className="panel panel-async">
      <div className="panel-title">
        <span className="panel-icon">&#9889;</span> PROMISES
      </div>
      <div className="async-content panel-scroll-content">
        {promises.length === 0 ? (
          <div className="empty-state">No active promises.</div>
        ) : (
          promises.map(p => (
            <div key={p.id} className="promise-item">
              <span className="promise-id">Promise #{p.id}</span>
              <span className={`promise-state state-${p.state}`}>({p.state})</span>
              {p.value !== null && <span className="promise-value"> &#8594; {p.value}</span>}
              {p.parentId && <span className="promise-parent" title={`Child of Promise #${p.parentId}`}> &#8627; #{p.parentId}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
