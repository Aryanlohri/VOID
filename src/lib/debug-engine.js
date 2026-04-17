/**
 * VOID DEBUGGER — Debug Engine v3.0
 * True AST-instrumented execution engine.
 *
 * Replaces the v2 regex-line-scanner with real instrumented execution:
 *   CodeInstrumenter  → transforms user code with async checkpoints
 *   ExecutionRuntime  → controls pause/resume via Promise gates
 *   BreakpointManager → rich breakpoint types with scope-aware eval
 *
 * @version 3.0.0
 */
import { ts, MAX_TIMELINE } from './helpers.js';
import { CodeInstrumenter } from './code-instrumenter.js';
import { ExecutionRuntime } from './execution-runtime.js';
import { BreakpointManager } from './breakpoint-manager.js';

export class TimelineLog {
  constructor() { this.events = []; }
  record(type, label, data = {}) {
    this.events.push({ type, label, data, time: Date.now() });
    if (this.events.length > MAX_TIMELINE) this.events.shift();
  }
  clear() { this.events = []; }
  getEvents() { return [...this.events]; }
}

export class ConsoleEngine {
  constructor() {
    this.history = [];
    this.histIdx = -1;
  }

  evaluate(expr, context = {}) {
    const env = { ...context };
    try {
      const keys = Object.keys(env);
      const vals = keys.map(k => env[k]);
      const fn = new Function(...keys, `'use strict'; return (${expr})`);
      const result = fn(...vals);
      this.history.unshift(expr);
      this.histIdx = -1;
      return { ok: true, value: result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  historyUp() {
    if (this.history.length === 0) return null;
    this.histIdx = Math.min(this.histIdx + 1, this.history.length - 1);
    return this.history[this.histIdx];
  }

  historyDown() {
    if (this.histIdx <= 0) { this.histIdx = -1; return ''; }
    this.histIdx--;
    return this.history[this.histIdx];
  }
}

export class DebugEngine {
  /**
   * @param {TimelineLog} timeline
   * @param {Function} onEvent - callback(type, data) for UI updates
   */
  constructor(timeline, onEvent) {
    this.timeline = timeline;
    this.onEvent = onEvent;

    // Core modules
    this.bpManager = new BreakpointManager();
    this.instrumenter = new CodeInstrumenter();
    this.runtime = null; // created per-execution

    // State
    this.state = 'idle'; // idle | running | paused
    this._currentCheckpoint = null;
    this._executionPromise = null;
  }

  /* ═══════════════════════════════════════
     BREAKPOINT API (delegates to manager)
  ═══════════════════════════════════════ */

  toggleBreakpoint(line) {
    const bp = this.bpManager.toggle(line);
    if (bp) {
      this.timeline.record('bp-set', `BP:${line}`, { line });
    } else {
      this.timeline.record('bp-remove', `BP-${line}`, { line });
    }
    this.onEvent('breakpoints-changed', {
      breakpoints: [...this.bpManager.getLineSet()],
      breakpointData: this.bpManager.serialize(),
    });
  }

  setConditionalBreakpoint(line, condition) {
    this.bpManager.set(line, 'conditional', { condition });
    this.timeline.record('bp-set', `CBP:${line}`, { line, condition });
    this._emitBPChanged();
  }

  setLogpoint(line, logMessage) {
    this.bpManager.set(line, 'logpoint', { logMessage });
    this.timeline.record('bp-set', `LOG:${line}`, { line });
    this._emitBPChanged();
  }

  setHitCountBreakpoint(line, hitTarget) {
    this.bpManager.set(line, 'hitcount', { hitTarget });
    this.timeline.record('bp-set', `HIT:${line}`, { line, hitTarget });
    this._emitBPChanged();
  }

  removeBreakpoint(line) {
    this.bpManager.remove(line);
    this._emitBPChanged();
  }

  clearBreakpoints() {
    this.bpManager.clear();
    this._emitBPChanged();
  }

  setExceptionBreakpoints(enabled, uncaughtOnly = true) {
    this.bpManager.exceptionBreakEnabled = enabled;
    this.bpManager.uncaughtOnly = uncaughtOnly;
  }

  getBreakpointAt(line) {
    return this.bpManager.get(line);
  }

  getBreakpointLines() {
    return this.bpManager.getLineSet();
  }

  _emitBPChanged() {
    this.onEvent('breakpoints-changed', {
      breakpoints: [...this.bpManager.getLineSet()],
      breakpointData: this.bpManager.serialize(),
    });
  }

  /* ═══════════════════════════════════════
     EXECUTION CONTROL
  ═══════════════════════════════════════ */

  /**
   * Run the code with instrumented execution.
   */
  async run(code, onConsoleMsg) {
    if (this.state !== 'idle') return;

    // Instrument the code
    const { code: instrumented, error } = this.instrumenter.instrument(code);
    if (error) {
      onConsoleMsg({ type: 'error', msg: `Instrumentation failed: ${error}`, ts: ts() });
      return;
    }

    // Create fresh runtime for this execution
    this.runtime = new ExecutionRuntime(
      this.bpManager,
      (checkpoint) => this._onCheckpoint(checkpoint),
      (msg) => onConsoleMsg(msg),
      (stack) => this._onFrameChange(stack),
      (data) => this.onEvent('async-network-update', data)
    );
    this.runtime.reset();

    this.state = 'running';
    this.onEvent('state-change', { state: 'running' });

    // Build console capture
    const logCapture = (...args) => {
      const msg = args.map(a => {
        if (typeof a === 'object' && a !== null) {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' ');
      onConsoleMsg({ type: 'log', msg, ts: ts() });
    };

    // Execute the instrumented code
    try {
      const __rt = this.runtime;
      const { proxyFetch, ProxyPromise } = this._createAsyncOverrides(__rt);
      const fn = new Function('__rt', 'console', 'fetch', 'Promise', `'use strict'; return ${instrumented}`);

      this._executionPromise = fn(
        __rt,
        { log: logCapture, warn: logCapture, error: logCapture, info: logCapture },
        proxyFetch,
        ProxyPromise
      );

      await this._executionPromise;

      // Execution completed normally
      if (this.state !== 'idle') {
        this.state = 'idle';
        // Compute total execution time
        if (this.runtime && this.runtime.profilerData) {
          const prof = this.runtime.profilerData;
          if (prof.flameChart) prof.flameChart.duration = performance.now() - prof.flameChart.start;
          this.onEvent('profiler-update', { profilerData: prof });
        }
        this.onEvent('state-change', { state: 'idle' });
        this.onEvent('execution-done', {});
      }
    } catch (e) {
      if (e.message === '__VOID_EXECUTION_STOPPED__') {
        // Intentional stop
        this.state = 'idle';
        this.onEvent('state-change', { state: 'idle' });
        this.onEvent('stopped', {});
      } else {
        // Runtime error
        onConsoleMsg({ type: 'error', msg: `RuntimeError: ${e.message}`, ts: ts() });
        this.timeline.record('err', `ERR: ${e.message.slice(0, 20)}`, {});
        this.state = 'idle';
        if (this.runtime && this.runtime.profilerData) {
          const prof = this.runtime.profilerData;
          if (prof.flameChart) prof.flameChart.duration = performance.now() - prof.flameChart.start;
          this.onEvent('profiler-update', { profilerData: prof });
        }
        this.onEvent('state-change', { state: 'idle' });
        this.onEvent('execution-done', { error: e.message });
      }
    }
  }

  /**
   * Called by the runtime when execution is paused at a checkpoint.
   */
  _onCheckpoint(checkpoint) {
    this._currentCheckpoint = checkpoint;
    this.state = 'paused';
    this.onEvent('state-change', { state: 'paused' });

    // Build step data compatible with existing UI
    const step = {
      lineNum: checkpoint.line,
      vars: checkpoint.scopeVars,
      rawVars: checkpoint.rawVars,
      stack: checkpoint.callStack,
      reason: checkpoint.reason,
      bpType: checkpoint.bpType,
      profilerData: checkpoint.profilerData,
    };

    if (checkpoint.reason === 'breakpoint') {
      this.onEvent('breakpoint-hit', { line: checkpoint.line, step });
      this.timeline.record('bp-hit', `BP:${checkpoint.line}`, { line: checkpoint.line });
    } else if (checkpoint.reason === 'exception') {
      this.onEvent('exception-hit', {
        line: checkpoint.line,
        step,
        exception: checkpoint.exception
      });
      this.timeline.record('err', `EXC:${checkpoint.line}`, { line: checkpoint.line });
    } else {
      this.onEvent('step', { step, idx: checkpoint.line });
    }
    
    if (checkpoint.profilerData) {
      this.onEvent('profiler-update', { profilerData: checkpoint.profilerData });
    }

    this.onEvent('timeline-update', { events: this.timeline.getEvents() });
  }

  /**
   * Called by the runtime when the call stack changes.
   */
  _onFrameChange(stack) {
    this.onEvent('frame-change', { stack });
  }

  /* ═══════════════════════════════════════
     USER ACTIONS (Resume / Step / Stop)
  ═══════════════════════════════════════ */

  resume() {
    if (this.state !== 'paused' || !this.runtime) return;
    this.state = 'running';
    this.onEvent('state-change', { state: 'running' });
    this.timeline.record('step', `RESUME`, {});
    this.runtime.resume();
  }

  stepOver() {
    if (!this.runtime) return;
    if (this.state === 'idle') {
      // First step — need to start execution
      return; // handled by doStep in useDebugger
    }
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.onEvent('state-change', { state: 'running' });
    this.timeline.record('step', `STEP-OVER`, {});
    this.runtime.stepOver();
  }

  stepInto() {
    if (!this.runtime || this.state !== 'paused') return;
    this.state = 'running';
    this.onEvent('state-change', { state: 'running' });
    this.timeline.record('step', `STEP-INTO`, {});
    this.runtime.stepInto();
  }

  stepOut() {
    if (!this.runtime || this.state !== 'paused') return;
    this.state = 'running';
    this.onEvent('state-change', { state: 'running' });
    this.timeline.record('step', `STEP-OUT`, {});
    this.runtime.stepOut();
  }

  continueToCursor(line) {
    if (!this.runtime || this.state !== 'paused') return;
    this.state = 'running';
    this.onEvent('state-change', { state: 'running' });
    this.timeline.record('step', `RUN→L${line}`, { line });
    this.runtime.continueToCursor(line);
  }

  stop() {
    if (this.runtime) {
      this.runtime.stop();
    }
    this.state = 'idle';
    this._currentCheckpoint = null;
    this.onEvent('state-change', { state: 'idle' });
    this.onEvent('stopped', {});
  }

  /**
   * Start execution in step mode — run to the first checkpoint and pause.
   */
  async runToFirstCheckpoint(code, onConsoleMsg) {
    if (this.state !== 'idle') return;

    const { code: instrumented, error } = this.instrumenter.instrument(code);
    if (error) {
      onConsoleMsg({ type: 'error', msg: `Instrumentation failed: ${error}`, ts: ts() });
      return;
    }

    this.runtime = new ExecutionRuntime(
      this.bpManager,
      (checkpoint) => this._onCheckpoint(checkpoint),
      (msg) => onConsoleMsg(msg),
      (stack) => this._onFrameChange(stack),
      (data) => this.onEvent('async-network-update', data)
    );
    this.runtime.reset();
    this.runtime.mode = 'into'; // pause at first checkpoint

    this.state = 'running';
    this.onEvent('state-change', { state: 'running' });

    const logCapture = (...args) => {
      const msg = args.map(a => {
        if (typeof a === 'object' && a !== null) {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' ');
      onConsoleMsg({ type: 'log', msg, ts: ts() });
    };

    try {
      const __rt = this.runtime;
      const { proxyFetch, ProxyPromise } = this._createAsyncOverrides(__rt);
      const fn = new Function('__rt', 'console', 'fetch', 'Promise', `'use strict'; return ${instrumented}`);
      this._executionPromise = fn(
        __rt,
        { log: logCapture, warn: logCapture, error: logCapture, info: logCapture },
        proxyFetch,
        ProxyPromise
      );
      await this._executionPromise;

      if (this.state !== 'idle') {
        this.state = 'idle';
        if (this.runtime && this.runtime.profilerData) {
          const prof = this.runtime.profilerData;
          if (prof.flameChart) prof.flameChart.duration = performance.now() - prof.flameChart.start;
          this.onEvent('profiler-update', { profilerData: prof });
        }
        this.onEvent('state-change', { state: 'idle' });
        this.onEvent('execution-done', {});
      }
    } catch (e) {
      if (e.message === '__VOID_EXECUTION_STOPPED__') {
        this.state = 'idle';
        this.onEvent('state-change', { state: 'idle' });
        this.onEvent('stopped', {});
      } else {
        onConsoleMsg({ type: 'error', msg: `RuntimeError: ${e.message}`, ts: ts() });
        this.state = 'idle';
        if (this.runtime && this.runtime.profilerData) {
          const prof = this.runtime.profilerData;
          if (prof.flameChart) prof.flameChart.duration = performance.now() - prof.flameChart.start;
          this.onEvent('profiler-update', { profilerData: prof });
        }
        this.onEvent('state-change', { state: 'idle' });
        this.onEvent('execution-done', { error: e.message });
      }
    }
  }

  /** Get the current checkpoint data (for REPL context). */
  getCurrentScope() {
    return this._currentCheckpoint?.rawVars || {};
  }

  // === Phase 6: Async Overrides ===
  _createAsyncOverrides(__rt) {
    let nextPromiseId = 1;
    let nextFetchId = 1;

    const proxyFetch = async (url, options = {}) => {
      const id = nextFetchId++;
      const method = options.method || 'GET';
      if (__rt) __rt.trackFetch(id, url, method);
      
      try {
        const res = await window.fetch(url, options);
        const clone = res.clone();
        let preview = '';
        try {
           const text = await clone.text();
           preview = text.slice(0, 50) + (text.length > 50 ? '...' : '');
        } catch { preview = 'opaque'; }

        if (__rt) __rt.updateFetch(id, res.status, preview);
        return res;
      } catch (err) {
        if (__rt) __rt.updateFetch(id, 'error', err.message);
        throw err;
      }
    };

    class ProxyPromise extends Promise {
      constructor(executor) {
        const id = nextPromiseId++;
        if (__rt) __rt.trackPromise(id, 'pending');

        super((resolve, reject) => {
          return executor(
            (val) => {
              let displayVal = val;
              if (val && typeof val === 'object') displayVal = '{object}';
              else if (typeof val === 'string') displayVal = `"${val.slice(0,30)}"`;
              else displayVal = String(val);

              if (__rt) __rt.updatePromise(id, 'fulfilled', displayVal);
              return resolve(val);
            },
            (err) => {
              if (__rt) __rt.updatePromise(id, 'rejected', String(err));
              return reject(err);
            }
          );
        });
        this.__voidId = id;
      }

      then(onFulfilled, onRejected) {
        const child = super.then(onFulfilled, onRejected);
        if (__rt && child.__voidId) __rt.setPromiseParent(child.__voidId, this.__voidId);
        return child;
      }

      catch(onRejected) {
        const child = super.catch(onRejected);
        if (__rt && child.__voidId) __rt.setPromiseParent(child.__voidId, this.__voidId);
        return child;
      }
      
      finally(onFinally) {
        const child = super.finally(onFinally);
        if (__rt && child.__voidId) __rt.setPromiseParent(child.__voidId, this.__voidId);
        return child;
      }
    }

    // Bind static methods so things like Promise.all still work properly
    ProxyPromise.all = Promise.all.bind(Promise);
    ProxyPromise.race = Promise.race.bind(Promise);
    ProxyPromise.allSettled = Promise.allSettled.bind(Promise);
    ProxyPromise.any = Promise.any.bind(Promise);
    // Promise.resolve and Promise.reject are bound, but they return native Promises. 
    // To be perfectly tracked, we'd wrap them, but this is enough for the exercise.

    return { proxyFetch, ProxyPromise };
  }
}
