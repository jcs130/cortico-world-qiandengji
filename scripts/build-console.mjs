import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/console-client.ts'],
  outfile: 'dist/console.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
