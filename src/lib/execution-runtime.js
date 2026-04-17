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
    this.onAsyncUpdate = null; // injected later or pass as 5th arg


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

    // Phase 5: Profiler Data
    this.profilerData = this._createEmptyProfilerData();
    this.flameNodeStack = [this.profilerData.flameChart];
    this._resumeTs = 0;

    // Phase 6: Async / Network
    this.networkRequests = [];
    this.promises = [];
  }

  _createEmptyProfilerData() {
    return {
      flameChart: { name: 'global', line: 0, start: 0, duration: 0, children: [] },
      hitCounts: {},
      latencies: [], // keep last 20
      avgLatency: 0,
      totalExecutionTime: 0
    };
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
    this.profilerData = this._createEmptyProfilerData();
    this.flameNodeStack = [this.profilerData.flameChart];
    this._resumeTs = 0;
    this.networkRequests = [];
    this.promises = [];
    this._notifyAsyncUpdate();
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

    // Profiler: Hit Counts
    this.profilerData.hitCounts[line] = (this.profilerData.hitCounts[line] || 0) + 1;

    // Capture scope variables
    let scopeChain = [];
    try {
      scopeChain = scopeFn ? scopeFn() : [];
    } catch {
      // scope capture can fail for destructured/complex vars
    }

    // Flat scope for breakpoint evaluation
    let flatScopeVars = {};
    for (let i = scopeChain.length - 1; i >= 0; i--) {
      Object.assign(flatScopeVars, scopeChain[i].vars);
    }

    // Check breakpoint manager for this line
    let shouldPause = false;
    let pauseReason = null;

    if (this.bpManager.has(line)) {
      const result = this.bpManager.evaluate(line, flatScopeVars);

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
      scopeChain,
      rawVars: flatScopeVars,
      callStack: this.callStack.map(f => ({ ...f })),
      reason: pauseReason,
      bpType: this.bpManager.get(line)?.type || null,
      profilerData: this.profilerData,
    };

    // Notify the UI
    this.onCheckpoint(checkpointData);

    const pauseRealStart = performance.now();

    // Create a Promise that blocks execution until resumed
    await new Promise((resolve, reject) => {
      this._gate = { resolve, reject };
    });

    const pauseRealEnd = performance.now();
    const blockedTime = pauseRealEnd - pauseRealStart;

    // Adjust start times of all active flame chart nodes to subtract pause time
    for (const node of this.flameNodeStack) {
      node.start += blockedTime;
    }

    // Measure event loop latency (time between resume() call and here)
    if (this._resumeTs > 0) {
      const latency = performance.now() - this._resumeTs;
      this.profilerData.latencies.push(latency);
      if (this.profilerData.latencies.length > 20) this.profilerData.latencies.shift();
      const sum = this.profilerData.latencies.reduce((a, b) => a + b, 0);
      this.profilerData.avgLatency = sum / this.profilerData.latencies.length;
    }
    this._resumeTs = 0;

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

    // Profiler: Flame chart node
    const newNode = { name: name || '(anonymous)', line, start: performance.now(), duration: 0, children: [] };
    const parent = this.flameNodeStack[this.flameNodeStack.length - 1];
    parent.children.push(newNode);
    this.flameNodeStack.push(newNode);

    this.onFrameChange([...this.callStack]);
  }

  /**
   * Pop a call frame (called at function exit).
   */
  popFrame() {
    this.callStack.pop();

    // Profiler: complete flame chart node
    const node = this.flameNodeStack.pop();
    if (node) {
      node.duration = performance.now() - node.start;
    }

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
        scopeChain: [{ name: 'Exception', type: 'Local', vars: { __exception: error } }],
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
      this._resumeTs = performance.now();
      resolve();
    }
  }

  // _serializeVars is removed as we now pass the raw objects for exploration

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
  }

  // === Phase 6: Async/Network Tracking ===

  trackFetch(id, url, method) {
    this.networkRequests.push({ id, url, method, status: 'pending', start: performance.now(), duration: 0, response: null });
    this._notifyAsyncUpdate();
  }

  updateFetch(id, status, response) {
    const req = this.networkRequests.find(r => r.id === id);
    if (req) {
      req.status = status;
      req.duration = performance.now() - req.start;
      req.response = response;
      this._notifyAsyncUpdate();
    }
  }

  trackPromise(id, state) {
    this.promises.push({ id, state, value: null, parentId: null, ts: performance.now() });
    this._notifyAsyncUpdate();
  }

  updatePromise(id, state, value) {
    const p = this.promises.find(p => p.id === id);
    if (p) {
      p.state = state;
      if (value !== undefined) p.value = value;
      this._notifyAsyncUpdate();
    }
  }

  setPromiseParent(childId, parentId) {
    const p = this.promises.find(p => p.id === childId);
    if (p) {
      p.parentId = parentId;
      this._notifyAsyncUpdate();
    }
  }

  _notifyAsyncUpdate() {
    if (this.onAsyncUpdate) {
      this.onAsyncUpdate({
        promises: [...this.promises],
        networkRequests: [...this.networkRequests]
      });
    }
  }

  /** Is execution currently paused? */
  get isPaused() { return this._paused; }

  /** Is execution stopped/aborted? */
  get isStopped() { return this._stopped; }
}
