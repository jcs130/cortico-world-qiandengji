import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { MC as worldDefinition } from '../src/adapters/minecraft.ts';
import { MINECRAFT_CLIENT_DEFAULTS, assertMinecraftReady } from 'agent-mc-world/client';
import { MYMC_DEFAULTS, mymcEngineConfig } from '../src/config.ts';
import { assertMymcReady } from '../src/guard.ts';

describe('installable World', () => {
  it('consumes the declared pinned core rather than a stale workspace override', () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const source = JSON.parse(readFileSync(join(root, 'vendor/core-source.json'), 'utf8'));
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(manifest.dependencies['agent-mc-world']).toBe(`file:vendor/${source.file}`);
    const override = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').split(/\r?\n/)
      .find(line => /^  agent-mc-world:/.test(line))?.trim();
    expect(override).toBe(`agent-mc-world: file:vendor/${source.file}`);
    const require = createRequire(import.meta.url);
    expect(require('agent-mc-world/package.json').version).toBe(source.version);
  });
  it('constructs without connecting and observes the configured server and port', async () => {
    const cfg = { ...structuredClone(MINECRAFT_CLIENT_DEFAULTS), host: 'example.test', port: 25577, username: 'visitor' };
    assertMinecraftReady(cfg);
    const world = worldDefinition.create({ cfg, timezone: 'UTC', dataDir: '', botName: 'test' } as never);
    expect(world.id).toBe('mc');
    expect((await world.envPromptVars())?.['minecraft.world']).toContain('example.test:25577');
    expect(world.tools().map(tool => tool.name)).toEqual(expect.arrayContaining(['agentmc_do', 'agentmc_scout', 'agentmc_script']));
    expect(world.tools().some(tool => tool.name.startsWith('mc_'))).toBe(false);
    expect(world.tools().some(tool => tool.name === 'mymc_skills' || tool.name === 'mc_cast')).toBe(false);
  });

  it.each([0, 65536, 1.5])('rejects invalid server port %s before connecting', port => {
    expect(() => assertMymcReady({ ...structuredClone(MYMC_DEFAULTS),
      host: 'example.test', username: 'visitor', port })).toThrow('端口');
  });

  it('sends the prefixed Agent identity through child IPC without freezing hot settings', () => {
    const cfg = { ...structuredClone(MYMC_DEFAULTS), username: ' Alice ' };
    const engine = mymcEngineConfig(cfg);
    expect(JSON.parse(JSON.stringify(engine)).username).toBe('ag_Alice');
    expect(cfg.username).toBe(' Alice ');
    cfg.username = 'ag_Bob';
    cfg.viewerPort = 7798;
    expect(JSON.parse(JSON.stringify(engine))).toMatchObject({ username: 'ag_Bob', viewerPort: 7798 });
    cfg.username = 'AG_Carol';
    expect(engine.username).toBe('ag_Carol');
  });

  it.each(['ag_', 'abcdefghijklmn', 'bad-name', '游客'])('rejects invalid Agent login %s', username => {
    expect(() => assertMymcReady({ ...structuredClone(MYMC_DEFAULTS), host: 'example.test', username }))
      .toThrow('登录名');
  });

  it('preserves an existing account through child IPC only with explicit migration configuration', () => {
    const cfg = { ...structuredClone(MYMC_DEFAULTS), host: 'example.test', username: 'ExistingUser', preserveLoginName: true };
    assertMymcReady(cfg);
    expect(JSON.parse(JSON.stringify(mymcEngineConfig(cfg))).username).toBe('ExistingUser');
    cfg.preserveLoginName = false;
    expect(JSON.parse(JSON.stringify(mymcEngineConfig(cfg))).username).toBe('ag_ExistingUser');
  });

  it('uses packaged modern assets with all three camera pages and an original asset manifest', () => {
    const viewer = MYMC_DEFAULTS.viewerAssetsDir;
    expect(viewer).toBe(MINECRAFT_CLIENT_DEFAULTS.viewerAssetsDir);
    for (const page of ['index.html', 'third/index.html', '3dview/index.html']) {
      expect(existsSync(join(viewer, 'public', page)), page).toBe(true);
    }
    expect(existsSync(join(viewer, 'dist', 'modern-viewer.js'))).toBe(true);
    const assets = JSON.parse(readFileSync(join(viewer, 'viewer-assets.json'), 'utf8'));
    expect(assets.minecraftVersion).toBe(MYMC_DEFAULTS.version);
  });
});
