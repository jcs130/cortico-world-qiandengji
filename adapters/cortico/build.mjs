import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('../../src/console-client.ts',import.meta.url))],outfile:fileURLToPath(new URL('./dist/console.js',import.meta.url)),bundle:true,format:'esm',platform:'browser',target:'es2022'});
