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

let objectCache = new Map();
let nextObjectId = 1;

// --- SECURITY SANDBOXING ---
// Remove access to network and storage APIs to isolate user code
try {
  self.fetch = undefined;
  self.XMLHttpRequest = undefined;
  self.indexedDB = undefined;
  self.caches = undefined;
  self.Storage = undefined;
} catch (e) {
  console.warn("Sandbox constraint warning:", e);
}
// ---------------------------

function clearObjectCache() {
  objectCache.clear();
  nextObjectId = 1;
}

// Safely serialize scope variables to avoid DataCloneError in postMessage
// Now uses lazy serialization: depth 0 is expanded, depth 1+ is stubbed.
// (Strips functions, serializes prototypes to plain objects, handles circular refs)
function sanitizeScopeData(obj, depth = 0, seen = new WeakMap()) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'function') {
    return { __void_fn: true, name: obj.name || 'anonymous' };
  }
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Error) {
    return { name: obj.name, message: obj.message, stack: obj.stack };
  }
  
  if (seen.has(obj)) return '[Circular Reference]';

  if (depth > 0) {
     const id = nextObjectId++;
     objectCache.set(id, obj);
     
     let preview = '[Object]';
     let className = 'Object';
     if (Array.isArray(obj)) {
        preview = `Array(${obj.length})`;
        className = 'Array';
     } else {
        const proto = Object.getPrototypeOf(obj);
        if (proto && proto.constructor) className = proto.constructor.name;
        try {
           const keys = Object.keys(obj).slice(0, 3).join(', ');
           preview = `{${keys}${Object.keys(obj).length > 3 ? ', …' : ''}}`;
        } catch(e) {}
     }
     return { __isObjectId: true, id, preview, className };
  }
  
  const clone = Array.isArray(obj) ? [] : {};
  seen.set(obj, clone);
  
  try {
    const keys = Object.getOwnPropertyNames(obj);
    for (let i = 0; i < keys.length && i < 100; i++) {
      clone[keys[i]] = sanitizeScopeData(obj[keys[i]], depth + 1, seen);
    }
    if (keys.length > 100 && Array.isArray(obj)) clone.push('... (truncated)');

    const proto = Object.getPrototypeOf(obj);
    if (proto && proto !== Object.prototype) {
        clone['[[Prototype]]'] = sanitizeScopeData(proto, depth + 1, seen);
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
       clearObjectCache();
       safeData = { ...data };
       if (data.step) {
           safeData.step = { ...data.step };
           safeData.step.vars = sanitizeScopeData(data.step.vars, 0);
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
                 try { valStr = JSON.stringify(sanitizeScopeData(res.value, 0)); } catch(e) { valStr = String(res.value); }
             } else {
                 valStr = String(res.value);
             }
             self.postMessage({ type: 'eval-result', id: args.id, ok: true, value: valStr });
         } else {
             self.postMessage({ type: 'eval-result', id: args.id, ok: false, error: res.error });
         }
         break;
      }

      case 'getObjectProperties': {
          const obj = objectCache.get(args.objectId);
          if (!obj) {
             self.postMessage({ type: 'object-properties', id: args.msgId, properties: {} });
             break;
          }
          // Sanitize it at depth 0 so it recursively stubs its children 
          const props = sanitizeScopeData(obj, 0);
          self.postMessage({ type: 'object-properties', id: args.msgId, properties: props });
          break;
      }

      default:
        console.warn('Worker received unknown action:', action);
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message, stack: error.stack });
  }
};
