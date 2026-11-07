import {readFileSync, realpathSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertCandidateCoreRange} from './core-consumer-range.mjs';

const manifest = file => {
  const path = realpathSync(file);
  return {path, package: JSON.parse(readFileSync(path, 'utf8'))};
};
function resolvedManifest(from, name) {
  const req=createRequire(from);
  try { return manifest(req.resolve(name+'/package.json')); }
  catch(error) { if(error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED')throw error; }
  // Some packages export their runtime but deliberately keep package.json private.
  // Resolve the real entry without executing it, then find its owning manifest.
  let dir=dirname(realpathSync(req.resolve(name)));
  for(;;){
    const file=resolve(dir,'package.json');
    if(existsSync(file)){const p=manifest(file);if(p.package.name===name)return p;}
    const parent=dirname(dir);if(parent===dir)throw Error('Cannot locate resolved package owner: '+name);dir=parent;
  }
}

/** Inspect the installed graph, including unchanged linked server packages.
 * A peer range or the host's top-level core version does not identify the engine.
 * This reads files only; it never imports a World, connects or starts a child.
 */
export function verifyRuntimeCore(worldManifest, expectedCoreManifest) {
  const world = manifest(resolve(worldManifest));
  const core = resolvedManifest(world.path,'agent-mc-world');
  const server = resolvedManifest(world.path,'agent-mc-qiandengji');
  const serverCore = resolvedManifest(server.path,'agent-mc-world');
  if (core.package.name !== 'agent-mc-world' || server.package.name !== 'agent-mc-qiandengji')
    throw Error('Unexpected Minecraft package identity');
  for (const pkg of [world.package, server.package]) assertCandidateCoreRange(pkg, core.package.version);
  const expected = expectedCoreManifest ? realpathSync(resolve(expectedCoreManifest)) : core.path;
  if (core.path !== expected || serverCore.path !== expected) {
    throw Error('CORE_RUNTIME_MISMATCH: World resolves ' + core.path + ' (' + core.package.version + ')'
      + '; server engine resolves ' + serverCore.path + ' (' + serverCore.package.version + ')'
      + '; expected ' + expected + '. Recompose unchanged linked dependents before loading.');
  }
  return {world: {name: world.package.name, version: world.package.version, manifest: world.path},
    server: {name: server.package.name, version: server.package.version, manifest: server.path},
    core: {version: core.package.version, manifest: core.path},
    engineCore: {version: serverCore.package.version, manifest: serverCore.path},
    canonicalCore: expected, verified: true, runtimeStarted: false};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , world, core] = process.argv;
  if (!world) throw Error('Usage: node scripts/verify-runtime-core.mjs <installed-World/package.json> [expected-core/package.json]');
  console.log(JSON.stringify(verifyRuntimeCore(world, core), null, 2));
}
