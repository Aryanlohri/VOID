import { useRef, useEffect, useState } from 'react';

export default function ConsolePanel({
  consoleLines, onEvaluate, onClear, historyUp, historyDown
}) {
  const outputRef = useRef(null);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [consoleLines]);

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      const expr = input.trim();
      if (!expr) return;
      onEvaluate(expr);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const val = historyUp();
      if (val) setInput(val);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setInput(historyDown() || '');
    }
  };

  const prefixes = { log: '●', info: 'ℹ', warn: '⚠', error: '✗', result: '→', exec: '»' };

  return (
    <div className="panel panel-console">
      <div className="panel-title">
        <span className="panel-icon">&#9658;</span> CONSOLE
        <button className="panel-btn" onClick={onClear}>CLR</button>
      </div>
      <div className="console-output" id="consoleOutput" ref={outputRef}>
        {consoleLines.map((line, i) => (
          <div className={`console-line ${line.type}`} key={i}>
            <span className="ts">{line.ts}</span>
            <span className="prefix">{prefixes[line.type] || '·'}</span>
            {line.msg}
          </div>
        ))}
      </div>
      <div className="console-input-row">
        <span className="prompt">&gt;&gt;&gt;</span>
        <input
          type="text"
          id="consoleInput"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="evaluate expression..."
        />
      </div>
    </div>
  );
}
