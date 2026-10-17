import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GenericMymcWorld } from '../integrations/qiandengji/generic-world.ts';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { JavaMymcWorld } from '../integrations/qiandengji/java-world.ts';
import { WORLD_DEFAULTS } from '../integrations/qiandengji/config.ts';
import { MessageInbox } from '../integrations/qiandengji/message-inbox.ts';
import { nullLogger } from 'agent-mc-world/client';
import { MC } from '../src/adapters/minecraft.ts';

const dirs: string[] = [];
const directory = () => { const dir = mkdtempSync(join(tmpdir(), 'world-information-')); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it.each(['generic', 'server', 'java', 'compat'] as const)('discovers actual namespaced schemas without a game or host model: %s', async kind => {
  const dataDir = directory();
  const cfg = { ...structuredClone(WORLD_DEFAULTS), host: 'fixture.test', username: 'visitor' };
  const world = kind === 'generic' ? new GenericMymcWorld({ cfg, dataDir })
    : kind === 'server' ? new MymcWorld({ cfg: { ...cfg, serverPack: 'qiandengji' }, dataDir })
    : kind === 'java' ? new JavaMymcWorld({ cfg, dataDir })
    : MC.create({ cfg, dataDir } as any);
  try {
    const tools = world.tools();
    const prefix = kind === 'compat' ? 'agentmc' : 'mymc';
    const help = tools.find(tool => tool.name === `${prefix}_tool_help`)!;
    const messages = tools.find(tool => tool.name === `${prefix}_messages`)!;
    expect(help).toBeDefined(); expect(messages).toBeDefined();
    expect(tools.filter(tool => tool.name === help.name)).toHaveLength(1);
    const result = await help.handler({ name: messages.name, full: true }, { role: 'test', log: nullLogger() });
    expect(JSON.parse((result as any).text).schema).toEqual(messages.parameters);
    const list = await help.handler({}, { role: 'test', log: nullLogger() });
    expect(JSON.parse((list as any).text).tools.every((tool: any) => tool.name.startsWith(prefix + '_'))).toBe(true);
    expect((await help.handler({ name: 'mc_messages' }, { role: 'test', log: nullLogger() }) as any).failed).toBe(true);
  } finally { await world.stop(); }
});

it('reads a legacy v1 book without changing the filename or claiming it is new observation', () => {
  const dataDir = directory(), identity = 'fixture.test:25565:ag_visitor';
  const inbox = new MessageInbox(identity, dataDir);
  inbox.observe({ type: 'mymc.chat', source: 'mymc', text: '[MC 私聊] Alex: 我带了面包', ts: '2026-10-16T01:02:03Z', senderKey: 'Alex' });
  const file = readdirSync(dataDir)[0];
  expect(file).toMatch(/^mymc-messages-/);
  const legacy = JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
  delete legacy.messages[0].eventType; delete legacy.messages[0].provenance;
  writeFileSync(join(dataDir, file), JSON.stringify(legacy));
  const restored = new MessageInbox(identity, dataDir);
  expect(restored.readout({ id: 'message_1' }).text).toContain('Alex: 我带了面包');
  expect(restored.readout({ id: 'message_1' }).text).toContain('2026-10-16T01:02:03Z');
  expect(restored.index()).toContain('mymc_messages');
  expect(restored.index()).not.toMatch(/\bmc_messages list/);
  expect(readdirSync(dataDir)).toEqual([file]);
});
