export default function TabBar({ files, activeFileIdx, onSwitch, onClose, onAdd }) {
  return (
    <div className="tab-bar" id="tabBar">
      {files.map((file, idx) => (
        <div
          key={idx}
          className={`tab ${idx === activeFileIdx ? 'active' : ''}`}
          onClick={() => onSwitch(idx)}
        >
          {file.modified && <span className="tab-modified" />}
          <span className="tab-name" title={file.name}>{file.name}</span>
          <span
            className="tab-close"
            title="Close"
            onClick={(e) => { e.stopPropagation(); onClose(idx); }}
          >×</span>
        </div>
      ))}
      <div className="tab-add" title="New File" onClick={() => onAdd()}>+</div>
    </div>
  );
}
