import { useState, useEffect, useCallback } from 'react';
import { useDebugger } from './hooks/useDebugger.js';
import Header from './components/Header.jsx';
import Toolbar from './components/Toolbar.jsx';
import TabBar from './components/TabBar.jsx';
import CodeEditor from './components/CodeEditor.jsx';
import VariablesPanel from './components/VariablesPanel.jsx';
import CallStackPanel from './components/CallStackPanel.jsx';
import WatchPanel from './components/WatchPanel.jsx';
import ConsolePanel from './components/ConsolePanel.jsx';
import BottomBar from './components/BottomBar.jsx';

export default function App() {
  const [theme, setTheme] = useState('dark');
  const db = useDebugger();

  // Theme toggle
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '');
      return next;
    });
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F5' && !e.shiftKey) { e.preventDefault(); db.doRun(); }
      if (e.key === 'F5' && e.shiftKey) { e.preventDefault(); db.doStop(); }
      if (e.key === 'F10') { e.preventDefault(); db.doStep('over'); }
      if (e.key === 'F11') { e.preventDefault(); db.doStep('into'); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); db.openFile(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); db.saveFile(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [db]);

  return (
    <>
      <div className="scanlines" />
      <div className="noise" />

      <div id="app">
        <Header engineState={db.engineState} />

        <Toolbar
          engineState={db.engineState}
          onRun={db.doRun}
          onStepOver={() => db.doStep('over')}
          onStepInto={() => db.doStep('into')}
          onStop={db.doStop}
          onClear={db.doClear}
          onOpenFile={db.openFile}
          onSaveFile={db.saveFile}
          onToggleTheme={toggleTheme}
        />

        <div className="main-grid">
          <div className="editor-column">
            <TabBar
              files={db.files}
              activeFileIdx={db.activeFileIdx}
              onSwitch={db.switchFile}
              onClose={db.closeFile}
              onAdd={() => db.addFile()}
            />
            <CodeEditor
              code={db.code}
              highlightParts={db.highlightParts}
              breakpoints={db.breakpoints}
              currentStep={db.currentStep}
              astErrors={db.astErrors}
              fnRanges={db.fnRanges}
              onCodeChange={db.onCodeChange}
              onToggleBreakpoint={db.toggleBreakpoint}
              onJumpToDefinition={db.jumpToDefinition}
            />
          </div>

          <div className="panel-stack">
            <VariablesPanel variables={db.variables} />
            <CallStackPanel callStack={db.callStack} />
            <WatchPanel
              watchExprs={db.watchExprs}
              onAdd={db.addWatch}
              onRemove={db.removeWatch}
              evaluateWatch={db.evaluateWatch}
            />
          </div>

          <ConsolePanel
            consoleLines={db.consoleLines}
            onEvaluate={db.evaluateExpr}
            onClear={db.clearConsole}
            historyUp={db.consoleHistoryUp}
            historyDown={db.consoleHistoryDown}
          />
        </div>

        <BottomBar
          breakpoints={db.breakpoints}
          timelineEvents={db.timelineEvents}
          onToggleBreakpoint={db.toggleBreakpoint}
        />
      </div>
    </>
  );
}
