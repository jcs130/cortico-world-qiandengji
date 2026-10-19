import { expect, it } from 'vitest';
import type { ToolDef } from 'agent-mc-world/contracts';
import { type MinecraftWorldProxy } from 'agent-mc-world/extension';
import { nullLogger } from 'agent-mc-world/client';
import { MymcWorld } from '../integrations/qiandengji/world.ts';
import { MYMC_DEFAULTS } from '../integrations/qiandengji/config.ts';

it('mounts compact parameters with full renamed help and leaves the engine catalogue unchanged', async () => {
  const schema = { type: 'object', required: ['steps'], properties: { steps: { type: 'array',
    description: 'Exact action notes: read the current skill signature', items: { type: 'object' } } } };
  const declared: ToolDef[] = [{ name: 'mc_do', tags: ['act'], description: 'Submit ordered actions',
    parameters: schema, handler: async () => { throw new Error('Help must not run an action'); } }];
  const engine = { tools: () => declared, requestFacts: () => null } as unknown as MinecraftWorldProxy;
  const cfg = { ...structuredClone(MYMC_DEFAULTS), toolParameterDescriptions: 'on-demand' as const };
  const world = new MymcWorld({ cfg }, engine);
  const tools = world.tools();
  const projected = tools.find(tool => tool.name === 'mymc_do')!;
  expect((projected.parameters.properties as any).steps.description).toBeUndefined();
  expect(projected.parameters.required).toEqual(['steps']);
  const help = await tools.find(tool => tool.name === 'mymc_tool_help')!.handler(
    { name: 'mymc_do', path: '/properties/steps', full: true }, { role: 'test', log: nullLogger() });
  expect(JSON.parse(typeof help === 'string' ? help : help.text).schema).toEqual(schema.properties.steps);
  expect(schema.properties.steps.description).toContain('Exact action notes');
});
