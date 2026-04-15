import { useRef, useCallback, useEffect, useState } from 'react';

export default function CodeEditor({
  code, highlightParts, breakpoints, currentStep,
  astErrors, fnRanges, onCodeChange, onToggleBreakpoint, onJumpToDefinition
}) {
  const editorRef = useRef(null);
  const overlayRef = useRef(null);
  const lineNumRef = useRef(null);
  const [foldedRanges, setFoldedRanges] = useState(new Set());

  const lines = code.split('\n');
  const errorLines = new Set((astErrors || []).map(e => e.line));

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

  const handleInput = useCallback((e) => {
    onCodeChange(e.target.value);
  }, [onCodeChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = editorRef.current;
      const s = el.selectionStart;
      const end = el.selectionEnd;
      const val = el.value;
      const newVal = val.substring(0, s) + '  ' + val.substring(end);
      onCodeChange(newVal);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = s + 2;
      });
    }
  }, [onCodeChange]);

  const handleOverlayClick = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.target.dataset.start) {
      e.preventDefault();
      const text = e.target.textContent;
      onJumpToDefinition(text);
    }
  }, [onJumpToDefinition]);

  const scrollToLine = useCallback((lineNum) => {
    const ed = editorRef.current;
    if (!ed) return;
    const lineH = 20.8;
    ed.scrollTop = Math.max(0, (lineNum - 4) * lineH);
    syncScroll();
  }, [syncScroll]);

  useEffect(() => {
    if (currentStep) scrollToLine(currentStep.lineNum);
  }, [currentStep, scrollToLine]);

  const toggleFold = (startLine) => {
    setFoldedRanges(prev => {
      const next = new Set(prev);
      if (next.has(startLine)) next.delete(startLine);
      else next.add(startLine);
      return next;
    });
  };

  return (
    <div className="panel panel-editor" id="panelEditor">
      <div className="panel-title">
        <span className="panel-icon">&#9654;</span> SOURCE
        <span className="panel-badge" id="bpCount">{breakpoints.size} BP</span>
      </div>

      <div className="editor-container">
        {/* Line Numbers */}
        <div className="line-numbers" id="lineNumbers" ref={lineNumRef}>
          {lines.map((_, i) => {
            const ln = i + 1;
            const hasBP = breakpoints.has(ln);
            const isExec = currentStep && currentStep.lineNum === ln;
            const hasErr = errorLines.has(ln);
            const fnRange = (fnRanges || []).find(r => r.startLine === ln);
            const hasFold = fnRange && fnRange.endLine - fnRange.startLine > 1;
            const isFolded = foldedRanges.has(ln);

            const cls = [
              hasBP ? 'has-bp' : '',
              isExec ? 'exec-line' : '',
              hasErr ? 'has-error' : ''
            ].filter(Boolean).join(' ');

            return (
              <span
                key={ln}
                data-line={ln}
                className={cls}
                title={`Line ${ln}${hasBP ? ' [Breakpoint]' : ''}${hasErr ? ' [Error]' : ''}`}
                onClick={() => onToggleBreakpoint(ln)}
              >
                {hasFold && (
                  <span
                    className={`fold-arrow ${isFolded ? 'collapsed' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleFold(ln); }}
                    title={isFolded ? 'Expand' : 'Collapse'}
                  >▼</span>
                )}
                {ln}
              </span>
            );
          })}
        </div>

        {/* Code Area */}
        <div className="code-area-wrap" id="codeAreaWrap">
          {/* Syntax highlighted overlay */}
          <pre
            className="code-overlay"
            id="codeOverlay"
            ref={overlayRef}
            onClick={handleOverlayClick}
          >
            {highlightParts.map((part, i) => (
              part.cls ? (
                <span key={i} className={part.cls} data-start={part.start} data-end={part.end}>
                  {part.text}
                </span>
              ) : (
                <span key={i}>{part.text}</span>
              )
            ))}
          </pre>

          {/* Hidden textarea for editing */}
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
    </div>
  );
}
