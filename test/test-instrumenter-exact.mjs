import { CodeInstrumenter } from '../src/lib/code-instrumenter.js';

const SAMPLE_CODE = `// VOID Debugger v9.0 — Ultimate Sandbox Test Program
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

const instrumenter = new CodeInstrumenter();
const result = instrumenter.instrument(SAMPLE_CODE);

if (result.error) {
  console.log('INSTRUMENTATION ERROR:', result.error);
  process.exit(1);
}

console.log(result.code);
console.log('\n\n=== COMPILATION TEST ===');
try {
  const code = "'use strict'; return " + result.code;
  new Function('__rt', 'console', 'fetch', 'Promise', code);
  console.log('✅ SUCCEEDED');
} catch (e) {
  console.log('❌ FAILED:', e.message);
}
