/**
 * VOID DEBUGGER — CDP Engine (Phase 8)
 * Connects to external Node.js or Chrome via Chrome DevTools Protocol.
 */
import { ts, MAX_TIMELINE } from './helpers.js';

export class CDPEngine {
  constructor(timeline, onEvent) {
    this.timeline = timeline;
    this.onEvent = onEvent;
    
    this.state = 'idle'; // idle | running | paused
    this.ws = null;
    this.msgId = 1;
    this.pendingRequests = new Map();
    this.activeBreakpoints = new Map(); // line -> cdpBreakpointId
  }

  async connect(onConsoleMsg) {
    try {
      onConsoleMsg({ type: 'info', msg: 'Fetching CDP targets via /api/cdp/json/list...', ts: ts() });
      const res = await fetch('/api/cdp/json/list');
      if (!res.ok) throw new Error(`Proxy error: ${res.statusText}`);
      const targets = await res.json();
      
      const target = targets.find(t => t.type === 'node' || t.type === 'page') || targets[0];
      if (!target || !target.webSocketDebuggerUrl) throw new Error("No CDP targets found on 9229");
      
      const wsUrl = target.webSocketDebuggerUrl;
      onConsoleMsg({ type: 'info', msg: `Connecting to ${wsUrl}...`, ts: ts() });
      
      return new Promise((resolve, reject) => {
        this.ws = new WebSocket(wsUrl);
        this.ws.onopen = async () => {
          this.state = 'running';
          this.onEvent('state-change', { state: 'running' });
          onConsoleMsg({ type: 'info', msg: 'CDP Connected successfully.', ts: ts() });
          
          await this.send('Debugger.enable');
          await this.send('Runtime.enable');
          await this.send('Profiler.enable');
          
          resolve(true);
        };
        
        this.ws.onerror = () => reject(new Error('WebSocket connection failed. Ensure Node is running with --inspect.'));
        this.ws.onclose = () => {
          this.state = 'idle';
          this.onEvent('state-change', { state: 'idle' });
          onConsoleMsg({ type: 'warn', msg: 'CDP Disconnected.', ts: ts() });
        };
        
        this.ws.onmessage = (event) => this.handleMessage(event.data, onConsoleMsg);
      });
      
    } catch (e) {
      onConsoleMsg({ type: 'error', msg: `CDP Connect failed: ${e.message}`, ts: ts() });
      return false;
    }
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async handleMessage(dataStr, onConsoleMsg) {
    const msg = JSON.parse(dataStr);
    
    if (msg.id && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id);
      this.pendingRequests.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
      return;
    }
    
    if (msg.method === 'Debugger.paused') {
      await this.handlePaused(msg.params);
    } else if (msg.method === 'Debugger.resumed') {
      this.state = 'running';
      this.onEvent('state-change', { state: 'running' });
    } else if (msg.method === 'Runtime.consoleAPICalled') {
       const args = msg.params.args.map(a => a.value || a.description || 'Object').join(' ');
       onConsoleMsg({ type: msg.params.type, msg: `[Remote] ${args}`, ts: ts() });
    }
  }

  async handlePaused(params) {
    this.state = 'paused';
    this.onEvent('state-change', { state: 'paused' });
    
    const frame = params.callFrames[0];
    const line = frame.location.lineNumber + 1;
    
    const scopeParts = [];
    for (const scope of frame.scopeChain) {
      if (scope.type === 'global') continue; // Too large to pull sync
      
      const propsRes = await this.send('Runtime.getProperties', {
        objectId: scope.object.objectId,
        generatePreview: true
      });
      
      const vars = {};
      for (const prop of propsRes.result) {
        if (prop.value && prop.name !== '__proto__') {
          vars[prop.name] = prop.value.value ?? prop.value.description ?? '{object}';
        }
      }
      scopeParts.push({ name: scope.type, type: scope.type, vars });
    }
    
    const step = {
      lineNum: line,
      vars: scopeParts,
      rawVars: scopeParts.length ? scopeParts[0].vars : {},
      stack: params.callFrames.map(f => f.functionName || '(anonymous)'),
      reason: params.reason,
      bpType: 'normal',
      profilerData: null
    };

    this.timeline.record('bp-hit', `CDP:${line}`, { line });
    this.onEvent('breakpoint-hit', { line, step });
    this.onEvent('timeline-update', { events: this.timeline.getEvents() });
  }

  async run(code, filename, onConsoleMsg) {
     if (this.state === 'running') {
       onConsoleMsg({ type: 'warn', msg: "Target is already running remotely.", ts: ts() });
     } else if (this.state === 'paused') {
       this.resume();
     } else {
       onConsoleMsg({ type: 'warn', msg: "Not connected to CDP target. Use CONNECT first.", ts: ts() });
     }
  }
  
  resume() { if (this.ws && this.state === 'paused') this.send('Debugger.resume'); }
  stepOver() { if (this.ws && this.state === 'paused') this.send('Debugger.stepOver'); }
  stepInto() { if (this.ws && this.state === 'paused') this.send('Debugger.stepInto'); }
  stepOut() { if (this.ws && this.state === 'paused') this.send('Debugger.stepOut'); }
  
  async toggleBreakpoint(line, filename) {
    if (!this.ws) return;
    
    if (this.activeBreakpoints.has(line)) {
      const bpid = this.activeBreakpoints.get(line);
      await this.send('Debugger.removeBreakpoint', { breakpointId: bpid });
      this.activeBreakpoints.delete(line);
      this.timeline.record('bp-remove', `BP-${line}`, { line });
      this.onEvent('breakpoints-changed', { breakpoints: new Set(this.activeBreakpoints.keys()) });
    } else {
      const urlRegex = '.*';
      
      try {
        const res = await this.send('Debugger.setBreakpointByUrl', {
          lineNumber: line - 1,
          urlRegex
        });
        
        if (res.locations && res.locations.length === 0) {
           console.warn(`CDP Breakpoint matched no scripts`);
        }

        this.activeBreakpoints.set(line, res.breakpointId);
        this.timeline.record('bp-set', `CDP BP:${line}`, { line });
        this.onEvent('breakpoints-changed', { breakpoints: new Set(this.activeBreakpoints.keys()) });
      } catch (e) {
        this.timeline.record('err', `CDP BP ERR: ${e.message}`);
        console.error("CDP Breakpoint failed", e);
      }
    }
  }

  setConditionalBreakpoint() {}
  setLogpoint() {}
  setHitCountBreakpoint() {}
  clearBreakpoints() { this.activeBreakpoints.clear(); }
  
  // Fake implement for engine parity
  getBreakpointLines() { return new Set(this.activeBreakpoints.keys()); }
  getBreakpointAt(line) { return this.activeBreakpoints.has(line) ? { type: 'normal' } : null; }
  
  stop() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
