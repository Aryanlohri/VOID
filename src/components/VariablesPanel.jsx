import { useState } from 'react';

function ObjectTree({ name, value, root = false }) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => setExpanded(!expanded);

  let type = typeof value;
  let preview = String(value);
  let isExpandable = false;

  let badgeType = typeof value;
  if (value === null) badgeType = 'null';

  if (value === null) { type = 'null'; preview = 'null'; }
  else if (value === undefined) { type = 'undefined'; preview = 'undefined'; }
  else if (type === 'string') { type = 'str'; preview = `"${value}"`; }
  else if (type === 'number' || type === 'boolean') { type = type === 'boolean' ? 'bool' : 'number'; }
  else if (type === 'function') {
    type = 'fn';
    preview = `[Function: ${value.name || 'anonymous'}]`;
    isExpandable = true;
  } else if (Array.isArray(value)) {
    type = 'array';
    preview = `Array(${value.length})`;
    isExpandable = true;
  } else if (type === 'object') {
    type = 'object';
    isExpandable = true;
    try {
      const keys = Object.keys(value).slice(0, 3).join(', ');
      preview = `{${keys}${Object.keys(value).length > 3 ? ', …' : ''}}`;
    } catch {
      preview = '[Object]';
    }
  }

  return (
    <div className={`obj-tree ${root ? 'root' : ''}`}>
      <div 
        className="var-row"
        onClick={isExpandable ? toggle : undefined} 
        style={{ cursor: isExpandable ? 'pointer' : 'default', padding: '3px 6px', justifyContent: 'flex-start' }}
      >
        <span 
          className="expand-icon" 
          style={{ visibility: isExpandable ? 'visible' : 'hidden', display: 'inline-block', width: '12px', fontSize: '9px', color: 'var(--text-dim)' }}
        >
          {expanded ? '▼' : '▶'}
        </span>
        <span className="var-name">{name}</span>
        <span className="var-type" style={{ background: 'transparent', border: 'none', padding: '0 4px' }}>:</span>
        <div className="var-val-wrapper">
          <span className={`var-value ${type}`}>{preview}</span>
          <span className={`var-type-badge type-${badgeType}`}>{badgeType}</span>
        </div>
      </div>
      
      {expanded && isExpandable && (
        <div className="obj-children" style={{ paddingLeft: '16px', borderLeft: '1px solid rgba(255,255,255,0.05)', marginLeft: '6px' }}>
          {Object.getOwnPropertyNames(value).map(key => {
            let childVal;
            try { childVal = value[key]; } catch(e) { childVal = e; }
            return <ObjectTree key={key} name={key} value={childVal} />;
          })}
          {Object.getPrototypeOf(value) !== null && (
            <ObjectTree name={'[[Prototype]]'} value={Object.getPrototypeOf(value)} />
          )}
        </div>
      )}
    </div>
  );
}

export default function VariablesPanel({ scopeChain = [] }) {
  return (
    <div className="panel panel-vars">
      <div className="panel-title"><span className="panel-icon"></span> variables</div>
      <div className="vars-content" id="varsContent">
        {scopeChain.length === 0 ? (
          <div className="empty-state">—</div>
        ) : (
          scopeChain.map((scope, idx) => (
            <div className="scope-section" key={idx} style={{ marginBottom: '8px' }}>
              <div className="scope-title" style={{ fontSize: '10px', textTransform: 'lowercase', color: 'rgba(255,255,255,0.35)', marginBottom: '4px', borderBottom: '0.5px solid rgba(255,255,255,0.05)', paddingBottom: '2px' }}>
                {scope.name} scope
              </div>
              <div className="scope-vars" style={{ paddingLeft: '4px' }}>
                {Object.keys(scope.vars || {}).length === 0 ? (
                  <div className="empty-state" style={{ padding: '4px 0' }}>—</div>
                ) : (
                  Object.entries(scope.vars).map(([name, val]) => (
                    <ObjectTree key={name} name={name} value={val} root={true} />
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
