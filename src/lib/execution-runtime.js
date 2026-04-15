/**
 * VOID DEBUGGER — Execution Runtime
 * The async gate controller that powers real pause/resume.
 *
 * This object is injected into instrumented code as `__rt`.
 * Every instrumented statement calls `await __rt.check(line, scopeFn)`
 * which returns a Promise that may or may not resolve immediately.
 *
 * @version 3.0.0
 */

/**
 * Step modes control how the runtime decides when to pause.
 *
 * - 'run'      → only pause at breakpoints
 * - 'into'     → pause at the very next checkpoint
 * - 'over'     → pause at next checkpoint at same/lower call depth
 * - 'out'      → pause at next checkpoint at lower call depth
 * - 'cursor'   → pause when we hit a specific target line
 * - 'stopped'  → reject all checkpoints (abort execution)
 */
const STEP_MODES = ['run', 'into', 'over', 'out', 'cursor', 'stopped'];

export class ExecutionRuntime {
  /**
   * @param {import('./breakpoint-manager.js').BreakpointManager} bpManager
   * @param {Function} onCheckpoint - callback(checkpointData) when paused
   * @param {Function} onConsole - callback({type, msg, ts}) for console output
   * @param {Function} onFrameChange - callback(callStack) when stack changes
   */
  constructor(bpManager, onCheckpoint, onConsole, onFrameChange) {
    this.bpManager = bpManager;
    this.onCheckpoint = onCheckpoint;
    this.onConsole = onConsole;
    this.onFrameChange = onFrameChange;

    // Execution state
    this.mode = 'run';                // current step mode
    this.callStack = [];              // array of {name, line, args}
    this.callDepthAtStep = 0;         // depth when step was initiated
    this.cursorTarget = null;         // target line for "continue to cursor"
    this.lastLine = 0;                // last line we checkpoint'd at
    this.checkpointCount = 0;         // total checkpoints hit this execution

    // The gate: a pending Promise + its resolver
    this._gate = null;                // { resolve, reject }
    this._paused = false;
    this._stopped = false;

    // Exception tracking
    this._lastException = null;

    // Performance: max checkpoints to prevent infinite loops
    this.MAX_CHECKPOINTS = 100000;
  }

  /**
   * Reset state for a new execution run.
   */
  reset() {
    this.mode = 'run';
    this.callStack = [];
    this.callDepthAtStep = 0;
    this.cursorTarget = null;
    this.lastLine = 0;
    this.checkpointCount = 0;
    this._gate = null;
    this._paused = false;
    this._stopped = false;
    this._lastException = null;
    this.bpManager.resetHitCounts();
  }

  /**
   * THE CORE METHOD.
   * Called at every instrumented statement: `await __rt.check(line, scopeFn)`
   *
   * @param {number} line - Source line number
   * @param {Function} scopeFn - () => ({var1, var2, ...}) capturing local scope
   * @returns {Promise<void>} - resolves when execution should continue
   */
  async check(line, scopeFn) {
    if (this._stopped) {
      throw new Error('__VOID_EXECUTION_STOPPED__');
    }

    this.checkpointCount++;
    if (this.checkpointCount > this.MAX_CHECKPOINTS) {
      throw new Error('Execution limit reached (possible infinite loop). Stopped after ' + this.MAX_CHECKPOINTS + ' statements.');
    }

    this.lastLine = line;

    // Capture scope variables
    let scopeVars = {};
    try {
      scopeVars = scopeFn ? scopeFn() : {};
    } catch {
      // scope capture can fail for destructured/complex vars
    }

    // Check breakpoint manager for this line
    let shouldPause = false;
    let pauseReason = null;

    if (this.bpManager.has(line)) {
      const result = this.bpManager.evaluate(line, scopeVars);

      // Handle logpoint output (never pauses)
      if (result.logOutput) {
        this._emitConsole('log', `[logpoint L${line}] ${result.logOutput}`);
      }

      if (result.shouldBreak) {
        shouldPause = true;
        pauseReason = 'breakpoint';
      }
    }

    // Step mode decision
    if (!shouldPause) {
      shouldPause = this._shouldPauseForStep(line);
      if (shouldPause) pauseReason = 'step';
    }

    if (!shouldPause) return; // fast path — no pause, continue immediately

    // === PAUSE EXECUTION ===
    this._paused = true;

    // Build checkpoint data for the UI
    const checkpointData = {
      line,
      scopeVars: this._serializeVars(scopeVars),
      rawVars: scopeVars,
      callStack: this.callStack.map(f => ({ ...f })),
      reason: pauseReason,
      bpType: this.bpManager.get(line)?.type || null,
    };

    // Notify the UI
    this.onCheckpoint(checkpointData);

    // Create a Promise that blocks execution until resumed
    await new Promise((resolve, reject) => {
      this._gate = { resolve, reject };
    });

    this._paused = false;
  }

  /**
   * Determine if we should pause based on current step mode.
   */
  _shouldPauseForStep(line) {
    const depth = this.callStack.length;

    switch (this.mode) {
      case 'into':
        // Pause at the very next checkpoint
        this.mode = 'run'; // consume the step
        return true;

      case 'over':
        // Pause when we return to same or lower depth AND different line
        if (depth <= this.callDepthAtStep && line !== this.lastLine) {
          this.mode = 'run';
          return true;
        }
        return false;

      case 'out':
        // Pause when depth is strictly less than when we started
        if (depth < this.callDepthAtStep) {
          this.mode = 'run';
          return true;
        }
        return false;

      case 'cursor':
        // Pause when we hit the target line
        if (line === this.cursorTarget) {
          this.mode = 'run';
          this.cursorTarget = null;
          return true;
        }
        return false;

      case 'run':
      default:
        return false;
    }
  }

  /**
   * Resume execution — resolves the pending gate.
   */
  resume() {
    this.mode = 'run';
    this._resolveGate();
  }

  /**
   * Step Into — pause at the very next checkpoint.
   */
  stepInto() {
    this.mode = 'into';
    this.callDepthAtStep = this.callStack.length;
    this._resolveGate();
  }

  /**
   * Step Over — pause at next checkpoint at same/lower call depth.
   */
  stepOver() {
    this.mode = 'over';
    this.callDepthAtStep = this.callStack.length;
    this._resolveGate();
  }

  /**
   * Step Out — pause when we return to the parent frame.
   */
  stepOut() {
    this.mode = 'out';
    this.callDepthAtStep = this.callStack.length;
    this._resolveGate();
  }

  /**
   * Continue to a specific line.
   */
  continueToCursor(line) {
    this.mode = 'cursor';
    this.cursorTarget = line;
    this._resolveGate();
  }

  /**
   * Stop execution — rejects the gate, aborting the async function.
   */
  stop() {
    this._stopped = true;
    if (this._gate) {
      this._gate.reject(new Error('__VOID_EXECUTION_STOPPED__'));
      this._gate = null;
    }
  }

  /**
   * Push a call frame (called at function entry).
   */
  pushFrame(name, line, args = {}) {
    this.callStack.push({
      name: name || '(anonymous)',
      line,
      args: { ...args }
    });
    this.onFrameChange([...this.callStack]);
  }

  /**
   * Pop a call frame (called at function exit).
   */
  popFrame() {
    this.callStack.pop();
    this.onFrameChange([...this.callStack]);
  }

  /**
   * Called when an exception is thrown in instrumented code.
   * May pause if exception breakpoints are enabled.
   */
  async onException(error, line, isCaught = true) {
    this._lastException = { error, line, isCaught };

    if (this.bpManager.shouldBreakOnException(error, isCaught)) {
      this._paused = true;

      const checkpointData = {
        line,
        scopeVars: { __exception: { type: 'error', v: error.message } },
        rawVars: { __exception: error },
        callStack: this.callStack.map(f => ({ ...f })),
        reason: 'exception',
        exception: { message: error.message, stack: error.stack },
      };

      this.onCheckpoint(checkpointData);

      await new Promise((resolve, reject) => {
        this._gate = { resolve, reject };
      });

      this._paused = false;
    }
  }

  /**
   * Resolve the pending gate Promise (allow execution to continue).
   */
  _resolveGate() {
    if (this._gate) {
      const { resolve } = this._gate;
      this._gate = null;
      resolve();
    }
  }

  /**
   * Serialize variable values for the UI (convert to {type, v} format).
   */
  _serializeVars(vars) {
    const result = {};
    for (const [key, val] of Object.entries(vars)) {
      if (key.startsWith('__')) continue; // skip internal vars
      result[key] = this._serializeValue(key, val);
    }
    return result;
  }

  _serializeValue(name, val) {
    if (val === null)      return { type: 'null', v: 'null' };
    if (val === undefined) return { type: 'undefined', v: 'undefined' };

    const t = typeof val;
    if (t === 'number')    return { type: 'number', v: String(val) };
    if (t === 'boolean')   return { type: 'bool', v: String(val) };
    if (t === 'string')    return { type: 'str', v: val.length > 50 ? val.slice(0, 50) + '…' : val };
    if (t === 'function')  return { type: 'fn', v: `[Function: ${val.name || 'anonymous'}]` };

    if (Array.isArray(val)) {
      return { type: 'array', v: `Array(${val.length})` };
    }

    if (t === 'object') {
      try {
        const preview = JSON.stringify(val);
        return { type: 'object', v: preview.length > 60 ? preview.slice(0, 60) + '…' : preview };
      } catch {
        return { type: 'object', v: '[Object]' };
      }
    }

    return { type: 'unknown', v: String(val) };
  }

  /**
   * Emit a console message (used by logpoints, internal messages).
   */
  _emitConsole(type, msg) {
    if (this.onConsole) {
      const d = new Date();
      const ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
      this.onConsole({ type, msg, ts });
    }
  }

  /** Is execution currently paused? */
  get isPaused() { return this._paused; }

  /** Is execution stopped/aborted? */
  get isStopped() { return this._stopped; }
}
