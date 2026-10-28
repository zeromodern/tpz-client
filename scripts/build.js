import { build } from 'bun';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log('Building @0mod/tpz...');

// 1. ESM Library
await build({
  entrypoints: ['./src/index.js'],
  outdir: './dist',
  target: 'browser',
  format: 'esm',
  naming: 'index.js',
  minify: false,
});

// 2. Edge Adapter
await build({
  entrypoints: ['./src/edge.js'],
  outdir: './dist',
  target: 'browser',
  format: 'esm',
  naming: 'edge.js',
  minify: false,
});

// 3. Standalone Browser IIFE (minified)
await build({
  entrypoints: ['./src/index.js'],
  outdir: './dist',
  target: 'browser',
  format: 'iife',
  naming: 'tpz.min.js',
  minify: true,
});

// 4. Copy type definitions
fs.copyFileSync('./src/types.d.ts', './dist/index.d.ts');
fs.writeFileSync('./dist/edge.d.ts', `export function handleTpzEdgeRequest(request: Request, env?: any): Promise<Response>;\n`);

console.log('Build complete! Output in dist/:');
fs.readdirSync(distDir).forEach((file) => {
  const stat = fs.statSync(path.join(distDir, file));
  console.log(` - ${file} (${(stat.size / 1024).toFixed(2)} KB)`);
});
