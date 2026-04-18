/**
 * VOID DEBUGGER — Python Instrumenter (Phase 7)
 * Uses Pyodide and Python's ast module to inject await checkpoints.
 */

let pyodideInstance = null;

export async function initPyodide(onConsoleMsg) {
  if (pyodideInstance) return pyodideInstance;
  if (!window.loadPyodide) throw new Error("Pyodide not loaded in index.html");
  
  if (onConsoleMsg) onConsoleMsg({ type: 'info', msg: 'Loading Pyodide environment...', ts: Date.now() });
  
  pyodideInstance = await window.loadPyodide({
    stdout: (msg) => { if(onConsoleMsg) onConsoleMsg({ type: 'log', msg, ts: Date.now() }) },
    stderr: (msg) => { if(onConsoleMsg) onConsoleMsg({ type: 'error', msg, ts: Date.now() }) },
  });
  
  const pythonSetupScript = `
import ast
import asyncio

class VoidInstrumenter(ast.NodeTransformer):
    def generic_visit(self, node):
        super().generic_visit(node)
        if hasattr(node, 'body') and isinstance(node.body, list):
            new_body = []
            for stmt in node.body:
                if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Import, ast.ImportFrom)):
                    new_body.append(stmt)
                    continue
                
                line = getattr(stmt, 'lineno', 1)
                
                check_call = ast.Await(
                    value=ast.Call(
                        func=ast.Name(id='__rt_check', ctx=ast.Load()),
                        args=[
                            ast.Constant(value=line),
                            ast.Call(func=ast.Name(id='locals', ctx=ast.Load()), args=[], keywords=[])
                        ],
                        keywords=[]
                    )
                )
                check_expr = ast.Expr(value=check_call)
                ast.copy_location(check_expr, stmt)
                
                new_body.append(check_expr)
                new_body.append(stmt)
            node.body = new_body
        return node

def instrument_and_run(code_str, check_func, done_func, err_func):
    try:
        tree = ast.parse(code_str)
        tree = VoidInstrumenter().visit(tree)
        ast.fix_missing_locations(tree)
        
        wrapper = ast.parse("async def __void_main(): pass")
        wrapper.body[0].body = tree.body
        compiled = compile(wrapper, filename="<ast>", mode="exec")
        
        env = { "__rt_check": check_func }
        exec(compiled, env)
        
        asyncio.ensure_future(env['__void_main']()).add_done_callback(
            lambda fut: err_func(fut.exception()) if fut.exception() else done_func()
        )
    except Exception as e:
        err_func(str(e))
`;
  await pyodideInstance.runPythonAsync(pythonSetupScript);
  if (onConsoleMsg) onConsoleMsg({ type: 'info', msg: 'Pyodide initialized.', ts: Date.now() });
  return pyodideInstance;
}

export async function runPythonCode(code, runtime, onConsoleMsg) {
  const pyodide = await initPyodide(onConsoleMsg);

  return new Promise((resolve, reject) => {
    const check_func = async (line, localsDict) => {
      let jsLocals = {};
      if (localsDict && typeof localsDict.toJs === 'function') {
        try {
          const map = localsDict.toJs();
          for (const [k, v] of map.entries()) {
             // basic python to string logic
             jsLocals[k] = v;
          }
        } catch (e) {
             jsLocals['__error__'] = 'Could not parse locals';
        }
      }
      
      const scopeData = () => [{ name: 'Python Locals', type: 'Global', vars: jsLocals }];
      
      try {
        await runtime.check(line, scopeData);
      } catch (e) {
        if (e.message === '__VOID_EXECUTION_STOPPED__') {
          // If stopped, we just want to safely return to python execution 
          // and let the runner kill it, or raise an exception in Python
          // We can't cleanly abort pyodide asyncio from here easily 
          // without exception, so we'll throw an error to propagate up.
          throw e; 
        }
        throw e;
      }
    };

    const done_func = () => { resolve(); };
    const err_func = (err) => { reject(err); };

    pyodide.globals.get("instrument_and_run")(code, check_func, done_func, err_func);
  });
}
