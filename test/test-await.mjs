import { parse } from 'acorn';

function applyOps(source, ops) {
  const sorted = [...ops].sort((a, b) => b.pos - a.pos);
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
    result = result.slice(0, op.pos) + op.text + result.slice(op.pos);
  }
  return result;
}

const source = `
const a = fetch(1);
const b = await fetch(2);
console.log(b);
runDemo();
`;

const ast = parse(source, { ecmaVersion: 'latest' });
const ops = [];

const walk = (node, parent) => {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'CallExpression') {
    // Check if parent is an AwaitExpression to avoid double await
    if (!parent || parent.type !== 'AwaitExpression') {
      ops.push({ pos: node.start, text: '(await ', type: 'insert' });
      ops.push({ pos: node.end, text: ')', type: 'insert' });
    }
  }

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'type') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) walk(c, node);
    } else if (child && typeof child === 'object' && child.type) {
      walk(child, node);
    }
  }
};

walk(ast, null);
console.log(applyOps(source, ops));
