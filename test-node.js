/**
 * VOID Debugger — Remote CDP Target Test
 * 
 * Instructions:
 * 1. Run this file in your terminal: node --inspect test-node.js
 * 2. In VOID Debugger, click "CONNECT CDP".
 * 3. Open this file in VOID, or paste its contents.
 * 4. Place a breakpoint on line 16.
 * 5. Watch the debugger attach to the live Node.js process!
 */

console.log("Starting remote debugger target...");

let counter = 0;

function doWork() {
  counter++;
  const name = "NodeApp";
  const data = { iter: counter, target: name };
  
  if (counter % 2 === 0) {
     console.log("Even tick!", data);
  } else {
     console.log("Odd tick!", data);
  }
}

setInterval(() => {
  doWork();
}, 3000);
