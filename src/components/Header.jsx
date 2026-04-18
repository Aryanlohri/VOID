import { useState, useEffect } from 'react';

export default function Header({ engineState }) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const update = () => setClock(new Date().toLocaleTimeString('en-US', { hour12: false }));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const statusClass = engineState === 'running' ? 'running'
    : engineState === 'paused' ? 'paused'
    : engineState === 'stopped' ? 'stopped'
    : 'ready';

  const statusLabel = {
    idle: 'ready', running: 'running', paused: 'paused', stepping: 'stepping'
  }[engineState] || 'ready';

  const mem = typeof performance !== 'undefined' && performance.memory
    ? `mem ${(performance.memory.usedJSHeapSize / 1048576).toFixed(1)}mb`
    : 'mem —';

  return (
    <header className="header" id="headerBar">
      <div className="logo">
        <span className="logo-bracket">[</span>
        <span className="logo-text">VOID</span>
        <span className="logo-sub">debugger v2.0.0</span>
        <span className="logo-bracket">]</span>
      </div>
      <div className="header-status">
        <span className={`status-dot ${statusClass}`}>●</span>
        <span>{statusLabel}</span>
        <span className="sep">|</span>
        <span>{mem}</span>
        <span className="sep">|</span>
        <span>{clock}</span>
      </div>
    </header>
  );
}
