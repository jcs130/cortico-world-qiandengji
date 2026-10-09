import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = async file => JSON.parse(await readFile(join(root, file), 'utf8'));
const sources = await json('release-sources.json');
const engine = await json('engine/source.json');
const viewer = await json('dist/viewer/source.json');
const assets = await json('dist/viewer/viewer-assets.json');
if (engine.commit !== sources.cortico.commit || viewer.commit !== sources.viewer.commit)
  throw new Error('RELEASE_SOURCE_MISMATCH');
if (assets.minecraftVersion !== '1.20.6') throw new Error('RELEASE_ASSET_VERSION_MISMATCH');
for (const file of ['engine/proxy.ts', 'engine/engine-child.ts', 'engine/dependency-patches.ts',
  'engine/method-worker.mjs', 'engine/support/typed-decision.ts', 'engine/support/host-contract.ts',
  'dist/console.js', 'dist/console.css', 'dist/viewer/dist/modern-viewer.js',
  'dist/viewer/public/index.html', 'dist/viewer/public/third/index.html',
  'dist/viewer/public/dungeon/index.html']) {
  if (!(await stat(join(root, file))).isFile()) throw new Error('RELEASE_FILE_MISSING: ' + file);
}
const client = await readFile(join(root, 'dist/viewer/viewer-client.json'));
if (createHash('sha256').update(client).digest('hex') !== viewer.viewerClientManifestSha256)
  throw new Error('RELEASE_VIEWER_MANIFEST_MISMATCH');
const bundle = await readFile(join(root, 'dist/viewer/dist/modern-viewer.js'));
if (createHash('sha256').update(bundle).digest('hex') !== JSON.parse(client).browserBundleSha256)
  throw new Error('RELEASE_VIEWER_BUNDLE_MISMATCH');
console.log('Release engine, modern viewer, assets and console are present.');
