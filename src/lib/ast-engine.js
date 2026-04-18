/**
 * VOID DEBUGGER — AST Engine
 * Real AST parsing via Acorn for syntax intelligence.
 */
import * as acorn from 'acorn';

export class ASTEngine {
  constructor() {
    this.ast = null;
    this.tokens = [];
    this.symbols = {};
    this.errors = [];
    this.fnRanges = [];
  }

  parse(code) {
    this.errors = [];
    this.symbols = {};
    this.fnRanges = [];
    this.tokens = [];

    try {
      this.ast = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        locations: true,
        ranges: true,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        onComment: (block, text, start, end, startLoc, endLoc) => {
          this.tokens.push({
            type: 'comment',
            start,
            end,
            line: startLoc.line,
            col: startLoc.column,
            value: block ? `/*${text}*/` : `//${text}`
          });
        }
      });
      this._extractTokens(code);
      this._extractSymbols(this.ast);
      this._extractFunctionRanges(this.ast);
      return { success: true, ast: this.ast };
    } catch (e) {
      this.errors.push({
        message: e.message.replace(/\(\d+:\d+\)/, '').trim(),
        line: e.loc ? e.loc.line : 1,
        col: e.loc ? e.loc.column : 0,
        pos: e.pos || 0
      });
      // Fallback tokenization
      this._fallbackTokenize(code);
      return { success: false, error: e };
    }
  }

  _extractTokens(code) {
    try {
      const tokenizer = acorn.tokenizer(code, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        locations: true,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
      });

      for (const token of tokenizer) {
        if (token.type === acorn.tokTypes.eof) break;
        this.tokens.push({
          type: this._classifyToken(token, code),
          start: token.start,
          end: token.end,
          line: token.loc.start.line,
          col: token.loc.start.column,
          value: code.slice(token.start, token.end)
        });
      }
    } catch { /* fallback already set */ }

    this.tokens.sort((a, b) => a.start - b.start);
  }

  _classifyToken(token, code) {
    const val = code.slice(token.start, token.end);
    const t = token.type;

    if (t === acorn.tokTypes._var || t === acorn.tokTypes._let || t === acorn.tokTypes._const ||
        t === acorn.tokTypes._function || t === acorn.tokTypes._return || t === acorn.tokTypes._if ||
        t === acorn.tokTypes._else || t === acorn.tokTypes._for || t === acorn.tokTypes._while ||
        t === acorn.tokTypes._do || t === acorn.tokTypes._switch || t === acorn.tokTypes._case ||
        t === acorn.tokTypes._break || t === acorn.tokTypes._continue || t === acorn.tokTypes._new ||
        t === acorn.tokTypes._throw || t === acorn.tokTypes._try || t === acorn.tokTypes._catch ||
        t === acorn.tokTypes._finally || t === acorn.tokTypes._class || t === acorn.tokTypes._extends ||
        t === acorn.tokTypes._import || t === acorn.tokTypes._export || t === acorn.tokTypes._default ||
        t === acorn.tokTypes._typeof || t === acorn.tokTypes._void || t === acorn.tokTypes._delete ||
        t === acorn.tokTypes._in || t === acorn.tokTypes._instanceof || t === acorn.tokTypes._yield ||
        t === acorn.tokTypes._await || t === acorn.tokTypes._of || t === acorn.tokTypes._async) {
      return 'keyword';
    }

    if (t === acorn.tokTypes.string || t === acorn.tokTypes.template) return 'string';
    if (t === acorn.tokTypes.num) return 'number';
    if (t === acorn.tokTypes.regexp) return 'regexp';

    if (t === acorn.tokTypes._true || t === acorn.tokTypes._false) return 'boolean';
    if (t === acorn.tokTypes._null) return 'null';

    if (t === acorn.tokTypes.name) {
      const builtins = ['console', 'Math', 'JSON', 'Array', 'Object', 'String', 'Number',
        'Boolean', 'Date', 'RegExp', 'Error', 'Map', 'Set', 'Promise', 'parseInt', 'parseFloat',
        'isNaN', 'undefined', 'NaN', 'Infinity', 'globalThis', 'window', 'document', 'this'];
      if (builtins.includes(val)) return 'builtin';
      return 'identifier';
    }

    if (t.binop || t.prefix || t.postfix ||
        t === acorn.tokTypes.eq || t === acorn.tokTypes.assign ||
        t === acorn.tokTypes.equality || t === acorn.tokTypes.relational ||
        t === acorn.tokTypes.plusMin || t === acorn.tokTypes.star ||
        t === acorn.tokTypes.slash || t === acorn.tokTypes.modulo ||
        t === acorn.tokTypes.logicalOR || t === acorn.tokTypes.logicalAND ||
        t === acorn.tokTypes.bitwiseOR || t === acorn.tokTypes.bitwiseAND ||
        t === acorn.tokTypes.bitwiseXOR || t === acorn.tokTypes.incDec ||
        t === acorn.tokTypes.prefix || t === acorn.tokTypes.question ||
        t === acorn.tokTypes.coalesce || t === acorn.tokTypes.arrow) {
      return 'operator';
    }

    if (t === acorn.tokTypes.parenL || t === acorn.tokTypes.parenR ||
        t === acorn.tokTypes.braceL || t === acorn.tokTypes.braceR ||
        t === acorn.tokTypes.bracketL || t === acorn.tokTypes.bracketR ||
        t === acorn.tokTypes.comma || t === acorn.tokTypes.semi ||
        t === acorn.tokTypes.colon || t === acorn.tokTypes.dot ||
        t === acorn.tokTypes.ellipsis) {
      return 'punctuation';
    }

    return 'plain';
  }

  _extractSymbols(ast) {
    if (!ast) return;
    const walk = (node, scope) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'VariableDeclarator' && node.id?.name) {
        this.symbols[node.id.name] = {
          type: 'variable',
          kind: node.init?.type === 'FunctionExpression' || node.init?.type === 'ArrowFunctionExpression' ? 'function' : 'variable',
          line: node.loc?.start?.line,
          col: node.loc?.start?.column,
          scope
        };
      }
      if (node.type === 'FunctionDeclaration' && node.id?.name) {
        this.symbols[node.id.name] = {
          type: 'function',
          params: (node.params || []).map(p => p.name || '?').join(', '),
          line: node.loc?.start?.line,
          col: node.loc?.start?.column,
          scope
        };
      }
      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'range') continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach(c => walk(c, scope));
        else if (child && typeof child.type === 'string') walk(child, scope);
      }
    };
    walk(ast, 'global');
  }

  _extractFunctionRanges(ast) {
    if (!ast) return;
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') && node.loc) {
        this.fnRanges.push({
          name: node.id?.name || '(anonymous)',
          startLine: node.loc.start.line,
          endLine: node.loc.end.line,
          start: node.start,
          end: node.end
        });
      }
      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'range') continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach(c => walk(c));
        else if (child && typeof child.type === 'string') walk(child);
      }
    };
    walk(ast);
  }

  _fallbackTokenize(code) {
    const patterns = [
      { re: /\/\/[^\n]*/g, type: 'comment' },
      { re: /\/\*[\s\S]*?\*\//g, type: 'comment' },
      { re: /\b(function|return|var|let|const|if|else|for|while|do|switch|case|break|continue|new|throw|try|catch|finally|class|extends|import|export|default|typeof|void|delete|in|instanceof|of|async|await|yield|def|pass|elif|except|True|False|None|and|or|not|print)\b/g, type: 'keyword' },
      { re: /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, type: 'string' },
      { re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, type: 'number' },
      { re: /\b(true|false)\b/g, type: 'boolean' },
      { re: /\bnull\b/g, type: 'null' },
    ];
    patterns.forEach(({ re, type }) => {
      let m;
      while ((m = re.exec(code)) !== null) {
        const lines = code.slice(0, m.index).split('\n');
        this.tokens.push({
          type, start: m.index, end: m.index + m[0].length,
          line: lines.length, col: lines[lines.length - 1].length, value: m[0]
        });
      }
    });
    this.tokens.sort((a, b) => a.start - b.start);
  }

  highlight(code) {
    if (!code) return '';
    const tokens = [...this.tokens].filter(t => t.start < code.length);
    const parts = [];
    let lastEnd = 0;

    for (const tok of tokens) {
      if (tok.start < lastEnd) continue;
      if (tok.start > lastEnd) {
        parts.push({ text: code.slice(lastEnd, tok.start), cls: '' });
      }
      parts.push({ text: code.slice(tok.start, tok.end), cls: `tok-${tok.type}`, start: tok.start, end: tok.end });
      lastEnd = tok.end;
    }
    if (lastEnd < code.length) {
      parts.push({ text: code.slice(lastEnd), cls: '' });
    }
    return parts;
  }

  getSymbol(name) { return this.symbols[name] || null; }
  getErrors() { return this.errors; }
  getFunctionRanges() { return this.fnRanges; }
  getDefinition(name) {
    const sym = this.symbols[name];
    return sym ? { line: sym.line, col: sym.col, symbol: sym } : null;
  }
}
