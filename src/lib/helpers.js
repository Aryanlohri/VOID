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

export const SAMPLE_CODE = `// 🚀 VOID Debugger - Ultimate Capability Demo

async function startCoolDemo() {
  console.log("🚀 Starting VOID Deep Profiler Demo...");
  
  // 1. Recursive algorithm to visualize the call stack and memory growth
  async function mergeSort(arr) {
    if (arr.length <= 1) return arr;
    const mid = Math.floor(arr.length / 2);
    
    // Put a breakpoint on the next line to watch the call stack deepen!
    const left = await mergeSort(arr.slice(0, mid));
    const right = await mergeSort(arr.slice(mid));
    
    let result = [], i = 0, j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] < right[j]) result.push(left[i++]);
      else result.push(right[j++]);
    }
    return result.concat(left.slice(i)).concat(right.slice(j));
  }

  // Generate some randomized data
  const data = [];
  for(let i=0; i<10; i++) data.push(Math.floor(Math.random() * 100));
  
  console.log("Unsorted Data:", data);
  
  const sorted = await mergeSort(data);
  console.log("Sorted Data:", sorted);

  // 2. Dual-fetching with Promises to visualize network resolution in the Network panel
  console.log("Fetching user and post data concurrently...");
  const p1 = fetch("https://jsonplaceholder.typicode.com/users/1").then(r => r.json());
  const p2 = fetch("https://jsonplaceholder.typicode.com/posts/1").then(r => r.json());
  
  const [user, post] = await Promise.all([p1, p2]);
  
  // You can expand these objects in the Memory Inspector!
  console.log(\`👤 Fetched User:\`, user);
  console.log(\`📝 Fetched Post:\`, post);

  // 3. Simulating a closure scope trap
  let count = 0;
  
  // We use a custom loop to simulate interval without blocking the sandbox
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    count++;
    console.log(\`Tick \${count}...\`);
  }
  
  console.log("Demo completed perfectly! ✅");
}

startCoolDemo();
`;
