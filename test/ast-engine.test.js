import { describe, it, expect, beforeEach } from 'vitest';
import { ASTEngine } from '../src/lib/ast-engine.js';

describe('ASTEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new ASTEngine();
  });

  it('should parse basic variable declarations successfully', () => {
    const code = `const hello = "world"; let x = 5;`;
    const res = engine.parse(code);
    expect(res.success).toBe(true);
    expect(engine.getErrors().length).toBe(0);
    
    expect(engine.getSymbol('hello')).toBeDefined();
    expect(engine.getSymbol('x')).toBeDefined();
  });

  it('should track function ranges correctly', () => {
    const code = `function calculate() { return 1; }`;
    const res = engine.parse(code);
    expect(res.success).toBe(true);
    
    const ranges = engine.getFunctionRanges();
    expect(ranges.length).toBe(1);
    expect(ranges[0].name).toBe('calculate');
  });

  it('should gracefully handle syntax errors and fallback tokenize', () => {
    const code = `function missingBracket() {`;
    const res = engine.parse(code);
    expect(res.success).toBe(false);
    expect(engine.getErrors().length).toBeGreaterThan(0);
    expect(engine.tokens.length).toBeGreaterThan(0); // Should still tokenize
  });
});
