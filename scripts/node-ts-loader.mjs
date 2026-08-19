import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ESM resolver hook: map extensionless relative imports (from a .ts parent)
// to the corresponding .ts file so Node's built-in type stripping can load them.
// This avoids needing tsx/esbuild in environments without npm registry access.
const TS_EXTS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'];

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
  const hasExt = /\.(ts|tsx|js|mjs|cjs|json)$/.test(specifier);
  const parent = context.parentURL || '';
  if (isRelative && !hasExt && parent.endsWith('.ts')) {
    const baseUrl = new URL(specifier, parent);
    const basePath = fileURLToPath(baseUrl);
    for (const ext of TS_EXTS) {
      if (existsSync(basePath + ext)) {
        return nextResolve(pathToFileURL(basePath + ext).href, context);
      }
    }
    // directory index (e.g. "./core" -> "./core/index.ts")
    for (const ext of [".ts", ".js", ".mjs", ".cjs"]) {
      if (existsSync(basePath + "/index" + ext)) {
        return nextResolve(pathToFileURL(basePath + "/index" + ext).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
