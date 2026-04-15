# VOID DEBUGGER v3.0

> A from-scratch JavaScript debugger with **AST-instrumented execution**, built in React.

---

## ✨ What It Does

VOID is a fully browser-based JavaScript debugger — no Node.js backend, no npm dependencies at runtime. It parses your code into an AST, instruments every statement with async checkpoints, and gives you **real** pause/resume debugging with **real** variable values.

### Phase 3 — True Step Engine

Unlike toy debuggers that scan lines with regex, VOID uses **AST code transformation** to insert async breakpoints at every statement. When your code hits a checkpoint, execution genuinely pauses via a Promise gate — the variables you see are the actual runtime values, not guesses.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React UI (Vite)                       │
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

### How the Async Gate Works

```
User Code → Acorn Parse → AST Walk → Insert Checkpoints → Async Function
                                                              ↓
                                              await __rt.check(line, scopeFn)
                                                              ↓
                                                  ┌─── Breakpoint? ───┐
                                                  ↓                   ↓
                                             Pause (Promise)    Continue (resolve)
                                                  ↓
                                          UI updates with
                                          REAL variable values
                                                  ↓
                                          User clicks Resume/Step
                                                  ↓
                                          Promise resolves →
                                          execution continues
```

---

## 📦 Project Structure

```
Debugger/
├── index.html                # Vite entry (Google Fonts, meta)
├── package.json              # React 19 + Acorn + Vite 8
├── vite.config.js
├── src/
│   ├── main.jsx              # React root
│   ├── App.jsx               # Layout + keyboard shortcuts
│   ├── index.css             # Cod Gray theme (dark/light)
│   ├── lib/
│   │   ├── helpers.js        # Utilities, constants, sample code
│   │   ├── ast-engine.js     # Acorn AST parser + syntax highlighter
│   │   ├── code-instrumenter.js  # AST transform: insert checkpoints
│   │   ├── execution-runtime.js  # Async gate controller
│   │   ├── breakpoint-manager.js # Rich breakpoint types
│   │   └── debug-engine.js   # Orchestrator (v3)
│   ├── hooks/
│   │   └── useDebugger.js    # Central React state hook
│   └── components/
│       ├── Header.jsx        # Logo + status + clock
│       ├── Toolbar.jsx       # Run/Step/Stop/Open/Save
│       ├── TabBar.jsx        # Multi-file tabs
│       ├── CodeEditor.jsx    # Layered editor + BP context menu
│       ├── VariablesPanel.jsx
│       ├── CallStackPanel.jsx
│       ├── WatchPanel.jsx
│       ├── ConsolePanel.jsx  # REPL with real scope access
│       └── BottomBar.jsx     # BP chips + timeline
└── vanilla-backup/           # Pre-React vanilla version
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F5` | Run / Resume |
| `Shift+F5` | Stop |
| `F10` | Step Over |
| `F11` | Step Into |
| `Shift+F11` | Step Out |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save file |
| `Ctrl+Click` | Jump to definition |
| `Right-click line` | Breakpoint context menu |

---

## 🔴 Breakpoint Types

| Type | Icon | Description |
|------|------|-------------|
| Normal | ● | Pause at this line |
| Conditional | ◆ | Pause when expression is truthy, e.g. `i === 5` |
| Logpoint | ◇ | Log a message without pausing: `"x = {x}"` |
| Hit Count | ◈ | Pause on the Nth hit |
| Exception | ⚡ | Pause on thrown errors (via settings) |

---

## 🎨 Design System

| Token | Value | Usage |
|-------|-------|-------|
| Cod Gray | `#111111` | Background |
| Surface | `#171717` | Panels |
| Warm Amber | `#d4a574` | Keywords, accents |
| Mint Green | `#7ec9a4` | Strings, success |
| Steel Blue | `#7eb8da` | Numbers, info |
| Rose | `#d47b8a` | Errors, breakpoints |
| Lilac | `#b09cd8` | Functions, logpoints |

---

## 🚀 Quick Start

```bash
cd Debugger
npm install
npm run dev
# Open http://localhost:5173
```

---

## 📋 Roadmap

- [x] **Phase 1 — Foundation**: Breakpoints, stepping, variables, call stack, REPL, watch, timeline
- [x] **Phase 2 — Source Intelligence**: AST parsing (Acorn), syntax highlighting, multi-file tabs, code folding
- [x] **React Conversion**: Full port to Vite + React component architecture
- [x] **Phase 3 — True Step Engine**: AST-instrumented execution, async gates, step into/over/out, conditional breakpoints, logpoints, hit count breakpoints, exception breakpoints, continue to cursor
- [ ] **Phase 4 — Memory Inspector**: Heap snapshots, closure scope chains, prototype explorer
- [ ] **Phase 5 — Profiler**: CPU flame chart, hot-path highlighting, event loop latency
- [ ] **Phase 6 — Async/Network**: Promise chain visualizer, fetch inspector
- [ ] **Phase 7 — Multi-Language**: Python via Pyodide, TypeScript support
- [ ] **Phase 8 — Remote Debugging**: Chrome DevTools Protocol integration

---

## 📄 Changelog

### v3.0.0 — Phase 3: True Step Engine
- **AST-Instrumented Execution**: Code is transformed via Acorn AST to insert async checkpoints at every statement
- **Real Variable Values**: Variables panel shows actual runtime values, not regex guesses
- **Async Gate Controller**: Execution genuinely pauses via Promise gate — not setTimeout simulation
- **Step Into/Over/Out**: Real scope entry/exit tracking via call depth
- **Conditional Breakpoints**: Evaluate JS expressions in scope context (e.g., `i === 5`)
- **Logpoints**: Log interpolated messages without pausing (`"value is {x}"`)
- **Hit Count Breakpoints**: Break on Nth execution of a line
- **Exception Breakpoints**: Pause on thrown errors
- **Continue to Cursor**: Run until a specific line
- **Context Menu**: Right-click line numbers for breakpoint type selection
- **Real REPL**: Console evaluates expressions with actual runtime scope

### v2.0.0 — Phase 2: Source Intelligence + React
- Acorn AST parsing and syntax tokenization
- Multi-file tab system with File System Access API
- Hover-to-inspect with runtime value tooltips
- Full React conversion with Vite
- Cod Gray (#171717) design system

### v1.0.0 — Phase 1: Foundation
- Custom step-through execution engine
- Breakpoint system with line-number gutter
- Variables panel, call stack, watch expressions
- REPL console with history
- Execution timeline visualization

---

## 🛠️ Tech Stack

- **React 19** — Component architecture
- **Vite 8** — Build tooling + HMR
- **Acorn** — AST parsing + code instrumentation
- **Vanilla CSS** — Cod Gray design system
- **ES2024** — Async/await, Proxy, WeakMap
