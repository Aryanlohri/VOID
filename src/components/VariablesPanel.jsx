import { useState } from 'react';

function ObjectTree({ name, value, root = false, getObjectProperties }) {
  const [expanded, setExpanded] = useState(false);
  const [loadedProps, setLoadedProps] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!expanded && value && value.__isObjectId && !loadedProps && getObjectProperties) {
       setLoading(true);
       try {
         const res = await getObjectProperties(value.id);
         setLoadedProps(res.value || res.properties || {});
       } catch (e) {
         setLoadedProps({ error: e.message });
       }
       setLoading(false);
    }
    setExpanded(!expanded);
  };

  let type = typeof value;
  let preview = String(value);
  let isExpandable = false;

  let badgeType = typeof value;
  if (value === null) badgeType = 'null';

  if (value && value.__isObjectId) {
    type = value.className === 'Array' ? 'array' : 'object';
    badgeType = type;
    preview = value.preview;
    isExpandable = true;
  } else if (value && value.__void_fn) {
    type = 'fn';
    badgeType = 'function';
    preview = `[Function: ${value.name}]`;
    isExpandable = false;
  } else if (value === null) { type = 'null'; preview = 'null'; }
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
        <div className="obj-children" style={{ paddingLeft: '16px', borderLeft: '1px solid var(--border)', marginLeft: '6px' }}>
          {loading && <div style={{ color: 'var(--text-dim)', fontSize: '11px', padding: '2px 0' }}>loading...</div>}
          
          {!loading && (() => {
            const childrenObj = value.__isObjectId ? (loadedProps || {}) : value;
            return (
              <>
                {Object.getOwnPropertyNames(childrenObj).map(key => {
                  if (key === '[[Prototype]]') return null;
                  let childVal;
                  try { childVal = childrenObj[key]; } catch(e) { childVal = { __isError: true, msg: e.message }; }
                  if (childVal && childVal.__isError) return <div key={key} style={{color:'var(--red)'}}>{key}: {childVal.msg}</div>;
                  return <ObjectTree key={key} name={key} value={childVal} getObjectProperties={getObjectProperties} />;
                })}
                {childrenObj['[[Prototype]]'] ? (
                  <ObjectTree name={'[[Prototype]]'} value={childrenObj['[[Prototype]]']} getObjectProperties={getObjectProperties} />
                ) : null}
                {!value.__isObjectId && Object.getPrototypeOf(value) !== null && (
                  <ObjectTree name={'[[Prototype]]'} value={Object.getPrototypeOf(value)} getObjectProperties={getObjectProperties} />
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default function VariablesPanel({ scopeChain = [], getObjectProperties }) {
  return (
    <div className="panel panel-vars">
      <div className="panel-title"><span className="panel-icon"></span> variables</div>
      <div className="vars-content" id="varsContent">
        {scopeChain.length === 0 ? (
          <div className="empty-state">—</div>
        ) : (
          scopeChain.map((scope, idx) => (
            <div className="scope-section" key={idx} style={{ marginBottom: '8px' }}>
              <div className="scope-title" style={{ fontSize: '10px', textTransform: 'lowercase', color: 'var(--text-dim)', marginBottom: '4px', borderBottom: '0.5px solid var(--border)', paddingBottom: '2px' }}>
                {scope.name} scope
              </div>
              <div className="scope-vars" style={{ paddingLeft: '4px' }}>
                {Object.keys(scope.vars || {}).length === 0 ? (
                  <div className="empty-state" style={{ padding: '4px 0' }}>—</div>
                ) : (
                  Object.entries(scope.vars).map(([name, val]) => (
                    <ObjectTree key={name} name={name} value={val} root={true} getObjectProperties={getObjectProperties} />
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
