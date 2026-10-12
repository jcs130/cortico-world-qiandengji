/** Build installable API 5 Worlds from this repository's owned sources. */
import { build, transform } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))).flat();
const remap = new Map([
  ['src/extension.js', 'agent-mc-world/extension'],
  ['src/client/runtime.js', 'agent-mc-world/client'],
  ['src/mcp/stdio.js', 'agent-mc-world/mcp/stdio'],
]);
for (const folder of ['adapters/cortico', 'integrations/qiandengji']) {
  const base = join(root, folder);
  await mkdir(join(base, 'dist'), { recursive: true });
  await build({ entryPoints: [join(root, 'src/console-client.ts')], outfile: join(base, 'dist/console.js'),
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022' });
  await cp(join(root, 'LICENSE'), join(base, 'LICENSE'));
  await writeFile(join(base, 'dist/verify.mjs'), `import {readFile,access} from 'node:fs/promises';
const root=new URL('../',import.meta.url),p=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
if(p.type!=='module'||p.cortico?.kind!=='world'||p.cortico.api!==5||!p.keywords?.includes('cortico-world'))throw Error('Invalid Cortico World manifest');
for(const file of [p.main,p.cortico.consoleClient,p.cortico.consoleStyle,'LICENSE','README.md'])await access(new URL(file,root));
console.log('Cortico World package files verified');
`);
  if (folder === 'adapters/cortico') {
    await writeFile(join(base, 'dist/index.js'), "export { MC, MC as default } from 'agent-mc-world/adapters/cortico';\n");
    continue;
  }
  for (const source of await walk(base)) {
    const name = relative(base, source).replaceAll('\\', '/');
    if (name.startsWith('dist/') || name.startsWith('node_modules/') || /(?:^|\/)(?:package\.json|LICENSE|README\.md)$/.test(name)) continue;
    if (!/\.(?:ts|mjs|js|md)$/.test(name) || /\.d\.ts$/.test(name)) continue;
    const target = join(base, 'dist/world', name.replace(/\.ts$/, '.js'));
    await mkdir(dirname(target), { recursive: true });
    let text = await readFile(source, 'utf8');
    if (name.endsWith('.ts')) {
      text = (await transform(text, { loader: 'ts', format: 'esm', target: 'node22', sourcefile: name })).code;
      text = text.replace(/(['"])([^'"\r\n]*?)\.ts\1/g, '$1$2.js$1');
      text = text.replace(/(from\s*|import\(\s*)(['"])(\.\.?\/[^'"\r\n]+)\2/g, (all, head, quote, spec) => {
        const outside = relative(root, resolve(dirname(source), spec)).replaceAll('\\', '/');
        if (outside.startsWith('integrations/qiandengji/')) return all;
        const mapped = remap.get(outside);
        if (!mapped) throw new Error(`Unpublished dependency in ${name}: ${spec}`);
        return `${head}${quote}${mapped}${quote}`;
      });
    }
    await writeFile(target, text);
  }
}
console.log('Built Cortico API 5 adapters; game code remains in agent-mc-world.');
