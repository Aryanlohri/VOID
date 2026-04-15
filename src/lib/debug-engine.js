/**
 * VOID DEBUGGER — Debug Engine
 * Step-through execution core.
 */
import { ts, formatValue, extractFnName, STEP_DELAY_MS, MAX_TIMELINE } from './helpers.js';

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
    this.sandbox = null;
  }

  setSandbox(ctx) { this.sandbox = ctx; }

  evaluate(expr, context = {}) {
    const env = { ...context, ...(this.sandbox || {}) };
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
  constructor(timeline, onEvent) {
    this.timeline = timeline;
    this.onEvent = onEvent;
    this.breakpoints = new Set();
    this.state = 'idle';
    this.lines = [];
    this.currentLine = 0;
    this.context = {};
    this.callStack = [];
    this.stepQueue = [];
    this.stepTimer = null;
  }

  toggleBreakpoint(line) {
    if (this.breakpoints.has(line)) {
      this.breakpoints.delete(line);
      this.timeline.record('bp-remove', `BP-${line}`);
    } else {
      this.breakpoints.add(line);
      this.timeline.record('bp-hit', `BP:${line}`, { line });
    }
    this.onEvent('breakpoints-changed', { breakpoints: [...this.breakpoints] });
  }

  clearBreakpoints() {
    this.breakpoints.clear();
    this.onEvent('breakpoints-changed', { breakpoints: [] });
  }

  parseSource(code) {
    this.lines = code.split('\n');
    this.stepQueue = this._generateSteps(code);
    this.currentLine = 0;
    this.context = {};
    this.callStack = [];
  }

  _generateSteps(code) {
    const steps = [];
    const consoleCapture = [];
    const origLog = console.log.bind(console);

    try {
      const logCapture = (...args) => {
        const msg = args.map(a => {
          if (typeof a === 'object' && a !== null) {
            try { return JSON.stringify(a); } catch { return String(a); }
          }
          return String(a);
        }).join(' ');
        consoleCapture.push({ msg, line: 'runtime' });
        origLog(...args);
      };
      const fn = new Function('console', '__trace__', `'use strict';\n${code}\n`);
      fn({ log: logCapture, warn: logCapture, error: logCapture }, {});
    } catch { /* silent */ }

    const codeLines = code.split('\n');
    let varContext = {};
    let stackSim = [{ name: '(global)', line: 1 }];
    let logIdx = 0;

    for (let i = 0; i < codeLines.length; i++) {
      const lineNum = i + 1;
      const raw = codeLines[i];
      const trimmed = raw.trim();

      const isBlank = trimmed.length === 0;
      const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
      const isFnDecl = /^\s*(function\s+\w+|const\s+\w+\s*=\s*(\(|function)|let\s+\w+\s*=\s*(\(|function)|var\s+\w+\s*=\s*(\(|function))/.test(raw);
      const isVarDecl = /^\s*(const|let|var)\s+/.test(raw) && !isFnDecl;
      const isReturn = /^\s*return\b/.test(raw);
      const isFnCall = /\w+\s*\(/.test(trimmed) && !isFnDecl;
      const isLog = /console\.(log|warn|error)/.test(trimmed);

      if (isVarDecl) {
        const m = raw.match(/(?:const|let|var)\s+(\w+)\s*=\s*(.+?)(?:;|$)/);
        if (m) {
          try {
            const val = m[2].trim().replace(/;$/, '');
            if (/^["'`]/.test(val)) varContext[m[1]] = { type: 'str', v: val.replace(/^["'`]|["'`]$/g, '').slice(0, 30) };
            else if (/^\d/.test(val)) varContext[m[1]] = { type: 'number', v: val };
            else if (val === 'true' || val === 'false') varContext[m[1]] = { type: 'bool', v: val };
            else if (val.startsWith('[')) varContext[m[1]] = { type: 'array', v: '[]' };
            else if (val.startsWith('{')) varContext[m[1]] = { type: 'object', v: '{}' };
            else varContext[m[1]] = { type: 'ref', v: val.slice(0, 20) };
          } catch { /**/ }
        }
      }

      if (isFnDecl) stackSim = [{ name: extractFnName(raw) || '(anonymous)', line: lineNum }];

      let logLine = null;
      if (isLog && logIdx < consoleCapture.length) {
        logLine = consoleCapture[logIdx++];
      }

      steps.push({
        lineNum, raw, trimmed, isBlank, isComment, isFnDecl,
        isVarDecl, isReturn, isFnCall, isLog, logLine,
        vars: { ...varContext }, stack: [...stackSim],
        skip: isBlank || isComment,
      });
    }
    return steps;
  }

  async run(code, onConsoleMsg) {
    if (this.state !== 'idle') return;
    this.parseSource(code);
    this.state = 'running';
    this.onEvent('state-change', { state: 'running' });
    await this._executeCapture(code, onConsoleMsg);
    this._stepThrough(false);
  }

  async _executeCapture(code, onConsoleMsg) {
    return new Promise(resolve => {
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
        const fn = new Function('console', `'use strict';\n${code}`);
        fn({ log: logCapture, warn: logCapture, error: logCapture, info: logCapture });
      } catch (e) {
        onConsoleMsg({ type: 'error', msg: `RuntimeError: ${e.message}`, ts: ts() });
        this.timeline.record('err', `ERR: ${e.message.slice(0, 20)}`);
      }
      resolve();
    });
  }

  _stepThrough(stepMode = false) {
    if (this.currentLine >= this.stepQueue.length) {
      this.state = 'idle';
      this.onEvent('state-change', { state: 'idle' });
      this.onEvent('execution-done', {});
      return;
    }
    const step = this.stepQueue[this.currentLine];
    this.currentLine++;

    if (step.skip) {
      if (!stepMode) this._scheduleNext(stepMode, 0);
      else this._stepThrough(stepMode);
      return;
    }

    if (this.breakpoints.has(step.lineNum) && !stepMode) {
      this.state = 'paused';
      this.onEvent('state-change', { state: 'paused' });
      this.onEvent('breakpoint-hit', { line: step.lineNum, step });
      this.timeline.record('bp-hit', `BP:${step.lineNum}`, { line: step.lineNum });
      return;
    }

    this.onEvent('step', { step, idx: this.currentLine });

    if (step.isFnDecl) this.timeline.record('fn-call', extractFnName(step.raw) || 'fn', { line: step.lineNum });
    else if (step.isReturn) this.timeline.record('fn-ret', 'ret', { line: step.lineNum });
    else this.timeline.record('step', `L${step.lineNum}`, { line: step.lineNum });

    if (!stepMode) this._scheduleNext(stepMode, STEP_DELAY_MS);
  }

  _scheduleNext(stepMode, delay) {
    clearTimeout(this.stepTimer);
    this.stepTimer = setTimeout(() => {
      if (this.state === 'running') this._stepThrough(stepMode);
    }, delay);
  }

  stepOver() {
    if (this.state !== 'paused' && this.state !== 'idle') return;
    if (this.state === 'idle') {
      this.onEvent('state-change', { state: 'paused' });
      this.state = 'paused';
    }
    this._stepThrough(true);
    this.onEvent('state-change', { state: 'paused' });
  }

  stepInto() { this.stepOver(); }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.onEvent('state-change', { state: 'running' });
    this._scheduleNext(false, STEP_DELAY_MS);
  }

  stop() {
    clearTimeout(this.stepTimer);
    this.state = 'idle';
    this.currentLine = 0;
    this.callStack = [];
    this.context = {};
    this.onEvent('state-change', { state: 'idle' });
    this.onEvent('stopped', {});
  }
}
