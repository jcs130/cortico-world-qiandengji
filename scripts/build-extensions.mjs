/** Build the public API 6 World and private API 5 compatibility adapter. */
import { build, transform } from 'esbuild';
import { cp, mkdir, readFile, readdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))).flat();
const pack = join(root, 'packages/qiandengji');
const sourceBase = join(root, 'integrations/qiandengji');
await rm(join(pack, 'dist'), { recursive: true, force: true });
await mkdir(join(pack, 'dist'), { recursive: true });
await cp(join(root, 'LICENSE'), join(pack, 'LICENSE'));
for (const source of await walk(sourceBase)) {
  const name = relative(sourceBase, source).replaceAll('\\', '/');
  if (name.startsWith('dist/') || name.startsWith('node_modules/') || ['index.ts', 'cortico.ts'].includes(name)
    || /(?:^|\/)(?:package\.json|LICENSE)$/.test(name) || ['README.md', 'cortico-activity.ts', 'cortico-activity-tap.ts', 'cortico-quick-start.ts'].includes(name)) continue;
  if(name.startsWith('data-packs/qiandengji/viewer-items/')&&/\.(?:png|json)$/.test(name)){
    const target=join(pack,'dist',name);await mkdir(dirname(target),{recursive:true});await cp(source,target);continue;
  }
  if (!/\.(?:ts|mjs|js|md)$/.test(name) || /\.d\.ts$/.test(name)) continue;
  const target = join(pack, 'dist', name.replace(/\.ts$/, '.js'));
  await mkdir(dirname(target), { recursive: true });
  let text = await readFile(source, 'utf8');
  if (name.endsWith('.ts')) {
    text = (await transform(text, { loader: 'ts', format: 'esm', target: 'node22', sourcefile: name })).code;
    text = text.replace(/(['"])([^'"\r\n]*?)\.ts\1/g, '$1$2.js$1');
    text = text.replace(/(from\s*|import\(\s*)(['"])(\.\.?\/[^'"\r\n]+)\2/g, (all, head, quote, spec) => {
      const outside = relative(root, resolve(dirname(source), spec)).replaceAll('\\', '/');
      if (outside.startsWith('integrations/qiandengji/')) return all;
      throw new Error(`Unpublished dependency in ${name}: ${spec}`);
    });
  }
  await writeFile(target, text);
}
for (const folder of ['adapters/cortico', 'integrations/qiandengji']) {
  const base = join(root, folder);
  const browserName = folder === 'integrations/qiandengji' ? 'webui' : 'console';
  await rm(join(base, 'dist'), { recursive: true, force: true });
  await mkdir(join(base, 'dist'), { recursive: true });
  await build({ entryPoints: [join(root, 'src/console-client.ts')], outfile: join(base, `dist/${browserName}.js`),
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022' });
  await cp(join(root, 'adapters/cortico/console/style.css'), join(base, `dist/${browserName}.css`));
  await cp(join(root, 'LICENSE'), join(base, 'LICENSE'));
  await writeFile(join(base, 'dist/verify.mjs'), `import {readFile,access} from 'node:fs/promises';
const root=new URL('../',import.meta.url),p=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
if(p.type!=='module'||p.cortico?.kind!=='world'||![5,6].includes(p.cortico.api)||!p.keywords?.includes('cortico-world'))throw Error('Invalid Cortico World manifest');
for(const file of [p.main,p.cortico.webUiClient??p.cortico.consoleClient,p.cortico.webUiStyle??p.cortico.consoleStyle,'LICENSE','README.md',...(p.cortico.api===6?[p.cortico.describe]:[])])await access(new URL(file,root));
console.log('Cortico World package files verified');
`);
  if (folder === 'adapters/cortico') {
    const adapter = (await transform(await readFile(join(root, 'src/adapters/minecraft.ts'), 'utf8'),
      { loader: 'ts', format: 'esm', target: 'node22' })).code;
    await writeFile(join(base, 'dist/index.js'), adapter + '\nexport default MC;\n');
    await cp(join(base, 'ENV_PROMPT.md'), join(base, 'dist/ENV_PROMPT.md'));
    continue;
  }
  await mkdir(join(base, 'dist/world'), { recursive: true });
  let adapter = (await transform(await readFile(join(base, 'cortico.ts'), 'utf8'),
    { loader: 'ts', format: 'esm', target: 'node22' })).code;
  adapter = adapter.replace(/from (['"])\.\/([^'"\r\n]+)\1/g, (_all, _quote, source) =>
    /^cortico-(?:activity(?:-tap)?|quick-start)\.[jt]s$/.test(source) ? 'from "./' + source.replace(/\.ts$/, '.js') + '"' : 'from "agent-mc-qiandengji"');
  for (const file of ['cortico-activity', 'cortico-activity-tap', 'cortico-quick-start']) {
    const activityAdapter = (await transform(await readFile(join(base, file + '.ts'), 'utf8'),
      { loader: 'ts', format: 'esm', target: 'node22' })).code.replaceAll('./cortico-activity.ts', './cortico-activity.js')
      .replaceAll('from "./config.ts"', 'from "agent-mc-qiandengji"');
    await writeFile(join(base, 'dist/world/' + file + '.js'), activityAdapter);
  }
  await writeFile(join(base, 'dist/world/cortico.js'), adapter);
  await writeFile(join(base, 'dist/world/index.js'), 'export { MYMC, MYMC as default } from "./cortico.js";\n');
  await writeFile(join(base, 'dist/host-decisions.js'), 'export * from "agent-mc-qiandengji/host-decisions";\n');
  await writeFile(join(base, 'dist/pack.js'), 'export * from "agent-mc-qiandengji/manifest";\n');
}

// Generate the market catalog from real generic, server and Java tool
// declarations in an empty temporary data directory, never a deployment.
const neutral = await import(pathToFileURL(join(pack, 'dist/neutral.js')).href);
const { describeMymcImplementations } = await import(pathToFileURL(join(pack, 'dist/describe.js')).href);
const temporary = await mkdtemp(join(tmpdir(), 'mymc-describe-'));
try {
  const context = cfg => ({ cfg, timezone: 'UTC', botName: 'DescribeOnly', botDir: temporary, dataDir: temporary });
  const generic = new neutral.GenericMymcWorld(context(structuredClone(neutral.WORLD_DEFAULTS)));
  const server = new neutral.MymcWorld(context({ ...structuredClone(neutral.WORLD_DEFAULTS), serverPack: 'qiandengji' }));
  const java = new neutral.JavaMymcWorld(context({ ...structuredClone(neutral.WORLD_DEFAULTS), provider: 'java-client', serverPack: 'qiandengji' }));
  const describe = describeMymcImplementations([generic, server, java]);
  const prompts = [];
  for (const doc of generic.console?.('zh')?.promptDocs ?? []) if (doc.role === 'envPrompt')
    prompts.push({ key: doc.key, title: doc.title, role: doc.role, content: await readFile(doc.path, 'utf8') });
  const base = join(root, 'integrations/qiandengji');
  await writeFile(join(base, 'describe.json'), JSON.stringify({ ...describe, ...(prompts.length ? { prompts } : {}) }, null, 2) + '\n');
  const entry = join(base, 'dist/world/cortico.js');
  await writeFile(entry, (await readFile(entry, 'utf8')) + '\nMYMC.describe = ' + JSON.stringify(describe) + ';\n');
} finally {
  if (dirname(temporary) !== resolve(tmpdir()) || !temporary.split(/[\\/]/).at(-1).startsWith('mymc-describe-')) throw Error('Invalid description temporary path');
  await rm(temporary, { recursive: true, force: true });
}
console.log('Built neutral server pack, API 6 public World and private compatibility adapter; no host framework enters the server pack.');
