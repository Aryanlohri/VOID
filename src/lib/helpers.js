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

export const SAMPLE_CODE = `// VOID Debugger v9.0 — Ultimate Sandbox Test Program
// 1. Deep Call Stack & Scope Hierarchy
// 2. Memory Inspector (Deep Objects & Prototypes)
// 3. Performance Profiling (Loops & Recursion)
// 4. Async Networking (Fetch & Promises)
// 5. Hard Stop isolated Web Worker (Infinite Loop test)

// Hit "Run" or F5 to begin!

// --- Memory & Scope ---
class DataProcessor {
  constructor(multiplier) {
    this.multiplier = multiplier;
  }
  process(val) {
    return val * this.multiplier;
  }
}

// --- Async & Network ---
async function fetchStats() {
  console.log("Fetching simulated data...");
  const res = await fetch("https://jsonplaceholder.typicode.com/todos/1");
  const data = await res.json();
  return data;
}

// --- Profiling & Call Stack ---
function recursiveFactorial(n) {
  if (n <= 1) return 1;
  return n * recursiveFactorial(n - 1); // Step into to see stack grow
}

// --- Main Execution ---
async function runDemo() {
  try {
    // 1. Closures & Prototypes
    const processor = new DataProcessor(42);
    let capturedVar = "I am tracked dynamically!";
    
    const leakScope = () => {
      console.log(capturedVar, processor.process(2));
    };
    leakScope();

    // 2. Complex Objects (Expand in Memory Inspector)
    const deepObject = {
       user: { id: 1, roles: ["admin", "editor"] },
       settings: new Map([["theme", "dark"], ["timeout", 500]])
    };

    // 3. Call Stack & Hit Counts 
    const fact = recursiveFactorial(5);
    console.log("Factorial result:", fact);

    // 4. Network & Promise Tracking
    const promise1 = fetchStats();
    const promise2 = new Promise(resolve => resolve("Async resolve tick"));
    
    const [stats, msg] = await Promise.all([promise1, promise2]);
    console.log("Network JSON:", stats.title);

    // 5. Worker Sandbox Tests (Uncomment to test Hard Stop!)
    // while(true) { /* UI stays responsive! */ }

    // 6. Exception Catching
    throw new Error("Testing localized runtime exception handling!");

  } catch (err) {
    console.error("Caught error:", err.message);
  }
}

// Kickoff Execution
runDemo();
`;
