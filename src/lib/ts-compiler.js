import { transform } from 'sucrase';

/**
 * Transpiles TypeScript into JavaScript while preserving structure and line numbers.
 * We use Sucrase because it's exceptionally fast and works in the browser.
 */
export function compileTypeScript(source) {
  try {
    const result = transform(source, {
      transforms: ['typescript'] 
    });
    return { code: result.code, error: null };
  } catch (err) {
    return { code: null, error: `TypeStripping Error: ${err.message}` };
  }
}
