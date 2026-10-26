/** Validate the installed browser/backend contract without starting a World. */
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const definition = (await import(pathToFileURL(join(root, pkg.main)).href)).default;
const browser = (await import(pathToFileURL(join(root, pkg.cortico.webUiClient)).href)).default;
const temporary = await mkdtemp(join(tmpdir(), 'mymc-webui-check-'));
try {
  const checks = [];
  for (const provider of ['mineflayer', 'java-client']) for (const serverPack of ['none', 'qiandengji']) {
    const reject = () => { throw Error('Package verification must not modify host configuration'); };
    const world = definition.create({ id: 'mymc', cfg: { ...definition.defaults(), provider, serverPack },
      dataDir: temporary, botDir: temporary, repoRoot: temporary, packageDir: root, timezone: 'UTC',
      botName: 'Package verification', secret: () => '', storeSecret: reject, persist: reject, restart: reject });
    const ui = world.webUi();
    for (const panel of ui.panels ?? []) if (!panel.builtin && !panel.form && typeof browser.panels?.[panel.id]?.mount !== 'function')
      throw Error(`Missing browser panel: ${provider}/${serverPack}/${panel.id}`);
    const state = await ui.invoke('practice', 'state', []);
    if (state.enabled !== false || !Array.isArray(state.jobs)) throw Error('Fresh practice state is unreadable');
    checks.push({ provider, serverPack, panels: ui.panels.map(p => p.id), practice: 'disabled-readable' });
  }
  console.log(JSON.stringify({ package: pkg.name, version: pkg.version, checks, started: false }, null, 2));
} finally {
  if (dirname(temporary) !== resolve(tmpdir()) || !basename(temporary).startsWith('mymc-webui-check-')) throw Error('Invalid temporary path');
  await rm(temporary, { recursive: true, force: true });
}
