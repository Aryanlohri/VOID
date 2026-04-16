/**
 * VOID DEBUGGER — useDebugger Hook v3.0
 * Central state management with real instrumented execution.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { ASTEngine } from '../lib/ast-engine.js';
import { DebugEngine, TimelineLog, ConsoleEngine } from '../lib/debug-engine.js';
import { ts, formatValue, SAMPLE_CODE } from '../lib/helpers.js';

export function useDebugger() {
  const astRef = useRef(new ASTEngine());
  const timelineRef = useRef(new TimelineLog());
  const consoleEngRef = useRef(new ConsoleEngine());
  const engineRef = useRef(null);

  const [code, setCode] = useState(SAMPLE_CODE);
  const [engineState, setEngineState] = useState('idle');
  const [breakpoints, setBreakpoints] = useState(new Set());
  const [breakpointData, setBreakpointData] = useState([]);
  const [currentStep, setCurrentStep] = useState(null);
  const [scopeChain, setScopeChain] = useState([]);
  const [callStack, setCallStack] = useState([]);
  const [consoleLines, setConsoleLines] = useState([]);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [watchExprs, setWatchExprs] = useState([]);
  const [highlightParts, setHighlightParts] = useState([]);
  const [astErrors, setAstErrors] = useState([]);
  const [fnRanges, setFnRanges] = useState([]);
  const [profilerData, setProfilerData] = useState(null);

  const [files, setFiles] = useState([
    { name: 'sample.js', content: SAMPLE_CODE, modified: false }
  ]);
  const [activeFileIdx, setActiveFileIdx] = useState(0);

  const addConsoleLine = useCallback((line) => {
    setConsoleLines(prev => [...prev, line]);
  }, []);

  // Engine event handler — updated for v3
  const handleEngineEvent = useCallback((type, data) => {
    switch (type) {
      case 'state-change':
        setEngineState(data.state);
        break;

      case 'step':
        setCurrentStep(data.step);
        setScopeChain(data.step.scopeChain || []);
        setCallStack(data.step.stack || []);
        setTimelineEvents(timelineRef.current.getEvents());
        break;

      case 'breakpoint-hit':
        setCurrentStep(data.step);
        setScopeChain(data.step.scopeChain || []);
        setCallStack(data.step.stack || []);
        setTimelineEvents(timelineRef.current.getEvents());
        addConsoleLine({
          type: 'warn',
          msg: `⬤ Breakpoint hit at line ${data.line}${data.step.bpType && data.step.bpType !== 'normal' ? ` (${data.step.bpType})` : ''}`,
          ts: ts()
        });
        break;

      case 'exception-hit':
        setCurrentStep(data.step);
        setScopeChain(data.step.scopeChain || []);
        setCallStack(data.step.stack || []);
        setTimelineEvents(timelineRef.current.getEvents());
        addConsoleLine({
          type: 'error',
          msg: `⚡ Exception at line ${data.line}: ${data.exception?.message || 'Unknown error'}`,
          ts: ts()
        });
        break;

      case 'breakpoints-changed':
        setBreakpoints(new Set(data.breakpoints));
        setBreakpointData(data.breakpointData || []);
        break;

      case 'frame-change':
        setCallStack(data.stack || []);
        break;

      case 'timeline-update':
        setTimelineEvents(data.events || []);
        break;

      case 'execution-done':
        addConsoleLine({ type: 'info', msg: `✓ Execution complete at ${ts()}`, ts: ts() });
        setCurrentStep(null);
        break;

      case 'stopped':
        setCurrentStep(null);
        break;

      case 'profiler-update':
        setProfilerData(data.profilerData);
        break;
    }
  }, [addConsoleLine]);

  // Initialize engine
  useEffect(() => {
    engineRef.current = new DebugEngine(timelineRef.current, handleEngineEvent);
    addConsoleLine({ type: 'info', msg: 'VOID Debugger v3.0 — True Step Engine initialized.', ts: ts() });
    addConsoleLine({ type: 'log', msg: 'Set breakpoints → click line numbers. Right-click → conditional BP, logpoint.', ts: ts() });
    addConsoleLine({ type: 'log', msg: 'Shortcuts: F5=Run  F10=StepOver  F11=StepInto  Shift+F11=StepOut  Shift+F5=Stop', ts: ts() });
    doHighlight(SAMPLE_CODE);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const onCodeChange = useCallback((newCode) => {
    setCode(newCode);
    setFiles(prev => prev.map((f, i) =>
      i === activeFileIdx ? { ...f, content: newCode, modified: true } : f
    ));
    doHighlight(newCode);
  }, [activeFileIdx, doHighlight]);

  // Breakpoint management — rich types
  const toggleBreakpoint = useCallback((line) => {
    if (engineRef.current) engineRef.current.toggleBreakpoint(line);
  }, []);

  const setConditionalBreakpoint = useCallback((line, condition) => {
    if (engineRef.current) engineRef.current.setConditionalBreakpoint(line, condition);
  }, []);

  const setLogpoint = useCallback((line, logMessage) => {
    if (engineRef.current) engineRef.current.setLogpoint(line, logMessage);
  }, []);

  const setHitCountBreakpoint = useCallback((line, hitTarget) => {
    if (engineRef.current) engineRef.current.setHitCountBreakpoint(line, parseInt(hitTarget));
  }, []);

  // Execution
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
    engine.run(code, (msg) => addConsoleLine(msg));
  }, [code, addConsoleLine]);

  const doStep = useCallback((type) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (engine.state === 'idle') {
      if (!code.trim()) return;
      addConsoleLine({ type: 'info', msg: '⏭ Step mode started', ts: ts() });
      engine.runToFirstCheckpoint(code, (msg) => addConsoleLine(msg));
      return;
    }

    if (engine.state === 'paused') {
      if (type === 'over') engine.stepOver();
      else if (type === 'into') engine.stepInto();
      else if (type === 'out') engine.stepOut();
    }
  }, [code, addConsoleLine]);

  const doStop = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.stop();
      addConsoleLine({ type: 'warn', msg: `■ Execution stopped at ${ts()}`, ts: ts() });
    }
  }, [addConsoleLine]);

  const continueToCursor = useCallback((line) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.state === 'paused') {
      addConsoleLine({ type: 'info', msg: `→ Continue to line ${line}`, ts: ts() });
      engine.continueToCursor(line);
    }
  }, [addConsoleLine]);

  const doClear = useCallback(() => {
    if (engineRef.current) engineRef.current.stop();
    timelineRef.current.clear();
    setTimelineEvents([]);
    setScopeChain([]);
    setCallStack([]);
    setCurrentStep(null);
    setConsoleLines([]);
    setProfilerData(null);
  }, []);

  // Console — now uses real scope from runtime
  const evaluateExpr = useCallback((expr) => {
    addConsoleLine({ type: 'exec', msg: `>>> ${expr}`, ts: ts() });
    const engine = engineRef.current;
    const ctx = engine ? engine.getCurrentScope() : {};
    const result = consoleEngRef.current.evaluate(expr, ctx);
    if (result.ok) {
      addConsoleLine({ type: 'result', msg: `← ${formatValue(result.value)}`, ts: ts() });
    } else {
      addConsoleLine({ type: 'error', msg: `✗ ${result.error}`, ts: ts() });
    }
  }, [addConsoleLine]);

  const consoleHistoryUp = useCallback(() => consoleEngRef.current.historyUp(), []);
  const consoleHistoryDown = useCallback(() => consoleEngRef.current.historyDown(), []);

  // Watch — now uses real scope
  const addWatch = useCallback((expr) => {
    setWatchExprs(prev => prev.includes(expr) ? prev : [...prev, expr]);
  }, []);

  const removeWatch = useCallback((idx) => {
    setWatchExprs(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const evaluateWatch = useCallback((expr) => {
    const engine = engineRef.current;
    const ctx = engine ? engine.getCurrentScope() : {};
    return consoleEngRef.current.evaluate(expr, ctx);
  }, []);

  // File management (unchanged)
  const addFile = useCallback((name, content = '') => {
    setFiles(prev => [...prev, { name: name || `untitled-${prev.length}.js`, content, modified: false }]);
    setActiveFileIdx(files.length);
    setCode(content);
    doHighlight(content);
  }, [files.length, doHighlight]);

  const switchFile = useCallback((idx) => {
    setFiles(prev => prev.map((f, i) =>
      i === activeFileIdx ? { ...f, content: code } : f
    ));
    setActiveFileIdx(idx);
    const file = files[idx];
    if (file) { setCode(file.content); doHighlight(file.content); }
  }, [activeFileIdx, code, files, doHighlight]);

  const closeFile = useCallback((idx) => {
    if (files.length <= 1) return;
    setFiles(prev => prev.filter((_, i) => i !== idx));
    const newIdx = idx >= files.length - 1 ? files.length - 2 : idx;
    setActiveFileIdx(newIdx);
    const newFile = files[newIdx === idx ? (idx > 0 ? idx - 1 : 0) : newIdx];
    if (newFile) { setCode(newFile.content); doHighlight(newFile.content); }
  }, [files, doHighlight]);

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
        input.type = 'file'; input.accept = '.js,.mjs,.jsx,.ts,.tsx,.txt';
        input.onchange = async (e) => {
          const f = e.target.files[0];
          if (f) addFile(f.name, await f.text());
        };
        input.click();
      }
    } catch { /* cancelled */ }
  }, [addFile]);

  const saveFile = useCallback(async () => {
    const name = files[activeFileIdx]?.name || 'untitled.js';
    try {
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: name, types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(code); await writable.close();
      } else {
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
      }
      setFiles(prev => prev.map((f, i) => i === activeFileIdx ? { ...f, modified: false } : f));
      addConsoleLine({ type: 'info', msg: `File saved: ${name}`, ts: ts() });
    } catch { /* cancelled */ }
  }, [code, files, activeFileIdx, addConsoleLine]);

  const jumpToDefinition = useCallback((name) => {
    const def = astRef.current.getDefinition(name);
    if (def) {
      addConsoleLine({ type: 'info', msg: `⤷ "${name}" defined at line ${def.line} (${def.symbol.type})`, ts: ts() });
      return def.line;
    } else {
      addConsoleLine({ type: 'warn', msg: `Symbol "${name}" — definition not found`, ts: ts() });
      return null;
    }
  }, [addConsoleLine]);

  return {
    code, engineState, breakpoints, breakpointData, currentStep,
    scopeChain, callStack, consoleLines, timelineEvents,
    watchExprs, highlightParts, astErrors, fnRanges,
    files, activeFileIdx, profilerData,

    onCodeChange, toggleBreakpoint,
    setConditionalBreakpoint, setLogpoint, setHitCountBreakpoint,
    doRun, doStep, doStop, doClear, continueToCursor,
    evaluateExpr, consoleHistoryUp, consoleHistoryDown,
    addWatch, removeWatch, evaluateWatch,
    addFile, switchFile, closeFile, openFile, saveFile,
    jumpToDefinition, clearConsole: () => setConsoleLines([]),
  };
}
