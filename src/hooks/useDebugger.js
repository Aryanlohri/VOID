/**
 * VOID DEBUGGER — useDebugger Hook
 * Central state management for the entire debugger.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { ASTEngine } from '../lib/ast-engine.js';
import { DebugEngine, TimelineLog, ConsoleEngine } from '../lib/debug-engine.js';
import { ts, formatValue, SAMPLE_CODE } from '../lib/helpers.js';

export function useDebugger() {
  // Core engine refs (mutable, don't trigger re-renders)
  const astRef = useRef(new ASTEngine());
  const timelineRef = useRef(new TimelineLog());
  const consoleEngRef = useRef(new ConsoleEngine());
  const engineRef = useRef(null);

  // State
  const [code, setCode] = useState(SAMPLE_CODE);
  const [engineState, setEngineState] = useState('idle');
  const [breakpoints, setBreakpoints] = useState(new Set());
  const [currentStep, setCurrentStep] = useState(null);
  const [variables, setVariables] = useState({});
  const [callStack, setCallStack] = useState([]);
  const [consoleLines, setConsoleLines] = useState([]);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [watchExprs, setWatchExprs] = useState([]);
  const [highlightParts, setHighlightParts] = useState([]);
  const [astErrors, setAstErrors] = useState([]);
  const [fnRanges, setFnRanges] = useState([]);

  // File tabs
  const [files, setFiles] = useState([
    { name: 'sample.js', content: SAMPLE_CODE, modified: false }
  ]);
  const [activeFileIdx, setActiveFileIdx] = useState(0);

  // Console log helper
  const addConsoleLine = useCallback((line) => {
    setConsoleLines(prev => [...prev, line]);
  }, []);

  // Engine event handler
  const handleEngineEvent = useCallback((type, data) => {
    switch (type) {
      case 'state-change':
        setEngineState(data.state);
        break;
      case 'step':
        setCurrentStep(data.step);
        setVariables(data.step.vars || {});
        setCallStack(data.step.stack || []);
        setTimelineEvents(timelineRef.current.getEvents());
        break;
      case 'breakpoint-hit':
        setCurrentStep(data.step);
        setVariables(data.step.vars || {});
        setCallStack(data.step.stack || []);
        setTimelineEvents(timelineRef.current.getEvents());
        addConsoleLine({ type: 'warn', msg: `⬤ Breakpoint hit at line ${data.line}`, ts: ts() });
        break;
      case 'breakpoints-changed':
        setBreakpoints(new Set(data.breakpoints));
        break;
      case 'execution-done':
        addConsoleLine({ type: 'info', msg: `✓ Execution complete at ${ts()}`, ts: ts() });
        setCurrentStep(null);
        break;
      case 'stopped':
        setCurrentStep(null);
        break;
    }
  }, [addConsoleLine]);

  // Initialize engine
  useEffect(() => {
    engineRef.current = new DebugEngine(timelineRef.current, handleEngineEvent);
    addConsoleLine({ type: 'info', msg: 'VOID Debugger v2.0 initialized. Ready.', ts: ts() });
    addConsoleLine({ type: 'log', msg: 'Set breakpoints → click line numbers.', ts: ts() });
    addConsoleLine({ type: 'log', msg: 'Ctrl+Click on a function name → jump to definition.', ts: ts() });
    addConsoleLine({ type: 'log', msg: 'Shortcuts: F5=Run  F10=Step  Shift+F5=Stop', ts: ts() });
    // Initial highlight
    doHighlight(SAMPLE_CODE);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Highlight code with AST
  const doHighlight = useCallback((src) => {
    const result = astRef.current.parse(src);
    const parts = astRef.current.highlight(src);
    setHighlightParts(parts);
    setAstErrors(astRef.current.getErrors());
    setFnRanges(astRef.current.getFunctionRanges());
    if (!result.success && astRef.current.errors.length > 0) {
      astRef.current.errors.forEach(err => {
        addConsoleLine({
          type: 'error',
          msg: `SyntaxError: ${err.message} (line ${err.line}:${err.col})`,
          ts: ts()
        });
      });
    }
  }, [addConsoleLine]);

  // Code change handler
  const onCodeChange = useCallback((newCode) => {
    setCode(newCode);
    setFiles(prev => prev.map((f, i) =>
      i === activeFileIdx ? { ...f, content: newCode, modified: true } : f
    ));
    doHighlight(newCode);
  }, [activeFileIdx, doHighlight]);

  // Breakpoint toggle
  const toggleBreakpoint = useCallback((line) => {
    if (engineRef.current) {
      engineRef.current.toggleBreakpoint(line);
    }
  }, []);

  // Run
  const doRun = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.state === 'paused') { engine.resume(); return; }
    if (engine.state !== 'idle') return;
    if (!code.trim()) {
      addConsoleLine({ type: 'warn', msg: 'No code to run.', ts: ts() });
      return;
    }
    addConsoleLine({ type: 'info', msg: `▶ Execution started at ${ts()}`, ts: ts() });
    engine.parseSource(code);
    engine.run(code, (msg) => addConsoleLine(msg));
  }, [code, addConsoleLine]);

  // Step
  const doStep = useCallback((type) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.state === 'idle') {
      if (!code.trim()) return;
      engine.parseSource(code);
      engine.state = 'paused';
      setEngineState('paused');
      addConsoleLine({ type: 'info', msg: '⏭ Step mode started', ts: ts() });
    }
    if (type === 'over') engine.stepOver();
    else engine.stepInto();
  }, [code, addConsoleLine]);

  // Stop
  const doStop = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
      addConsoleLine({ type: 'warn', msg: `■ Execution stopped at ${ts()}`, ts: ts() });
    }
  }, [addConsoleLine]);

  // Clear
  const doClear = useCallback(() => {
    if (engineRef.current) engineRef.current.stop();
    timelineRef.current.clear();
    setTimelineEvents([]);
    setVariables({});
    setCallStack([]);
    setCurrentStep(null);
    setConsoleLines([]);
  }, []);

  // Console evaluate
  const evaluateExpr = useCallback((expr) => {
    addConsoleLine({ type: 'exec', msg: `>>> ${expr}`, ts: ts() });
    const ctx = currentStep ? currentStep.vars : {};
    const result = consoleEngRef.current.evaluate(expr, ctx);
    if (result.ok) {
      addConsoleLine({ type: 'result', msg: `← ${formatValue(result.value)}`, ts: ts() });
    } else {
      addConsoleLine({ type: 'error', msg: `✗ ${result.error}`, ts: ts() });
    }
  }, [currentStep, addConsoleLine]);

  const consoleHistoryUp = useCallback(() => consoleEngRef.current.historyUp(), []);
  const consoleHistoryDown = useCallback(() => consoleEngRef.current.historyDown(), []);

  // Watch
  const addWatch = useCallback((expr) => {
    setWatchExprs(prev => prev.includes(expr) ? prev : [...prev, expr]);
  }, []);

  const removeWatch = useCallback((idx) => {
    setWatchExprs(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const evaluateWatch = useCallback((expr) => {
    const ctx = currentStep ? currentStep.vars : {};
    return consoleEngRef.current.evaluate(expr, ctx);
  }, [currentStep]);

  // File management
  const addFile = useCallback((name, content = '') => {
    setFiles(prev => [...prev, { name: name || `untitled-${prev.length}.js`, content, modified: false }]);
    setActiveFileIdx(prev => files.length);
    setCode(content);
    doHighlight(content);
  }, [files.length, doHighlight]);

  const switchFile = useCallback((idx) => {
    setFiles(prev => prev.map((f, i) =>
      i === activeFileIdx ? { ...f, content: code } : f
    ));
    setActiveFileIdx(idx);
    const file = files[idx];
    if (file) {
      setCode(file.content);
      doHighlight(file.content);
    }
  }, [activeFileIdx, code, files, doHighlight]);

  const closeFile = useCallback((idx) => {
    if (files.length <= 1) return;
    setFiles(prev => prev.filter((_, i) => i !== idx));
    const newIdx = idx >= files.length - 1 ? files.length - 2 : idx;
    setActiveFileIdx(newIdx);
    const newFile = files[newIdx === idx ? (idx > 0 ? idx - 1 : 0) : newIdx];
    if (newFile) {
      setCode(newFile.content);
      doHighlight(newFile.content);
    }
  }, [files, doHighlight]);

  // Open file from disk
  const openFile = useCallback(async () => {
    try {
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js', '.mjs', '.jsx'] } }]
        });
        const file = await handle.getFile();
        const content = await file.text();
        addFile(file.name, content);
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.js,.mjs,.jsx,.ts,.tsx,.txt';
        input.onchange = async (e) => {
          const f = e.target.files[0];
          if (f) {
            const content = await f.text();
            addFile(f.name, content);
          }
        };
        input.click();
      }
    } catch { /* cancelled */ }
  }, [addFile]);

  // Save file to disk
  const saveFile = useCallback(async () => {
    const name = files[activeFileIdx]?.name || 'untitled.js';
    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(code);
        await writable.close();
      } else {
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
      }
      setFiles(prev => prev.map((f, i) =>
        i === activeFileIdx ? { ...f, modified: false } : f
      ));
      addConsoleLine({ type: 'info', msg: `File saved: ${name}`, ts: ts() });
    } catch { /* cancelled */ }
  }, [code, files, activeFileIdx, addConsoleLine]);

  // Jump to definition
  const jumpToDefinition = useCallback((name) => {
    const def = astRef.current.getDefinition(name);
    if (def) {
      addConsoleLine({
        type: 'info',
        msg: `⤷ "${name}" defined at line ${def.line} (${def.symbol.type})`,
        ts: ts()
      });
      return def.line;
    } else {
      addConsoleLine({ type: 'warn', msg: `Symbol "${name}" — definition not found`, ts: ts() });
      return null;
    }
  }, [addConsoleLine]);

  return {
    // State
    code, engineState, breakpoints, currentStep,
    variables, callStack, consoleLines, timelineEvents,
    watchExprs, highlightParts, astErrors, fnRanges,
    files, activeFileIdx,

    // Actions
    onCodeChange, toggleBreakpoint,
    doRun, doStep, doStop, doClear,
    evaluateExpr, consoleHistoryUp, consoleHistoryDown,
    addWatch, removeWatch, evaluateWatch,
    addFile, switchFile, closeFile, openFile, saveFile,
    jumpToDefinition, clearConsole: () => setConsoleLines([]),
  };
}
