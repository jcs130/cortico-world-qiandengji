import { CommandRepetitionGuard } from 'agent-mc-world/command-repetition';
import type { ToolOutcome, World } from 'agent-mc-world/contracts';

type Arguments = Record<string, unknown>;
const numenRead = { tool: 'mymc_numen', arguments: { op: 'observe' } };
const clientRead = { tool: 'mymc_state', arguments: { detail: 'body' } };

function commandPlan(name: string, args: Arguments) {
  if (name === 'mymc_do') return { steps: args.steps, next: clientRead };
  const command = name === 'numen_command' ? args
    : name === 'mymc_numen' && args.op === 'call' && args.tool === 'numen_command' ? args.args as Arguments | undefined
    : undefined;
  if (typeof command?.line !== 'string') return null;
  const line = command.line.trim();
  return { steps: [{ skill: 'chat', text: line.startsWith('/') ? line : '/' + line }], next: numenRead };
}

function inspected(name: string, args: Arguments, outcome: string | ToolOutcome): boolean {
  const reply = typeof outcome === 'string' ? undefined : outcome;
  if (reply?.failed) return false;
  if (name === 'mymc_state') return true;
  if (name === 'mymc_numen' && args.op === 'observe')
    return typeof reply?.meta?.sampledAt === 'number' && Number.isFinite(reply.meta.sampledAt);
  const inner = name === 'mymc_numen' && args.op === 'call' ? args.tool : name;
  if (inner === 'numen_status') return reply?.data?.control === 'ready' && Boolean(reply?.data?.snapshot);
  if (inner === 'numen_survey' || inner === 'numen_adventure_query') return reply?.data?.status === 'completed';
  if (name === 'numen_result' || name === 'mymc_numen' && args.op === 'result')
    return reply?.data?.terminal === true && typeof reply.data.status === 'string' && reply.data.status !== 'unknown';
  return false;
}

/** Project both Cortico body transports into the public core command guard.
 * This wrapper preserves the original name, arguments and executor. */
export function withCorticoCommandFeedback<T extends World>(world: T): T {
  let attempts = new CommandRepetitionGuard();
  const tools = world.tools.bind(world), stop = world.stop.bind(world);
  world.stop = async () => {
    attempts = new CommandRepetitionGuard();
    await stop();
  };
  world.tools = () => tools().map(tool => ({
    ...tool,
    handler: async (args, context) => {
      const guard = attempts;
      const plan = commandPlan(tool.name, args);
      if (plan && context.callId && !context.signal?.aborted) {
        let admission;
        try { admission = guard.admit('mymc_do', { steps: plan.steps }, context.callId, 0); }
        catch {
          return { text: '同一请求号已有不同的命令参数，请核对原回执。', failed: true as const,
            data: { status: 'rejected', reason: 'request_id_conflict', dispatched: false, retryable: false } };
        }
        if (admission && !admission.admitted) return {
          text: '重复命令未派发。请先核对原回执、当前位置和任务条件。',
          failed: true as const,
          data: { status: 'blocked', reason: 'command_repetition_requires_inspection', dispatched: false, retryable: false,
            next_safe_read: { tool: plan.next.tool, arguments: { ...plan.next.arguments } } },
        };
      }
      const outcome = await tool.handler(args, context);
      if (attempts === guard && !context.signal?.aborted && inspected(tool.name, args, outcome)) guard.inspected();
      return outcome;
    },
  }));
  return world;
}
