# VOID DEBUGGER

> A from-scratch JavaScript debugger with **AST-instrumented execution**, built natively in React.

## ✨ Overview

VOID is a fully browser-based JavaScript debugger — no Node.js backend, no local dependencies at runtime. It works by parsing your code into an Abstract Syntax Tree (AST) and natively instrumenting statements with asynchronous checkpoints, yielding **real** variable inspection, heap state tracking, and line telemetry.

### Why VOID?
Unlike simplistic tools that use regex to fake breakpoint positions, VOID leverages true **AST code transformation**. When a user checkpoint triggers, it uses a top-level Promise gate to legitimately hold JavaScript execution without blocking the main event-loop, feeding true in-memory scope trees directly into the UI.

---

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    React UI (Vite)                      │
│  App → Header, Toolbar, CodeEditor, Panels, Console     │
├─────────────────────────────────────────────────────────┤
│               useDebugger() Hook                        │
│  Central state: code, breakpoints, variables, callStack │
├─────────────────────────────────────────────────────────┤
│                   DebugEngine v3                        │
│  Orchestrates instrumentation → execution → UI events   │
├──────────┬──────────────┬──────────────┬────────────────┤
│ CodeInst │ ExecRuntime  │ BPManager    │ ASTEngine      │
│ rumenter │ (async gate) │ (rich BPs)   │ (Acorn parse)  │
└──────────┴──────────────┴──────────────┴────────────────┘
```

---

## 🎨 Design & Advanced Prototyping

VOID uses a custom standard "Cod Gray" system optimized for long focused debugging sessions. As the debugger matures, major workflow accelerators are designed as prototypes before full integration:

- **Ghost Runs (Beta Prototype)**: Execute multiple "shadow" threads based on variant inputs natively inside a single timeline graph. Visual traces identify exact divergence paths without needing repetitive re-executions.
- **What-If Sandbox (Beta Prototype)**: Allows a user stopped at a breakpoint to locally overwrite variable states and project forward-execution side effects (results & skipped lines) safely mapped inline.

*Note: The standalone concepts interface is viewable directly via `void-prototype.html`.*

---

## 📦 Core System Features

### Breakpoint Matrix
| Type | Icon | Description |
|------|------|-------------|
| **Normal** | ● | Pause exactly before line execution. |
| **Conditional** | ◆ | Evaluate active-scope expression (e.g. `i === 5`). |
| **Logpoint** | ◇ | Trace telemetry cleanly (`"value: {x}"`). |
| **Hit Count** | ◈ | Dynamically halt specifically on the *Nth* cyclic hit. |
| **Exception** | ⚡ | Interrupt thread safely upon thrown errors. |

### Technical Analysis
- **Memory Inspector**: N-Depth hierarchical tracking of Local, Closure, and Global environments paired directly with DOM Heap Object-Reference snapshots.
- **Performance Profiling**: Asynchronous Event-Loop latency visualizations layered into the Code Editor as heatmaps and hit-counts tracking.
- **Network Extensibility**: Native proxy overrides mapping dynamic `fetch` lifecycles and resolving `Promise` chain states live.
- **Polyglot Execution**: AST compilation interceptors evaluating `JavaScript`, executing zero-overhead `TypeScript` (Sucrase), and isolating `Python` runtimes directly inside browser WebAssembly (Pyodide).

---

## ⌨️ Shortcut Bindings

| Key | Action |
|-----|--------|
| `F5` | Run / Resume Thread |
| `Shift+F5` | Hard Stop |
| `F10` | Step Over |
| `F11` | Step Into |
| `Shift+F11` | Step Out |
| `Right-click gutter`| Contextually switch BP Type |

---

## 🚀 Quick Start

```bash
cd Debugger
npm install
npm run dev

# Mounts native dev server to http://localhost:5173
```

---

## 🛣️ Roadmap Trackers

- ✅ **Phase 1 & 2**: React UI scaffolding, Variables, Timeline, and Acorn syntax ingestion.
- ✅ **Phase 3 (Step Engine)**: AST async gates, advanced conditional breaks, step bounds logic.
- ✅ **Phase 4 (Memory)**: Deep closure tracing and prototypal inspection engines.
- ✅ **Phase 5 (Profiler)**: Hot-path latency heatmaps and CPU load visualization.
- ✅ **Phase 6 (Async Network)**: Fetch interceptors and asynchronous DOM Promise visualizers.
- ✅ **Phase 7 (Multi-Languages)**: TypeScript injection and remote Python WASM engines.
- ⏳ **Phase 8 (External Protocol)**: Chrome DevTools implementation endpoints.
