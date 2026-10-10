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
const patches = sources.cortico.patches ?? [];
if ((engine.patches ?? []).length !== patches.length) throw new Error('RELEASE_ENGINE_PATCH_MISMATCH');
for (const [index, file] of patches.entries()) {
  const actual = engine.patches[index];
  if (actual.file !== file || actual.sha256 !== createHash('sha256').update(await readFile(join(root, file))).digest('hex'))
    throw new Error('RELEASE_ENGINE_PATCH_MISMATCH: ' + file);
}
const bridgeFiles = ['viewer-content.mjs', 'viewer-content.d.mts', 'text-display.mjs',
  'viewer-appearance.mjs', 'viewer-appearance.d.mts', 'viewer-ysm-assets.mjs',
  'viewer-photo-page.mjs', 'viewer-page-assets.mjs'];
if (engine.viewerContent?.commit !== sources.viewer.commit || engine.viewerContent.files?.length !== bridgeFiles.length)
  throw new Error('RELEASE_VIEWER_BRIDGE_MISMATCH');
for (const [index, file] of bridgeFiles.entries()) {
  const actual = engine.viewerContent.files[index];
  if (actual.file !== file || actual.sha256 !== createHash('sha256').update(await readFile(join(root, 'engine', file))).digest('hex'))
    throw new Error('RELEASE_VIEWER_BRIDGE_MISMATCH: ' + file);
}
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
const fontBytes = await readFile(join(root, 'dist/viewer/public/text-display-font.json'));
const font = JSON.parse(fontBytes);
if (font.minecraftVersion !== assets.minecraftVersion || font.clientJarSha256 !== JSON.parse(client).clientJarSha256
    || createHash('sha256').update(fontBytes).digest('hex') !== JSON.parse(client).textDisplays?.manifestSha256)
  throw new Error('RELEASE_VIEWER_FONT_MISMATCH');
for (const [file, expected] of Object.entries(font.files)) {
  if (!/^(?:fonts\/1\.20\.6\/(?:default\.json|include\/(?:default|space|unifont)\.json|unifont\.zip)|textures\/1\.20\.6\/font\/[a-z_]+\.png)$/.test(file))
    throw new Error('RELEASE_VIEWER_FONT_PATH: ' + file);
  const bytes = await readFile(join(root, 'dist/viewer/public', file));
  if (bytes.length !== expected.bytes || createHash('sha256').update(bytes).digest('hex') !== expected.sha256)
    throw new Error('RELEASE_VIEWER_FONT_MISMATCH: ' + file);
}
console.log('Release engine, modern viewer, assets and console are present.');
