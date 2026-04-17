export default function NetworkPanel({ networkRequests = [] }) {
  return (
    <div className="panel panel-network">
      <div className="panel-title">
        <span className="panel-icon">&#127760;</span> NETWORK
      </div>
      <div className="network-content panel-scroll-content">
        {networkRequests.length === 0 ? (
          <div className="empty-state">No network requests.</div>
        ) : (
          networkRequests.map(req => (
            <div key={req.id} className="network-item">
              <div className="network-header">
                <span className={`status-badge status-${req.status}`}>{req.status}</span>
                <span className="network-method">{req.method}</span>
                <span className="network-url" title={req.url}>{req.url}</span>
                <span className="network-time">{req.duration ? `${req.duration.toFixed(1)}ms` : '...'}</span>
              </div>
              {req.response && (
                <div className="network-response">{req.response}</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
