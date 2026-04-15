import { useState } from 'react';
import { formatValue } from '../lib/helpers.js';

export default function WatchPanel({ watchExprs, onAdd, onRemove, evaluateWatch }) {
  const [showInput, setShowInput] = useState(false);
  const [inputVal, setInputVal] = useState('');

  const handleAdd = () => {
    if (inputVal.trim()) {
      onAdd(inputVal.trim());
      setInputVal('');
      setShowInput(false);
    }
  };

  return (
    <div className="panel panel-watch">
      <div className="panel-title">
        <span className="panel-icon">&#9670;</span> WATCH
        <button className="panel-btn" onClick={() => setShowInput(!showInput)}>+ ADD</button>
      </div>
      <div className="watch-content" id="watchContent">
        {watchExprs.length === 0 ? (
          <div className="empty-state">No watch expressions.</div>
        ) : (
          watchExprs.map((expr, idx) => {
            const res = evaluateWatch(expr);
            return (
              <div className="watch-row" key={idx}>
                <span className="watch-expr">{expr}</span>
                <span className={`watch-val ${res.ok ? '' : 'err'}`}>
                  {res.ok ? formatValue(res.value) : `Error: ${res.error}`}
                </span>
                <span className="watch-del" onClick={() => onRemove(idx)} title="Remove">×</span>
              </div>
            );
          })
        )}
      </div>
      {showInput && (
        <div className="watch-input-row">
          <input
            type="text"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="expression..."
            autoFocus
          />
          <button onClick={handleAdd}>OK</button>
        </div>
      )}
    </div>
  );
}
