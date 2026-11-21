import { describe, expect, it, vi } from 'vitest';
import { nullLogger } from 'agent-mc-world/client';
import type { ToolDef, ToolOutcome, World } from 'agent-mc-world/contracts';
import { withCorticoCommandFeedback } from '../integrations/qiandengji/cortico-command-feedback.ts';

const move = { skill: 'goto', x: 10, y: 64, z: 20 };
const command = { skill: 'chat', text: '/mycli goto arena' };
const call = (world: World, name: string, args: Record<string, unknown>, callId: string) =>
  world.tools().find(tool => tool.name === name)!.handler(args, { role: 'main', callId, log: nullLogger() }) as Promise<ToolOutcome>;

function client() {
  const dispatch = vi.fn(async (_args: Record<string, unknown>) => ({ text: 'submitted', data: { status: 'accepted' } }));
  const state = vi.fn<() => Promise<ToolOutcome>>(async () => ({ text: 'current position' }));
  const tool = (name: string, handler: ToolDef['handler']): ToolDef =>
    ({ name, parameters: { type: 'object' }, tags: ['read'], description: name, handler });
  const world = withCorticoCommandFeedback({
    id: 'mymc', start: async () => {}, stop: async () => {}, envPromptVars: () => ({}),
    tools: () => [tool('mymc_do', dispatch), tool('mymc_state', state)],
  });
  return { world, dispatch, state };
}

describe('shared Cortico command feedback', () => {
  it('blocks the fourth opaque command on the client World and unlocks after a live read', async () => {
    const { world, dispatch, state } = client();
    const run = (id: string) => call(world, 'mymc_do', { steps: [command] }, id);
    for (const id of ['one', 'two', 'three']) expect((await run(id)).data?.status).toBe('accepted');
    expect((await run('four')).data).toMatchObject({
      status: 'blocked', reason: 'command_repetition_requires_inspection', dispatched: false,
      retryable: false, next_safe_read: { tool: 'mymc_state', arguments: { detail: 'body' } },
    });
    expect(dispatch).toHaveBeenCalledTimes(3);
    state.mockResolvedValueOnce({ failed: true, text: 'body disconnected' });
    await call(world, 'mymc_state', {}, 'disconnect');
    expect((await run('five')).data?.status).toBe('blocked');
    await call(world, 'mymc_state', { detail: 'body' }, 'live');
    expect((await run('six')).data?.status).toBe('accepted');
    expect(dispatch).toHaveBeenCalledTimes(4);
    expect(dispatch.mock.calls[3][0]).toEqual({ steps: [command] });
  });

  it('leaves mixed plans and auth alone and protects existing command identities', async () => {
    const { world, dispatch } = client();
    for (let index = 0; index < 4; index++) {
      await call(world, 'mymc_do', { steps: [move, command] }, 'move-' + index);
      await call(world, 'mymc_do', { steps: [{ skill: 'chat', text: '/login fixture' }] }, 'login-' + index);
    }
    await call(world, 'mymc_do', { steps: [command] }, 'original');
    const conflict = await call(world, 'mymc_do', { steps: [{ skill: 'chat', text: '/mycli goto home' }] }, 'original');
    expect(conflict.data).toMatchObject({ reason: 'request_id_conflict', dispatched: false });
    expect(dispatch).toHaveBeenCalledTimes(9);
  });
});
