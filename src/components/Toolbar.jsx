export default function Toolbar({
  engineState, onRun, onStepOver, onStepInto, onStop, onClear,
  onOpenFile, onSaveFile, onToggleTheme
}) {
  const isPaused = engineState === 'paused';
  const isRunning = engineState === 'running';
  const isIdle = engineState === 'idle';

  return (
    <div className="toolbar" id="toolbarBar">
      <button className="btn btn-run" id="btnRun" title="Run (F5)" onClick={onRun} disabled={isRunning}>
        <svg width="12" height="12" viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
        {isPaused ? 'RESUME' : 'RUN'}
      </button>
      <button className="btn btn-step" id="btnStepOver" title="Step Over (F10)" onClick={onStepOver}>
        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7h8M7 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
        STEP
      </button>
      <button className="btn btn-step" id="btnStepInto" title="Step Into (F11)" onClick={onStepInto}>
        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2v8M4 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
        INTO
      </button>
      <button className="btn btn-stop" id="btnStop" title="Stop (Shift+F5)" onClick={onStop} disabled={isIdle}>
        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="currentColor"/></svg>
        STOP
      </button>
      <button className="btn btn-clear" id="btnClear" title="Clear All" onClick={onClear}>
        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 3h10M5 3V2h4v1M4 3l1 9h4l1-9" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
        CLEAR
      </button>

      <span className="toolbar-sep" />

      <button className="btn btn-file" id="btnOpenFile" title="Open File (Ctrl+O)" onClick={onOpenFile}>
        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 3h4l2 2h4v7H2V3z" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
        OPEN
      </button>
      <button className="btn btn-file" id="btnSaveFile" title="Save File (Ctrl+S)" onClick={onSaveFile}>
        <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 2h6l3 3v7H2V2zM5 2v3h4V2M4 8h6" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
        SAVE
      </button>

      <div className="toolbar-spacer" />

      <button className="btn btn-theme" id="btnTheme" title="Toggle Theme" onClick={onToggleTheme}>◑</button>
    </div>
  );
}
