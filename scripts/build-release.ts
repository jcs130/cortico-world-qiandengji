import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sources = JSON.parse(await readFile(join(root, 'release-sources.json'), 'utf8')) as {
  cortico: { repository: string; commit: string };
  viewer: { repository: string; commit: string; assetPack: string; preset: string };
};

function sourceRoot(variable: string, fallback: string, expected: string): string {
  const directory = resolve(process.env[variable] || join(root, '.sources', fallback));
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
  if (actual !== expected) throw new Error(`${variable}: expected ${expected}, got ${actual}`);
  execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', 'src', 'scripts', 'tools', 'packages'],
    { cwd: directory, stdio: 'pipe' });
  return directory;
}

async function buildEngine(): Promise<void> {
  const coreRoot = sourceRoot('CORTICO_SOURCE_DIR', 'cortico', sources.cortico.commit);
  const planner = await import(pathToFileURL(join(coreRoot, 'scripts/publish-worlds.ts')).href) as {
    planWorldPackage: (id: string) => { sources: Map<string, string>; externals: string[]; problems: string[] };
  };
  const plan = planner.planWorldPackage('minecraft');
  if (plan.problems.length) throw new Error(plan.problems.join('\n'));
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  for (const name of plan.externals) {
    if (!manifest.dependencies[name]) throw new Error(`Missing engine dependency: ${name}`);
  }
  const engineRoot = join(root, 'engine');
  const source = join(coreRoot, 'src/worlds/minecraft');
  await cp(source, engineRoot, { recursive: true });
  for (const [relative, contents] of plan.sources) {
    const target = join(engineRoot, relative);
    await mkdir(dirname(target), { recursive: true });
    let rewritten = contents
      .replaceAll('cortico/protocol/typed-decision.ts', './support/typed-decision.ts')
      .replaceAll('cortico/core/types.ts', './support/host-contract.ts');
    if (relative === 'definition.ts') rewritten = rewritten.replace(
      'WorldDefinition<MinecraftConfigSection> =',
      'WorldDefinition<MinecraftConfigSection> & { exclusiveResource: string } =');
    await writeFile(target, rewritten);
  }
  await mkdir(join(engineRoot, 'support'), { recursive: true });
  await cp(join(root, 'src/host-contract.ts'), join(engineRoot, 'support/host-contract.ts'));
  await cp(join(coreRoot, 'src/protocol/typed-decision.ts'), join(engineRoot, 'support/typed-decision.ts'));
  const consoleRoot = join(engineRoot, 'console');
  for (const file of await readdir(consoleRoot)) {
    if (!file.endsWith('.ts')) continue;
    const path = join(consoleRoot, file);
    await writeFile(path, (await readFile(path, 'utf8'))
      .replaceAll('../../../web/shared/client-panel.ts', 'cortico/web/shared/client-panel.ts'));
  }
  await cp(join(coreRoot, 'LICENSE'), join(engineRoot, 'LICENSE-Cortico.txt'));
  await writeFile(join(engineRoot, 'source.json'), JSON.stringify(sources.cortico, null, 2) + '\n');
  console.log(`Engine: ${sources.cortico.commit}`);
}

async function buildViewer(): Promise<void> {
  const viewerRoot = sourceRoot('MC_VISUAL_CONSOLE_DIR', 'viewer', sources.viewer.commit);
  const preparer = await import(pathToFileURL(join(viewerRoot, 'tools/prepare-viewer-assets.mjs')).href) as {
    prepareAssetPack: (options: { id: string; outputDirectory: string; preset: string }) => Promise<unknown>;
  };
  const outputDirectory = join(root, 'dist/viewer');
  await preparer.prepareAssetPack({ id: sources.viewer.assetPack, outputDirectory, preset: sources.viewer.preset });
  await cp(join(viewerRoot, 'LICENSE'), join(outputDirectory, 'LICENSE-mc-visual-console.txt'));
  const client = await readFile(join(outputDirectory, 'viewer-client.json'));
  await writeFile(join(outputDirectory, 'source.json'), JSON.stringify({ ...sources.viewer,
    viewerClientManifestSha256: createHash('sha256').update(client).digest('hex'),
  }, null, 2) + '\n');
  console.log(`Viewer: ${sources.viewer.commit}`);
}

const stage = process.argv[2] || 'all';
if (!['engine', 'viewer', 'all'].includes(stage)) throw new Error('Expected engine, viewer or all');
if (stage !== 'viewer') await buildEngine();
if (stage !== 'engine') await buildViewer();
