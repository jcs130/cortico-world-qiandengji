import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dryMountWorld } from 'cortico/extensions/dry-mount.ts';
import worldDefinition from '../src/index.ts';
import { MYMC_DEFAULTS, mymcEngineConfig } from '../src/config.ts';
import { assertMymcReady } from '../src/guard.ts';

describe('installable World', () => {
  it('passes the public API 5 dry mount without starting a player or model', async () => {
    const report = await dryMountWorld(worldDefinition, {
      scratchDir: join(fileURLToPath(new URL('../scratch/', import.meta.url)), 'public-sdk-mount'),
      packageDir: fileURLToPath(new URL('../', import.meta.url)),
      hasConsoleClient: true,
    });
    expect(report.failures).toEqual([]);
  });
  it('constructs without connecting and observes the configured server and port', async () => {
    const cfg = { ...structuredClone(MYMC_DEFAULTS), host: 'example.test', port: 25577, username: 'visitor' };
    assertMymcReady(cfg);
    const world = worldDefinition.create({ cfg, timezone: 'UTC', dataDir: '', botName: 'test' } as never);
    expect(world.id).toBe('mymc');
    expect((await world.envPromptVars())?.['mymc.world']).toContain('example.test:25577');
    expect(world.tools().map(tool => tool.name)).toEqual(expect.arrayContaining(['mymc_do', 'mymc_cast', 'mymc_scout', 'mymc_script']));
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

  it('uses packaged modern assets with all three camera pages and an original asset manifest', () => {
    const viewer = MYMC_DEFAULTS.viewerAssetsDir;
    expect(viewer).toBe(fileURLToPath(new URL('../dist/viewer/', import.meta.url)));
    for (const page of ['index.html', 'third/index.html', 'dungeon/index.html']) {
      expect(existsSync(join(viewer, 'public', page)), page).toBe(true);
    }
    expect(existsSync(join(viewer, 'dist', 'modern-viewer.js'))).toBe(true);
    const assets = JSON.parse(readFileSync(join(viewer, 'viewer-assets.json'), 'utf8'));
    expect(assets.minecraftVersion).toBe(MYMC_DEFAULTS.version);
  });
});
