import { useRef, useCallback, useEffect, useState } from 'react';

export default function CodeEditor({
  code, highlightParts, breakpoints, breakpointData, currentStep,
  astErrors, fnRanges, onCodeChange, onToggleBreakpoint,
  onJumpToDefinition, onSetConditionalBP, onSetLogpoint, onSetHitCountBP,
  onContinueToCursor, engineState, profilerData
}) {
  const editorRef = useRef(null);
  const overlayRef = useRef(null);
  const lineNumRef = useRef(null);
  const [foldedRanges, setFoldedRanges] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null); // {x, y, line}

  const lines = code.split('\n');
  const errorLines = new Set((astErrors || []).map(e => e.line));

  // Build a map of line → breakpoint data for type indicators
  const bpDataMap = {};
  if (breakpointData) {
    for (const bp of breakpointData) bpDataMap[bp.line] = bp;
  }

  const syncScroll = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (overlayRef.current) {
      overlayRef.current.scrollTop = ed.scrollTop;
      overlayRef.current.scrollLeft = ed.scrollLeft;
    }
    if (lineNumRef.current) {
      lineNumRef.current.scrollTop = ed.scrollTop;
    }
  }, []);

  const handleInput = useCallback((e) => onCodeChange(e.target.value), [onCodeChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = editorRef.current;
      const s = el.selectionStart, end = el.selectionEnd, val = el.value;
      onCodeChange(val.substring(0, s) + '  ' + val.substring(end));
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
  }, [onCodeChange]);

  const handleOverlayClick = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.target.dataset.start) {
      e.preventDefault();
      onJumpToDefinition(e.target.textContent);
    }
  }, [onJumpToDefinition]);

  const scrollToLine = useCallback((lineNum) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.scrollTop = Math.max(0, (lineNum - 4) * 20.8);
    syncScroll();
  }, [syncScroll]);

  useEffect(() => {
    if (currentStep) scrollToLine(currentStep.lineNum);
  }, [currentStep, scrollToLine]);

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  // Right-click on line number → context menu
  const handleLineContextMenu = useCallback((e, ln) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, line: ln });
  }, []);

  const handleContextAction = useCallback((action) => {
    if (!contextMenu) return;
    const line = contextMenu.line;

    if (action === 'conditional') {
      const condition = prompt('Enter condition (e.g., i === 5):');
      if (condition) onSetConditionalBP(line, condition);
    } else if (action === 'logpoint') {
      const msg = prompt('Log message (use {varName} for interpolation):');
      if (msg) onSetLogpoint(line, msg);
    } else if (action === 'hitcount') {
      const count = prompt('Break after hit count:');
      if (count) onSetHitCountBP(line, count);
    } else if (action === 'cursor') {
      onContinueToCursor(line);
    } else if (action === 'remove') {
      onToggleBreakpoint(line);
    }
    setContextMenu(null);
  }, [contextMenu, onSetConditionalBP, onSetLogpoint, onSetHitCountBP, onContinueToCursor, onToggleBreakpoint]);

  const toggleFold = (startLine) => {
    setFoldedRanges(prev => {
      const next = new Set(prev);
      next.has(startLine) ? next.delete(startLine) : next.add(startLine);
      return next;
    });
  };

  // Breakpoint gutter icon based on type
  const getBpIcon = (ln) => {
    const bp = bpDataMap[ln];
    if (!bp) return null;
    if (bp.type === 'conditional') return '◆';
    if (bp.type === 'logpoint') return '◇';
    if (bp.type === 'hitcount') return '◈';
    return '●';
  };

  const getBpClass = (ln) => {
    const bp = bpDataMap[ln];
    if (!bp) return '';
    return `has-bp bp-${bp.type}`;
  };

  return (
    <div className="panel panel-editor" id="panelEditor">
      <div className="panel-title">
        <span className="panel-icon">&#9654;</span> SOURCE
        <span className="panel-badge" id="bpCount">{breakpoints.size} BP</span>
        {engineState === 'paused' && currentStep && (
          <span className="panel-badge paused-badge">PAUSED L{currentStep.lineNum}</span>
        )}
      </div>

      <div className="editor-container">
        <div className="line-numbers" id="lineNumbers" ref={lineNumRef}>
          {lines.map((_, i) => {
            const ln = i + 1;
            const hasBP = breakpoints.has(ln);
            const isExec = currentStep && currentStep.lineNum === ln;
            const hasErr = errorLines.has(ln);
            const fnRange = (fnRanges || []).find(r => r.startLine === ln);
            const hasFold = fnRange && fnRange.endLine - fnRange.startLine > 1;
            const isFolded = foldedRanges.has(ln);

            const hitCount = profilerData && profilerData.hitCounts && profilerData.hitCounts[ln] ? profilerData.hitCounts[ln] : 0;
            let heatClass = '';
            if (hitCount > 0) {
              if (hitCount >= 50) heatClass = 'has-heat-3';
              else if (hitCount >= 10) heatClass = 'has-heat-2';
              else heatClass = 'has-heat-1';
            }

            const cls = [
              hasBP ? getBpClass(ln) || 'has-bp' : '',
              isExec ? 'exec-line' : '',
              hasErr ? 'has-error' : '',
              heatClass
            ].filter(Boolean).join(' ');

            return (
              <span
                key={ln}
                data-line={ln}
                className={cls}
                title={`Line ${ln}${hasBP ? ' [Breakpoint]' : ''}${hasErr ? ' [Error]' : ''}`}
                onClick={() => onToggleBreakpoint(ln)}
                onContextMenu={(e) => handleLineContextMenu(e, ln)}
              >
                {hasFold && (
                  <span
                    className={`fold-arrow ${isFolded ? 'collapsed' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleFold(ln); }}
                  >▼</span>
                )}
                {hasBP && <span className="bp-gutter-icon">{getBpIcon(ln)}</span>}
                {ln}
              </span>
            );
          })}
        </div>

        <div className="code-area-wrap" id="codeAreaWrap">
          <pre className="code-overlay" id="codeOverlay" ref={overlayRef} onClick={handleOverlayClick}>
            {highlightParts.map((part, i) => (
              part.cls
                ? <span key={i} className={part.cls} data-start={part.start} data-end={part.end}>{part.text}</span>
                : <span key={i}>{part.text}</span>
            ))}
          </pre>
          <textarea
            id="codeEditor"
            ref={editorRef}
            value={code}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
            spellCheck="false"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="bp-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="ctx-header">Line {contextMenu.line}</div>
          {breakpoints.has(contextMenu.line) ? (
            <div className="ctx-item ctx-remove" onClick={() => handleContextAction('remove')}>
              ✕ Remove Breakpoint
            </div>
          ) : (
            <div className="ctx-item" onClick={() => onToggleBreakpoint(contextMenu.line)}>
              ● Add Breakpoint
            </div>
          )}
          <div className="ctx-sep" />
          <div className="ctx-item ctx-conditional" onClick={() => handleContextAction('conditional')}>
            ◆ Conditional Breakpoint…
          </div>
          <div className="ctx-item ctx-logpoint" onClick={() => handleContextAction('logpoint')}>
            ◇ Logpoint…
          </div>
          <div className="ctx-item ctx-hitcount" onClick={() => handleContextAction('hitcount')}>
            ◈ Hit Count Breakpoint…
          </div>
          {engineState === 'paused' && (
            <>
              <div className="ctx-sep" />
              <div className="ctx-item ctx-cursor" onClick={() => handleContextAction('cursor')}>
                → Continue to Cursor
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
