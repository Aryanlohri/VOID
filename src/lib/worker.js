/**
 * VOID DEBUGGER — Web Worker Environment
 * Executes user code in absolute isolation.
 * Prevents UI freezes on infinite loops and removes DOM access.
 */
import { DebugEngine, TimelineLog, ConsoleEngine } from './debug-engine.js';
import { ts } from './helpers.js';

let timeline = new TimelineLog();
let engine = null;
let consoleEng = new ConsoleEngine();

// Safely serialize scope variables to avoid DataCloneError in postMessage
// (Strips functions, serializes prototypes to plain objects, handles circular refs)
function sanitizeScopeData(obj, seen = new WeakMap()) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'function') {
    return { __void_fn: true, name: obj.name || 'anonymous' };
  }
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Error) {
    return { name: obj.name, message: obj.message, stack: obj.stack };
  }
  
  if (seen.has(obj)) return '[Circular Reference]';
  
  if (Array.isArray(obj)) {
    const arr = [];
    seen.set(obj, arr);
    for (let i = 0; i < obj.length && i < 100; i++) {
        arr[i] = sanitizeScopeData(obj[i], seen);
    }
    if (obj.length > 100) arr.push('... (truncated)');
    return arr;
  }
  
  const clone = {};
  seen.set(obj, clone);
  try {
    for (const key of Object.keys(obj)) {
      clone[key] = sanitizeScopeData(obj[key], seen);
    }
    // Pull __proto__ properties shallowly so ObjectTree can see them
    const proto = Object.getPrototypeOf(obj);
    if (proto && proto !== Object.prototype) {
        // Just note it's a custom obect
        clone['[[Prototype]]'] = proto.constructor ? proto.constructor.name : 'Object';
    }
  } catch(e) {}
  return clone;
}

function initEngine() {
  if (engine) engine.stop();
  timeline.clear();
  engine = new DebugEngine(timeline, (type, data) => {
    let safeData = data;
    
    // Checkpoints contain scope information that must be sanitized
    if (type === 'step' || type === 'breakpoint-hit' || type === 'exception-hit') {
       safeData = { ...data };
       if (data.step) {
           safeData.step = { ...data.step };
           safeData.step.vars = sanitizeScopeData(data.step.vars);
           // We don't send rawVars across postMessage strictly anymore; Proxy doesn't need it
           safeData.step.rawVars = null; 
       }
       if (type === 'exception-hit' && data.exception) {
           safeData.exception = { message: data.exception.message, stack: data.exception.stack };
       }
    }
    
    self.postMessage({ type: 'engine-event', eventType: type, data: safeData });
  });
}

initEngine();

const handleConsole = (msg) => {
  self.postMessage({ type: 'console', ...msg });
};

self.onmessage = async (e) => {
  const { action, args } = e.data;
  
  try {
    let result = undefined;
    switch (action) {
      case 'run':
        await engine.run(args.code, args.filename, handleConsole);
        break;
      case 'runToFirstCheckpoint':
        await engine.runToFirstCheckpoint(args.code, args.filename, handleConsole);
        break;
      case 'resume': engine.resume(); break;
      case 'stepOver': engine.stepOver(); break;
      case 'stepInto': engine.stepInto(); break;
      case 'stepOut': engine.stepOut(); break;
      case 'continueToCursor': engine.continueToCursor(args.line); break;
      case 'stop': 
        engine.stop(); 
        break;

      case 'toggleBreakpoint': engine.toggleBreakpoint(args.line); break;
      case 'setConditionalBreakpoint': engine.setConditionalBreakpoint(args.line, args.condition); break;
      case 'setLogpoint': engine.setLogpoint(args.line, args.logMessage); break;
      case 'setHitCountBreakpoint': engine.setHitCountBreakpoint(args.line, args.hitTarget); break;
      case 'clearBreakpoints': engine.clearBreakpoints(); break;
      case 'setExceptionBreakpoints': engine.setExceptionBreakpoints(args.enabled, args.uncaughtOnly); break;
      case 'restoreBreakpoints': 
         if (engine && engine.bpManager) engine.bpManager.deserialize(args.serializedBPData); 
         break;
         
      case 'evaluateExpr': {
         // Evaluate code inside the worker context
         const ctx = engine ? engine.getCurrentScope() : {};
         const res = consoleEng.evaluate(args.expr, ctx);
         // Sanitize result
         if (res.ok) {
             let valStr = '';
             if (res.value !== null && typeof res.value === 'object') {
                 try { valStr = JSON.stringify(sanitizeScopeData(res.value)); } catch(e) { valStr = String(res.value); }
             } else {
                 valStr = String(res.value);
             }
             self.postMessage({ type: 'eval-result', id: args.id, ok: true, value: valStr });
         } else {
             self.postMessage({ type: 'eval-result', id: args.id, ok: false, error: res.error });
         }
         break;
      }

      default:
        console.warn('Worker received unknown action:', action);
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message, stack: error.stack });
  }
};
