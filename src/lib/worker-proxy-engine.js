/**
 * VOID DEBUGGER — Worker Proxy Engine
 * Drop-in replacement for DebugEngine that proxies commands to a Web Worker.
 */
import { ts } from './helpers.js';

export class WorkerProxyEngine {
  constructor(timeline, onEvent) {
    this.timeline = timeline;
    this.onEvent = onEvent;

    this.state = 'idle';
    this._currentScope = {};
    this.activeBreakpoints = new Set();
    this._cachedBPData = [];
    
    this._onConsoleMsg = null;
    this._workerErrorCount = 0;

    this._pendingEvals = new Map();
    this._nextEvalId = 1;

    this._initWorker();
  }

  _initWorker() {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    
    // Restore breakpoints if respawning
    if (this._cachedBPData && this._cachedBPData.length > 0) {
      this._send('restoreBreakpoints', { serializedBPData: this._cachedBPData });
    }

    this.worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'engine-event') {
        const { eventType, data } = msg;

        // Keep local tracking of scope for synchronous REPL
        if (eventType === 'step' || eventType === 'breakpoint-hit' || eventType === 'exception-hit') {
           this._currentScope = data.step?.rawVars || {};
        }
        if (eventType === 'state-change') {
           this.state = data.state;
        }
        if (eventType === 'stopped' || eventType === 'execution-done') {
           this._currentScope = {};
        }
        
        // Track breakpoints for persistence
        if (eventType === 'breakpoints-changed') {
           this.activeBreakpoints = new Set(data.breakpoints);
           this._cachedBPData = data.breakpointData;
        }

        // Timeline forwarding
        if (eventType === 'timeline-update' && data.events) {
           this.timeline.clear();
           data.events.forEach(ev => this.timeline.record(ev.type, ev.label, ev.data, ev.time));
        }

        this.onEvent(eventType, data);
      } else if (msg.type === 'console') {
         if (this._onConsoleMsg) this._onConsoleMsg(msg);
      } else if (msg.type === 'eval-result' || msg.type === 'object-properties') {
         if (this._pendingEvals.has(msg.id)) {
            let val = msg.value || msg.properties;
            try { if (msg.type === 'eval-result') val = JSON.parse(val); } catch(e) {}
            this._pendingEvals.get(msg.id)({ ok: msg.ok !== false, value: val, error: msg.error });
            this._pendingEvals.delete(msg.id);
         }
      } else if (msg.type === 'error') {
         if (this._onConsoleMsg) {
             this._onConsoleMsg({ type: 'error', msg: `Worker Error: ${msg.error}`, ts: ts() });
         } else {
             console.error('Worker internal error:', msg.error, msg.stack);
         }
      }
    };
    
    this.worker.onerror = (err) => {
       console.error("Worker catastrophic failure:", err.message);
       if (this._onConsoleMsg) this._onConsoleMsg({ type: 'error', msg: `Worker Error: ${err.message}`, ts: ts() });
       this.stop(); // Kill and respawn
    };
  }

  _send(action, args = {}) {
    if (this.worker) this.worker.postMessage({ action, args });
  }

  // Execution
  run(code, filename, onConsoleMsg) {
    this._onConsoleMsg = onConsoleMsg;
    this._send('run', { code, filename });
  }
  
  runToFirstCheckpoint(code, filename, onConsoleMsg) {
    this._onConsoleMsg = onConsoleMsg;
    this._send('runToFirstCheckpoint', { code, filename });
  }

  resume() { this._send('resume'); }
  stepOver() { this._send('stepOver'); }
  stepInto() { this._send('stepInto'); }
  stepOut() { this._send('stepOut'); }
  continueToCursor(line) { this._send('continueToCursor', { line }); }
  
  stop() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.state = 'idle';
    this._currentScope = {};
    this.onEvent('state-change', { state: 'idle' });
    this.onEvent('stopped', {});
    
    if (this._onConsoleMsg) {
      this._onConsoleMsg({ type: 'warn', msg: "Execution forcefully terminated.", ts: ts() });
    }
    
    // Fail pending evals
    for (const [id, resolve] of this._pendingEvals.entries()) {
      resolve({ ok: false, error: 'Worker terminated' });
    }
    this._pendingEvals.clear();

    // Respawn immediately
    this._initWorker();
  }

  // Breakpoints
  toggleBreakpoint(line) { this._send('toggleBreakpoint', { line }); }
  setConditionalBreakpoint(line, condition) { this._send('setConditionalBreakpoint', { line, condition }); }
  setLogpoint(line, logMessage) { this._send('setLogpoint', { line, logMessage }); }
  setHitCountBreakpoint(line, hitTarget) { this._send('setHitCountBreakpoint', { line, hitTarget }); }
  clearBreakpoints() { this._send('clearBreakpoints'); }
  setExceptionBreakpoints(enabled, uncaughtOnly) { this._send('setExceptionBreakpoints', { enabled, uncaughtOnly }); }

  // Variables and Console
  getCurrentScope() { return this._currentScope; }

  // Because the worker evaluates code, evaluation is asynchronous.
  // We provide a new method `evaluateExprAsync` for the console.
  evaluateExprAsync(expr) {
    return new Promise(resolve => {
       const id = this._nextEvalId++;
       this._pendingEvals.set(id, resolve);
       this._send('evaluateExpr', { id, expr });
    });
  }

  getObjectProperties(objectId) {
    return new Promise(resolve => {
       const msgId = this._nextEvalId++;
       this._pendingEvals.set(msgId, resolve);
       this._send('getObjectProperties', { msgId, objectId });
    });
  }

  // Fallbacks for compatibility
  getBreakpointLines() { return this.activeBreakpoints; }
  getBreakpointAt(line) { return null; } // Ignored
}
