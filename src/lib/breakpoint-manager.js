/**
 * VOID DEBUGGER — Breakpoint Manager
 * Rich breakpoint system: normal, conditional, logpoint, hitcount, exception.
 *
 * Design:
 *   Each breakpoint is an object with type + metadata.
 *   The manager evaluates whether to break at a given line
 *   using the real runtime scope variables.
 *
 * @version 3.0.0
 */

let _nextId = 1;

export class Breakpoint {
  constructor(line, type = 'normal', opts = {}) {
    this.id = _nextId++;
    this.line = line;
    this.type = type;           // 'normal' | 'conditional' | 'logpoint' | 'hitcount'
    this.enabled = true;
    this.condition = opts.condition || '';     // JS expression for conditional
    this.logMessage = opts.logMessage || '';   // template string for logpoint: "x = {x}"
    this.hitTarget = opts.hitTarget || 0;     // break on Nth hit
    this.hitCount = 0;                        // running counter
  }

  reset() {
    this.hitCount = 0;
  }
}

export class BreakpointManager {
  constructor() {
    /** @type {Map<number, Breakpoint>} line → Breakpoint */
    this.breakpoints = new Map();
    this.exceptionBreakEnabled = false;
    this.uncaughtOnly = true;
  }

  /**
   * Add or toggle a breakpoint at a line.
   * If one exists, remove it. Otherwise add a normal BP.
   */
  toggle(line) {
    if (this.breakpoints.has(line)) {
      this.breakpoints.delete(line);
      return null;
    }
    const bp = new Breakpoint(line, 'normal');
    this.breakpoints.set(line, bp);
    return bp;
  }

  /**
   * Set a specific breakpoint type at a line.
   */
  set(line, type, opts = {}) {
    const bp = new Breakpoint(line, type, opts);
    this.breakpoints.set(line, bp);
    return bp;
  }

  /**
   * Remove breakpoint at line.
   */
  remove(line) {
    this.breakpoints.delete(line);
  }

  /**
   * Get breakpoint at line, or null.
   */
  get(line) {
    return this.breakpoints.get(line) || null;
  }

  /**
   * Check if we have a breakpoint at this line.
   */
  has(line) {
    return this.breakpoints.has(line);
  }

  /**
   * Clear all breakpoints.
   */
  clear() {
    this.breakpoints.clear();
  }

  /**
   * Get all breakpoint lines as a Set (for backward compat).
   */
  getLineSet() {
    return new Set(this.breakpoints.keys());
  }

  /**
   * Get all breakpoints as a sorted array.
   */
  getAll() {
    return [...this.breakpoints.values()].sort((a, b) => a.line - b.line);
  }

  /**
   * Reset hit counts (called at start of execution).
   */
  resetHitCounts() {
    for (const bp of this.breakpoints.values()) {
      bp.hitCount = 0;
    }
  }

  /**
   * Evaluate whether execution should break at this line.
   *
   * @param {number} line        - Current line number
   * @param {object} scopeVars   - Real variable values from scope: {name: value, ...}
   * @returns {{ shouldBreak: boolean, logOutput?: string }}
   */
  evaluate(line, scopeVars = {}) {
    const bp = this.breakpoints.get(line);
    if (!bp || !bp.enabled) return { shouldBreak: false };

    bp.hitCount++;

    switch (bp.type) {
      case 'normal':
        return { shouldBreak: true };

      case 'conditional': {
        if (!bp.condition) return { shouldBreak: true };
        try {
          const keys = Object.keys(scopeVars);
          const vals = keys.map(k => scopeVars[k]);
          // eslint-disable-next-line no-new-func
          const fn = new Function(...keys, `'use strict'; return !!(${bp.condition})`);
          const result = fn(...vals);
          return { shouldBreak: result };
        } catch (e) {
          // Condition eval error — break anyway and report
          return { shouldBreak: true, logOutput: `BP condition error: ${e.message}` };
        }
      }

      case 'logpoint': {
        // Never breaks — just logs
        const msg = this._interpolateLog(bp.logMessage, scopeVars);
        return { shouldBreak: false, logOutput: msg };
      }

      case 'hitcount': {
        const shouldBreak = bp.hitCount >= bp.hitTarget;
        return { shouldBreak };
      }

      default:
        return { shouldBreak: false };
    }
  }

  /**
   * Interpolate {varName} in log message with real scope values.
   */
  _interpolateLog(template, scopeVars) {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (match, name) => {
      if (name in scopeVars) {
        const val = scopeVars[name];
        if (val === null) return 'null';
        if (val === undefined) return 'undefined';
        if (typeof val === 'object') {
          try { return JSON.stringify(val); } catch { return String(val); }
        }
        return String(val);
      }
      return match; // leave {name} as-is if not in scope
    });
  }

  /**
   * Check if we should break on an exception.
   */
  shouldBreakOnException(error, isCaught) {
    if (!this.exceptionBreakEnabled) return false;
    if (this.uncaughtOnly && isCaught) return false;
    return true;
  }

  /**
   * Serialize for persistence / display.
   */
  serialize() {
    return this.getAll().map(bp => ({
      id: bp.id,
      line: bp.line,
      type: bp.type,
      enabled: bp.enabled,
      condition: bp.condition,
      logMessage: bp.logMessage,
      hitTarget: bp.hitTarget,
      hitCount: bp.hitCount,
    }));
  }
}
