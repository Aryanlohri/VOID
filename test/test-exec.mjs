/**
 * Minimal reproduction of debug-engine logic executing the instrumented code
 */
import { CodeInstrumenter } from '../src/lib/code-instrumenter.js';
import { SAMPLE_CODE } from '../src/lib/helpers.js';

const instrumenter = new CodeInstrumenter();
const result = instrumenter.instrument(SAMPLE_CODE);

if (result.error) {
  console.log('INSTRUMENTATION ERROR:', result.error);
  process.exit(1);
}

// Mock runtime
const __rt = {
  check: async (line, scopeCapture) => { /* ignore */ },
  onException: async (e, line, isCaught) => { console.log('RT EXCEPTION:', e.message); },
  pushFrame: (name, line, args) => { /* ignore */ },
  popFrame: () => { /* ignore */ },
};

const proxyFetch = async (url) => { return { json: async () => ({ title: "Mock Title" }) }; };
const ProxyPromise = Promise;

const mockConsole = {
  log: (...args) => console.log('LOG:', ...args),
  error: (...args) => console.log('ERR:', ...args),
  warn: (...args) => console.log('WARN:', ...args),
  info: (...args) => console.log('INFO:', ...args)
};

console.log('--- STARTING EXECUTION ---');
try {
  const code = "'use strict'; return " + result.code;
  const fn = new Function('__rt', 'console', 'fetch', 'Promise', code);
  
  const executionPromise = fn(__rt, mockConsole, proxyFetch, ProxyPromise);
  await executionPromise;
  
  console.log('--- FINISHED OK ---');
} catch (e) {
  console.log('--- FAILED ---', e);
}
