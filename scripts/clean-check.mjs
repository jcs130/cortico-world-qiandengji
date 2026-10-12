import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = resolve(process.argv[2] ?? join(root, 'scratch', `clean-${Date.now()}`));
if (existsSync(target)) throw new Error('Clean check requires a new directory');
await mkdir(target, { recursive: true });
const entries = ['examples','core','src','adapters','integrations','packages','bridges','scripts','tests','bin','vendor','provenance','docs','skills','client-login',
  'package.json','pnpm-workspace.yaml','pnpm-lock.yaml','release-sources.json','tsconfig.json','tsconfig.core.json','tsconfig.integration.json','vitest.config.ts','README.md','DEPLOYMENT.md','LICENSE'];
for (const entry of entries) await cp(join(root, entry), join(target, entry), { recursive: true });
// The checkout and generated engine are intentionally absent, and installation is strictly offline.
execFileSync(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', ['pnpm','install','--offline','--frozen-lockfile','--ignore-scripts'],
  { cwd: target, stdio: 'inherit', shell: process.platform === 'win32' });
const forbidden = ['.sources', 'engine', 'node_modules/cortico'];
for (const path of forbidden) if (existsSync(join(target,path))) throw new Error('Forbidden build input: '+path);
if ((await readdir(join(target,'node_modules/.pnpm'))).some(name=>/^cortico@/.test(name))) throw new Error('Cortico was installed transitively');
for (const args of [['scripts/build.mjs'],['scripts/build-types.mjs'],['scripts/verify-build.mjs'],['scripts/build-extensions.mjs'],
  ['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.core.json'],
  ['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.integration.json'],
  ['node_modules/vitest/vitest.mjs','run','--reporter=dot','--maxWorkers=4','--minWorkers=1']]) {
  execFileSync(process.execPath,args,{cwd:target,stdio:'inherit'});
}
await writeFile(join(target,'acceptance.json'),JSON.stringify({schema:'agent-mc-acceptance/v1',frameworkInstalled:false,
  frameworkSource:false,networkInstallation:false,gameConnection:false,sourceBuild:true,typecheck:true,tests:true},null,2)+'\n');
console.log('Clean acceptance directory: '+target);
