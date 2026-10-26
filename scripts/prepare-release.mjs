import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertCandidateCoreRange } from './core-consumer-range.mjs';

// Run as npm run release:pack. Produces local candidates only; never publishes or starts a Bot.
const root = fileURLToPath(new URL('../', import.meta.url)), output = join(root, 'dist/release');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run npm run release:pack so the current npm CLI is explicit.');
execFileSync(process.execPath, [npmCli, 'run', 'test', '--', 'tests/world-description.test.ts', 'tests/webui-panels.test.ts'], { cwd: root, stdio: 'inherit' });
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const source = await json(join(root, 'vendor/core-source.json'));
const archive = resolve(root, 'vendor', source.file);
if (!archive.startsWith(resolve(root, 'vendor') + sep) || !source.file.endsWith('.tgz')) throw new Error('Invalid pinned core archive path');
if (await digest(archive) !== source.sha256) throw new Error('Pinned core SHA-256 differs');
const core = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
if (core.name !== 'agent-mc-world' || core.version !== source.version) throw new Error('Core version differs from source ledger');
const serverDir = join(root, 'packages/qiandengji'), worldDir = join(root, 'integrations/qiandengji');
const server = await json(join(serverDir, 'package.json')), world = await json(join(worldDir, 'package.json'));
for (const pkg of [server, world]) {
  assertCandidateCoreRange(pkg, core.version);
  if (Object.keys(pkg.dependencies ?? {}).some(name => /^(?:cortico-world-|cortico$)/.test(name))) throw new Error('Unexpected host/World runtime dependency');
}
if (world.dependencies?.['agent-mc-qiandengji'] !== '^' + server.version || world.cortico?.api !== 6
  || world.cortico?.kind !== 'world' || !world.keywords?.includes('cortico-world') || !world.files?.includes('describe.json'))
  throw new Error('Invalid public World publication contract');
if (world.name !== 'cortico-world-qiandengji') throw new Error('Only the established public World package may be prepared');
const changelog = await readFile(join(worldDir, 'CHANGELOG.md'), 'utf8');
if (!changelog.split(/\r?\n/).includes('## ' + world.version)) throw new Error('CHANGELOG lacks this release');
const describe = await json(join(worldDir, world.cortico.describe));
if (!describe.tools?.length || !describe.events?.length) throw new Error('Self-description is incomplete');
await mkdir(output, { recursive: true });
const packages = [];
const coreName = source.file;
await copyFile(archive, join(output, coreName));
packages.push({ name: core.name, version: core.version, file: coreName, sha256: source.sha256 });
for (const dir of [serverDir, worldDir]) {
  if (dir === worldDir) execFileSync(process.execPath, [join(dir, 'dist/verify.mjs')], { cwd: dir, stdio: 'inherit' });
  const result = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', output], { cwd: dir, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }))[0];
  if (!result.filename || dirname(result.filename) !== '.') throw new Error('Unexpected pack output path');
  const disallowed = result.files.filter(entry => /(?:^|\/)(?:node_modules|\.env|config\.json|auth|deployments|memory|workspace)(?:\/|$)/.test(entry.path));
  if (disallowed.length) throw new Error('Private/deployment files in package: ' + disallowed.map(entry => entry.path).join(', '));
  const sha256 = await digest(join(output, result.filename));
  const immutableName = result.filename.replace(/\.tgz$/, '-' + sha256.slice(0, 8) + '.tgz');
  await copyFile(join(output, result.filename), join(output, immutableName));
  packages.push({ name: result.name, version: result.version, file: immutableName,
    sha256, bytes: result.size, unpackedBytes: result.unpackedSize });
}
await writeFile(join(output, 'publish-plan.json'), JSON.stringify({ schema: 'agent-mc-release/v1', preparedAt: new Date().toISOString(),
  status: 'prepared-not-published', packages, source,
  requiredBeforePublish: ['Full core/consumer tests and types', 'Official API 6 and private API 5 isolated package checks',
    'Run npm run verify:webui in the independently installed World package',
    'Fresh install and operator UI acceptance', 'Human approval of exact candidates'],
  publicationOrder: packages.map(pkg => ({ package: pkg.name, command: `npm publish ${pkg.file} --access public --tag next` })),
  marketSync: { repository: 'Pal-AI-Lab/cortico-extensions', title: '[sync] cortico-world-qiandengji', submitted: false },
  published: false, productionLoaded: false }, null, 2) + '\n');
await writeFile(join(output, 'SHA256SUMS.txt'), packages.map(pkg => `${pkg.sha256}  ${pkg.file}`).join('\n') + '\n');
console.log(JSON.stringify({ output, packages, published: false, productionLoaded: false }, null, 2));
