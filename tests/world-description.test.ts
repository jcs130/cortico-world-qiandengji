import { describe, expect, it } from 'vitest';
import { describeMymcImplementations } from '../integrations/qiandengji/describe.ts';
import { MYMC } from '../integrations/qiandengji/cortico.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('current Cortico World release contract', () => {
  it('exposes one browser implementation through the API 6 name and preserves API 5 local compatibility', () => {
    const world = MYMC.create({ cfg: MYMC.defaults(), dataDir: '', timezone: 'UTC', botName: 'test' } as never) as any;
    // Declarations contain freshly allocated handler functions on each read.
    // Compare serializable contribution data and actual callable capabilities.
    expect(JSON.parse(JSON.stringify(world.webUi()))).toEqual(JSON.parse(JSON.stringify(world.console())));
    expect(typeof world.webUi().snapshot).toBe(typeof world.console().snapshot);
    expect(world.tools().every((tool: any) => Array.isArray(tool.tags))).toBe(true);
  });
  it('takes names, descriptions and JSON schemas from the actual configured tool declarations', () => {
    const worlds = ['none', 'qiandengji'].map(serverPack => MYMC.create({
      cfg: { ...MYMC.defaults(), serverPack }, dataDir: '', timezone: 'UTC', botName: 'test' } as never));
    const metadata = describeMymcImplementations(worlds);
    for (const world of worlds) for (const tool of world.tools()) {
      expect(metadata.tools.find(entry => entry.name === tool.name)).toBeDefined();
    }
    const tool = worlds[0].tools().find(entry => entry.name === 'mymc_do')!;
    expect(metadata.tools.find(entry => entry.name === tool.name)?.parameters).toEqual(tool.parameters);
    expect(metadata.events.map(event => event.type)).toContain('mymc.task');
    expect(metadata.events.map(event => event.type)).toContain('minecraft.client.control_lost');
    expect(JSON.stringify(metadata)).not.toMatch(/AIza[\w-]{20}|sk-sp-[\w.-]{20}/);
  });
  it('publishes API 6 self-description and the supported Cortico version range', () => {
    const pkg = JSON.parse(readFileSync(resolve('integrations/qiandengji/package.json'), 'utf8'));
    expect(pkg.cortico.api).toBe(6);
    expect(pkg.cortico.webUiClient).toBe('dist/console.js');
    expect(pkg.cortico.describe).toBe('describe.json');
    expect(pkg.files).toContain('describe.json');
    expect(pkg.peerDependencies.cortico).toBe('>=0.2.1 <0.3.0');
  });
});
