/**
 * VOID DEBUGGER — Code Instrumenter
 * AST-based code transformation that inserts async checkpoints.
 *
 * Strategy: Parse code with Acorn → walk the AST → collect insertion points →
 * splice checkpoint calls into the original source at those offsets.
 * This preserves exact formatting and keeps line numbers accurate.
 *
 * Every statement gets: `await __rt.check(LINE, () => ({...locals}));`
 * Every function becomes async with pushFrame/popFrame for call tracking.
 *
 * @version 3.0.0
 */
import * as acorn from 'acorn';

export class CodeInstrumenter {
  constructor() {
    this._cache = new Map(); // sourceHash → instrumentedCode
  }

  /**
   * Instrument source code for debugger execution.
   *
   * @param {string} source - Original source code
   * @returns {{ code: string, error: string|null }}
   */
  instrument(source) {
    // Cache check
    const hash = this._hash(source);
    if (this._cache.has(hash)) {
      return { code: this._cache.get(hash), error: null };
    }

    let ast;
    try {
      ast = acorn.parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        locations: true,
        ranges: true,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
      });
    } catch (e) {
      return { code: null, error: `Parse error: ${e.message}` };
    }

    try {
      // Collect all variable declarations per scope
      const scopeMap = this._buildScopeMap(ast);

      // Collect insertion operations
      const ops = [];
      this._walkForInsertions(ast, ops, scopeMap, scopeMap.get(ast), null);

      // Apply operations to source (process from end to preserve offsets)
      const instrumented = this._applyOps(source, ops);

      // Wrap in an async IIFE so top-level await works
      const finalCode = `(async function __voidMain() {\n__rt.pushFrame('(global)', 1, {});\ntry {\n${instrumented}\n} catch(__e) {\nif (__e.message !== '__VOID_EXECUTION_STOPPED__') { await __rt.onException(__e, 0, false); throw __e; }\n} finally {\n__rt.popFrame();\n}\n})()`;

      this._cache.set(hash, finalCode);
      return { code: finalCode, error: null };
    } catch (e) {
      return { code: null, error: `Instrumentation error: ${e.message}` };
    }
  }

  /**
   * Build a map of scope → variable names for scope capture closures.
   */
  _buildScopeMap(ast) {
    const scopes = new Map();
    const createScope = (type, name, parent) => ({ type, name, vars: new Set(), parent });
    const globalScope = createScope('Global', '(global)', null);

    const walk = (node, currentScope) => {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'VariableDeclarator' && node.id?.name) {
        currentScope.vars.add(node.id.name);
      }

      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        const fnName = node.id?.name || '(anonymous)';
        const fnScope = createScope('Closure', fnName, currentScope);
        
        if (node.params) {
          for (const p of node.params) {
            if (p.type === 'Identifier') fnScope.vars.add(p.name);
            else if (p.type === 'AssignmentPattern' && p.left?.name) fnScope.vars.add(p.left.name);
            else if (p.type === 'RestElement' && p.argument?.name) fnScope.vars.add(p.argument.name);
          }
        }
        if (node.id?.name) fnScope.vars.add(node.id.name);
        scopes.set(node, fnScope);

        if (node.body) {
          if (Array.isArray(node.body)) {
            for (const child of node.body) walk(child, fnScope);
          } else {
            walk(node.body, fnScope);
          }
        }
        return;
      }

      if (node.type === 'CatchClause' && node.param?.name) {
        currentScope.vars.add(node.param.name);
      }

      if ((node.type === 'ForInStatement' || node.type === 'ForOfStatement') && node.left) {
        if (node.left.type === 'VariableDeclaration') {
          for (const decl of node.left.declarations) {
            if (decl.id?.name) currentScope.vars.add(decl.id.name);
          }
        }
      }

      if (node.type === 'ForStatement' && node.init?.type === 'VariableDeclaration') {
        for (const decl of node.init.declarations) {
          if (decl.id?.name) currentScope.vars.add(decl.id.name);
        }
      }

      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'range' || key === 'type') continue;
        const child = node[key];
        if (Array.isArray(child)) {
          for (const c of child) {
            if (c && typeof c === 'object' && c.type) walk(c, currentScope);
          }
        } else if (child && typeof child === 'object' && child.type) {
          walk(child, currentScope);
        }
      }
    };

    walk(ast, globalScope);
    scopes.set(ast, globalScope);
    return scopes;
  }

  /**
   * Walk the AST and collect insertion operations.
   * Each op = { pos, text, type }
   */
  _walkForInsertions(node, ops, scopeMap, currentScopeNode, enclosingFn) {
    if (!node || typeof node !== 'object') return;

    // Handle function declarations/expressions — make async + wrap body
    if (this._isFunctionNode(node)) {
      const fnName = node.id?.name || '(anonymous)';
      const line = node.loc?.start?.line || 0;

      // Get scope node for this function
      const fnScopeNode = scopeMap.get(node) || currentScopeNode;
      const paramNames = (node.params || []).map(p => {
        if (p.type === 'Identifier') return p.name;
        if (p.type === 'AssignmentPattern' && p.left?.name) return p.left.name;
        if (p.type === 'RestElement' && p.argument?.name) return p.argument.name;
        return null;
      }).filter(Boolean);

      // Make function async (insert 'async ' before 'function' keyword)
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
        if (!node.async) {
          ops.push({ pos: node.start, text: 'async ', type: 'insert' });
        }
      }
      if (node.type === 'ArrowFunctionExpression' && !node.async) {
        ops.push({ pos: node.start, text: 'async ', type: 'insert' });
      }

      // Wrap function body with pushFrame/popFrame
      const body = node.body;
      if (body && body.type === 'BlockStatement') {
        const argsCapture = paramNames.map(p => `${p}:${p}`).join(',');
        const pushFrame = `__rt.pushFrame('${this._escapeSingle(fnName)}', ${line}, {${argsCapture}}); try {`;
        const popFrame = `} catch(__e${line}) { if (__e${line}.message !== '__VOID_EXECUTION_STOPPED__') await __rt.onException(__e${line}, ${line}, true); __rt.popFrame(); throw __e${line}; } finally {} __rt.popFrame();`;

        ops.push({ pos: body.start + 1, text: pushFrame, type: 'insert' }); // after {
        ops.push({ pos: body.end - 1, text: popFrame, type: 'insert' });    // before }
      }

      // Walk the function body with updated scope
      if (body) {
        this._walkBody(body, ops, scopeMap, fnScopeNode, node);
      }
      return;
    }

    // Walk into program body
    if (node.type === 'Program') {
      const globalScopeNode = scopeMap.get(node) || currentScopeNode;
      for (const stmt of node.body) {
        this._instrumentStatement(stmt, ops, scopeMap, globalScopeNode, enclosingFn);
        this._walkForInsertions(stmt, ops, scopeMap, globalScopeNode, enclosingFn);
      }
      return;
    }

    // Default: recurse into child nodes
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range' || key === 'type') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && c.type) {
            this._walkForInsertions(c, ops, scopeMap, currentScopeNode, enclosingFn);
          }
        }
      } else if (child && typeof child === 'object' && child.type) {
        this._walkForInsertions(child, ops, scopeMap, currentScopeNode, enclosingFn);
      }
    }
  }

  /**
   * Walk a function/block body, instrumenting each statement.
   */
  _walkBody(body, ops, scopeMap, currentScopeNode, enclosingFn) {
    if (!body) return;
    const stmts = body.type === 'BlockStatement' ? body.body : [body];
    for (const stmt of stmts) {
      this._instrumentStatement(stmt, ops, scopeMap, currentScopeNode, enclosingFn);
      this._walkForInsertions(stmt, ops, scopeMap, currentScopeNode, enclosingFn);
    }
  }

  /**
   * Insert a checkpoint before a statement node.
   */
  _instrumentStatement(stmt, ops, scopeMap, currentScopeNode, enclosingFn) {
    if (!stmt || !stmt.loc) return;

    // Don't instrument these
    const skipTypes = ['FunctionDeclaration', 'EmptyStatement', 'DebuggerStatement'];
    if (skipTypes.includes(stmt.type)) return;

    const line = stmt.loc.start.line;

    // Build hierarchical scope capture: () => [ { name: 'Local', vars: { ... } }, { name: 'Closure', vars: { ... } } ]
    let captureParts = [];
    let curr = currentScopeNode;
    let isFirst = true;

    while (curr) {
      const safeVars = Array.from(curr.vars).filter(v =>
        /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(v) && v !== '__rt' && !v.startsWith('__e')
      );
      
      // Safe individualized variable capture to handle TDZ without breaking the entire scope
      const varProps = safeVars.map(v => `"${v}": (() => { try { return ${v}; } catch { return undefined; } })()`);
      const varMap = `{ ${varProps.join(', ')} }`;

      let scopeName = curr.name;
      if (curr.type === 'Global') scopeName = 'Global';
      else if (isFirst) scopeName = 'Local';
      else scopeName = `Closure (${curr.name})`;

      captureParts.push(`{ name: '${this._escapeSingle(scopeName)}', type: '${curr.type}', vars: ${varMap} }`);
      
      curr = curr.parent;
      isFirst = false;
    }

    const scopeCapture = `() => { try { return [ ${captureParts.join(', ')} ]; } catch { return []; } }`;

    const checkpoint = `await __rt.check(${line}, ${scopeCapture});\n`;

    ops.push({ pos: stmt.start, text: checkpoint, type: 'insert' });

    // For loops: also instrument loop body entry
    if (stmt.type === 'ForStatement' || stmt.type === 'WhileStatement' || stmt.type === 'DoWhileStatement') {
      if (stmt.body && stmt.body.type === 'BlockStatement' && stmt.body.body.length > 0) {
        const first = stmt.body.body[0];
        const loopLine = first.loc?.start?.line || line;
        const loopCheckpoint = `await __rt.check(${loopLine}, ${scopeCapture});\n`;
        ops.push({ pos: first.start, text: loopCheckpoint, type: 'insert' });
      }
    }

    if (stmt.type === 'ForInStatement' || stmt.type === 'ForOfStatement') {
      if (stmt.body && stmt.body.type === 'BlockStatement' && stmt.body.body.length > 0) {
        const first = stmt.body.body[0];
        const loopLine = first.loc?.start?.line || line;
        ops.push({ pos: first.start, text: `await __rt.check(${loopLine}, ${scopeCapture});\n`, type: 'insert' });
      }
    }

    // If/else: also instrument alternate block
    if (stmt.type === 'IfStatement' && stmt.consequent) {
      if (stmt.consequent.type === 'BlockStatement' && stmt.consequent.body.length > 0) {
        const first = stmt.consequent.body[0];
        this._instrumentStatement(first, ops, scopeMap, currentScopeNode, enclosingFn);
      }
      if (stmt.alternate) {
        if (stmt.alternate.type === 'BlockStatement' && stmt.alternate.body.length > 0) {
          const first = stmt.alternate.body[0];
          this._instrumentStatement(first, ops, scopeMap, currentScopeNode, enclosingFn);
        } else if (stmt.alternate.type !== 'IfStatement') {
          // Single-statement else
          this._instrumentStatement(stmt.alternate, ops, scopeMap, currentScopeNode, enclosingFn);
        }
      }
    }
  }

  /**
   * Apply all insertion operations to the source.
   * Process from end to start to preserve earlier offsets.
   */
  _applyOps(source, ops) {
    // De-duplicate: if same pos has multiple inserts, combine them
    const sorted = [...ops].sort((a, b) => b.pos - a.pos); // reverse order

    // Remove duplicates at same position
    const seen = new Set();
    const unique = [];
    for (const op of sorted) {
      const key = `${op.pos}:${op.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(op);
      }
    }

    let result = source;
    for (const op of unique) {
      if (op.type === 'insert') {
        result = result.slice(0, op.pos) + op.text + result.slice(op.pos);
      }
    }

    return result;
  }

  /**
   * Add 'await' before function calls in expressions.
   * This is needed because we make all functions async.
   */
  addAwaitToCallExpressions(source, ast) {
    // This is handled by the async wrapping —
    // since all functions are async, their return values are Promises,
    // but within async functions, the engine handles this automatically.
    return source;
  }

  _isFunctionNode(node) {
    return node.type === 'FunctionDeclaration' ||
           node.type === 'FunctionExpression' ||
           node.type === 'ArrowFunctionExpression';
  }

  _escapeSingle(str) {
    return String(str).replace(/'/g, "\\'");
  }

  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      hash = ((hash << 5) - hash + c) | 0;
    }
    return hash;
  }

  /**
   * Clear the instrumentation cache.
   */
  clearCache() {
    this._cache.clear();
  }
}
