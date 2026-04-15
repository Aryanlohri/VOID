/**
 * VOID DEBUGGER — Helpers
 * Shared utility functions.
 */

export function ts() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function detectType(val) {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'function') return 'fn';
  if (typeof val === 'boolean') return 'bool';
  if (typeof val === 'number') return 'number';
  if (typeof val === 'string') return 'str';
  if (Array.isArray(val)) return 'array';
  return 'object';
}

export function formatValue(val) {
  const t = detectType(val);
  if (t === 'fn') return '[Function]';
  if (t === 'null') return 'null';
  if (t === 'undefined') return 'undefined';
  if (t === 'str') return `"${String(val).slice(0, 40)}"`;
  if (t === 'array') return `[…] (${val.length})`;
  if (t === 'object') {
    try { return JSON.stringify(val).slice(0, 60); } catch { return '[Object]'; }
  }
  return String(val);
}

export function extractFnName(line) {
  let m;
  m = line.match(/function\s+(\w+)/); if (m) return m[1];
  m = line.match(/(?:const|let|var)\s+(\w+)\s*=/); if (m) return m[1];
  return null;
}

export const STEP_DELAY_MS = 400;
export const MAX_TIMELINE = 80;

export const SAMPLE_CODE = `// VOID Debugger v2.0 — Sample Program
// Set breakpoints by clicking line numbers.
// Hover over variables during execution to inspect values.
// Then hit RUN or STEP to begin.

function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function greet(name, times) {
  const messages = [];
  for (let i = 0; i < times; i++) {
    const msg = "Hello, " + name + "! (" + (i + 1) + ")";
    messages.push(msg);
    console.log(msg);
  }
  return messages;
}

function compute() {
  const results = {};
  const names = ["Alice", "Bob", "Void"];

  for (const name of names) {
    const count = name.length;
    results[name] = fibonacci(count);
    console.log(name + " => fib(" + count + ") = " + results[name]);
  }

  const greetings = greet("Debugger", 3);
  console.log("Total greetings:", greetings.length);

  return results;
}

const output = compute();
console.log("Final output:", JSON.stringify(output));
`;
