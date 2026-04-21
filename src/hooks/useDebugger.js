/**
 * VOID DEBUGGER — useDebugger Hook v3.0
 * Central state management with real instrumented execution.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { ASTEngine } from '../lib/ast-engine.js';
import { ConsoleEngine } from '../lib/debug-engine.js';
import { WorkerProxyEngine } from '../lib/worker-proxy-engine.js';
import { CDPEngine } from '../lib/cdp-engine.js';
import { ts, formatValue, SAMPLE_CODE } from '../lib/helpers.js';
import { TimelineLog } from '../lib/debug-engine.js';

export function useDebugger() {
  const astRef = useRef(new ASTEngine());
  const timelineRef = useRef(new TimelineLog());
  const consoleEngRef = useRef(new ConsoleEngine());
  const engineRef = useRef(null);
  const cdpEngineRef = useRef(null);

  const [code, setCode] = useState(SAMPLE_CODE);
  const [cdpMode, setCdpMode] = useState(false);
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
  const [networkRequests, setNetworkRequests] = useState([]);
  const [promises, setPromises] = useState([]);

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
        setScopeChain(data.step.vars || []);
        setCallStack(data.step.stack || []);
        setTimelineEvents(timelineRef.current.getEvents());
        break;

      case 'breakpoint-hit':
        setCurrentStep(data.step);
        setScopeChain(data.step.vars || []);
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
        setScopeChain(data.step.vars || []);
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

      case 'async-network-update':
        setNetworkRequests(data.networkRequests || []);
        setPromises(data.promises || []);
        break;
    }
  }, [addConsoleLine]);

  // Initialize engine
  useEffect(() => {
    engineRef.current = new WorkerProxyEngine(timelineRef.current, handleEngineEvent);
    cdpEngineRef.current = new CDPEngine(timelineRef.current, handleEngineEvent);
    addConsoleLine({ type: 'info', msg: 'VOID Debugger v3.0 — True Step Engine initialized.', ts: ts() });
    addConsoleLine({ type: 'log', msg: 'Set breakpoints → click line numbers. Right-click → conditional BP, logpoint.', ts: ts() });
    addConsoleLine({ type: 'log', msg: 'Shortcuts: F5=Run  F10=StepOver  F11=StepInto  Shift+F11=StepOut  Shift+F5=Stop', ts: ts() });
    doHighlight(SAMPLE_CODE);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getActiveEngine = useCallback(() => cdpMode ? cdpEngineRef.current : engineRef.current, [cdpMode]);

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
    const engine = getActiveEngine();
    if (engine) engine.toggleBreakpoint(line, files[activeFileIdx]?.name);
  }, [getActiveEngine, files, activeFileIdx]);

  const setConditionalBreakpoint = useCallback((line, condition) => {
    const engine = getActiveEngine();
    if (engine) engine.setConditionalBreakpoint(line, condition);
  }, [getActiveEngine]);

  const setLogpoint = useCallback((line, logMessage) => {
    const engine = getActiveEngine();
    if (engine) engine.setLogpoint(line, logMessage);
  }, [getActiveEngine]);

  const setHitCountBreakpoint = useCallback((line, hitTarget) => {
    const engine = getActiveEngine();
    if (engine) engine.setHitCountBreakpoint(line, parseInt(hitTarget));
  }, [getActiveEngine]);

  // Execution
  const doRun = useCallback(() => {
    const engine = getActiveEngine();
    if (!engine) return;
    if (engine.state === 'paused') { engine.resume(); return; }
    if (engine.state !== 'idle' && !cdpMode) return;
    if (!code.trim()) {
      addConsoleLine({ type: 'warn', msg: 'No code to run.', ts: ts() });
      return;
    }
    
    if (cdpMode) {
      addConsoleLine({ type: 'info', msg: `▶ Evaluating remotely at ${ts()}`, ts: ts() });
      const name = files[activeFileIdx]?.name || 'untitled.js';
      engine.run(code, name, (msg) => addConsoleLine(msg));
    } else {
      addConsoleLine({ type: 'info', msg: `▶ Execution started at ${ts()}`, ts: ts() });
      const name = files[activeFileIdx]?.name || 'untitled.js';
      engine.run(code, name, (msg) => addConsoleLine(msg));
    }
  }, [code, addConsoleLine, files, activeFileIdx, getActiveEngine, cdpMode]);

  const doStep = useCallback((type) => {
    const engine = getActiveEngine();
    if (!engine) return;

    if (engine.state === 'idle' && !cdpMode) {
      if (!code.trim()) return;
      const name = files[activeFileIdx]?.name || 'untitled.js';
      addConsoleLine({ type: 'info', msg: '⏭ Step mode started', ts: ts() });
      engine.runToFirstCheckpoint(code, name, (msg) => addConsoleLine(msg));
      return;
    }

    if (engine.state === 'paused') {
      if (type === 'over') engine.stepOver();
      else if (type === 'into') engine.stepInto();
      else if (type === 'out') engine.stepOut();
    }
  }, [code, addConsoleLine, files, activeFileIdx, cdpMode, getActiveEngine]);

  const doStop = useCallback(() => {
    const engine = getActiveEngine();
    if (engine) {
      engine.stop();
      if (!cdpMode) addConsoleLine({ type: 'warn', msg: `■ Execution stopped at ${ts()}`, ts: ts() });
    }
  }, [addConsoleLine, getActiveEngine, cdpMode]);

  const continueToCursor = useCallback((line) => {
    const engine = getActiveEngine();
    if (!engine) return;
    if (engine.state === 'paused') {
      addConsoleLine({ type: 'info', msg: `→ Continue to line ${line}`, ts: ts() });
      engine.continueToCursor(line);
    }
  }, [addConsoleLine]);

  const doClear = useCallback(() => {
    const engine = getActiveEngine();
    if (engine) engine.stop();
    if (cdpMode) setCdpMode(false);
    
    timelineRef.current.clear();
    setTimelineEvents([]);
    setScopeChain([]);
    setCallStack([]);
    setCurrentStep(null);
    setConsoleLines([]);
    setProfilerData(null);
    setNetworkRequests([]);
    setPromises([]);
  }, []);

  // Console — now uses real scope from runtime
  const evaluateExpr = useCallback((expr) => {
    addConsoleLine({ type: 'exec', msg: `>>> ${expr}`, ts: ts() });
    
    // Simplistic handling for CDP -- it does not yet evaluate via console easily without building custom protocol support for parsing inputs
    if (cdpMode) {
      cdpEngineRef.current.send('Runtime.evaluate', { expression: expr, includeCommandLineAPI: true })
        .then(res => {
           if (res.exceptionDetails) addConsoleLine({ type: 'error', msg: `✗ ${res.exceptionDetails.exception?.description || 'Error'}`, ts: ts() });
           else addConsoleLine({ type: 'result', msg: `← ${res.result.description || res.result.value}`, ts: ts() });
        });
      return;
    }
    
    const engine = getActiveEngine();
    let ctx = {};
    if (cdpMode) {
      ctx = engine ? engine.getCurrentScope() : {};
    } else {
      // Reconstruct context from the flat scope chain for UI evaluation
      scopeChain.forEach(scope => { if (scope.vars) Object.assign(ctx, scope.vars); });
    }
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
    if (cdpMode) return { ok: false, error: 'CDP watches unsupported yet' };
    const engine = getActiveEngine();
    let ctx = {};
    scopeChain.forEach(scope => { if (scope.vars) Object.assign(ctx, scope.vars); });
    return consoleEngRef.current.evaluate(expr, ctx);
  }, [cdpMode, getActiveEngine, scopeChain]);

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
          types: [{ description: 'Source Code', accept: { 'text/plain': ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.py'] } }]
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
          suggestedName: name, types: [{ description: 'Source Code', accept: { 'text/plain': ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.py'] } }]
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

  // Connect CDP logic
  const connectCdp = useCallback(async () => {
    if (cdpMode) {
      // Disconnect
      cdpEngineRef.current.stop();
      setCdpMode(false);
      
      // Attempt generic UI reset gracefully so native UI controls restore functionality
      setEngineState('idle'); 
    } else {
      // Connect
      doClear();
      const success = await cdpEngineRef.current.connect((msg) => addConsoleLine(msg));
      if (success) {
        setCdpMode(true);
      }
    }
  }, [cdpMode, addConsoleLine, doClear]);

  return {
    code, engineState, cdpMode, breakpoints, breakpointData, currentStep,
    scopeChain, callStack, consoleLines, timelineEvents,
    watchExprs, highlightParts, astErrors, fnRanges,
    files, activeFileIdx, profilerData,
    networkRequests, promises,

    onCodeChange, toggleBreakpoint,
    setConditionalBreakpoint, setLogpoint, setHitCountBreakpoint,
    doRun, doStep, doStop, doClear, continueToCursor, connectCdp,
    evaluateExpr, consoleHistoryUp, consoleHistoryDown,
    addWatch, removeWatch, evaluateWatch,
    addFile, switchFile, closeFile, openFile, saveFile,
    jumpToDefinition, clearConsole: () => setConsoleLines([]),
    getObjectProperties: (id) => {
       const eng = getActiveEngine();
       return eng ? eng.getObjectProperties(id) : Promise.resolve({ value: {} });
    }
  };
}
