import { chatInputError } from 'agent-mc-world/extension';
import type { ObservedCommandCatalog } from 'agent-mc-world/extension';
import type { CombatAbilities } from 'agent-mc-world/tactics';
import type { ToolDef, ToolOutcome } from 'agent-mc-world/contracts';
import type { NativeSkillDetail } from './native-rpg.ts';

/** Explicit transport on the host's existing authenticated connection; never owns movement. */
export interface QiandengjiCastToolPort {
  connection(): { send(command: string): void; published?(command: string): void } | null;
  blockedReason?(): string | null;
  abilities: Pick<CombatAbilities, 'hasAbility' | 'manualCastBlock' | 'noteManualCast'>;
  commands: Pick<ObservedCommandCatalog, 'misplacedPrefix'>;
  /** Current connection's validated invocation entry; clear it on reconnect/class change. */
  skillDetail?(id: string): Pick<NativeSkillDetail, 'name' | 'command' | 'invocation' | 'observedAt'> | null;
  log?(name: string, args: Record<string, unknown>, text: string): string;
}

export const QIANDENGJI_CAST_TOOL: Omit<ToolDef, 'handler'> = {
  name: 'mc_cast',
  tags: ['act'],
  description:
    'Cast one server-listed /mycli spell immediately, even during combat or retreat. '
    + 'This does not enter the task queue or take movement control. The reply only confirms sending; '
    + 'the server message and observed effects determine whether the spell worked. '
    + 'For planned timed movement, prepare the route first and queue the cast chat command with dependent flight steps in one mc_do group; do not start the timer while earlier queued work is still running. '
    + 'Pass only the arguments declared by the current server skill contract as separate tokens. '
    + 'This always sends /mycli cast <spell>; other server command namespaces must use mc_do chat with the exact observed usage. '
    + 'Use /mycli skills for current unlocks and /mycli capabilities for command contracts; historical spell lists do not prove current availability.',
  parameters: {
    type: 'object',
    properties: {
      spell: {
        type: 'string', pattern: '^[a-z][a-z0-9_:-]{0,63}$',
        description: 'Skill ID from the current server listing, with its current unlock and target requirements.',
      },
      arguments: {
        type: 'array',
        items: { type: 'string', minLength: 1, pattern: '^[^\\s\\u0000-\\u001f\\u007f-\\u009f\\u00a7<>]+$' },
        description: 'Optional command arguments in server order, one token per item. No whitespace, control characters or <placeholder> text; read the spell description for required values.',
      },
    },
    required: ['spell'],
  },
};

export function invokeQiandengjiCast(port: QiandengjiCastToolPort, args: Record<string, unknown>): string | ToolOutcome {
  const inhibitReason = port.blockedReason?.() ?? null;
  const log = port.log ?? ((_name: string, _args: Record<string, unknown>, value: string) => value);

  if (inhibitReason) return { text: log('mc_cast', args, `[mc_cast 未发送] ${inhibitReason}`), failed: true, endsTurn: true };
  const spell = args.spell;
  if (typeof spell !== 'string' || !/^[a-z][a-z0-9_:-]{0,63}$/.test(spell)) {
    return { text: log('mc_cast', args, '[mc_cast 失败] spell 必须是服务端给出的英文技能 ID'), failed: true };
  }
  const parameters = args.arguments === undefined ? [] : args.arguments;
  if (!Array.isArray(parameters)
    || !parameters.every((value: unknown) => typeof value === 'string' && value.length > 0
      && !/[\s\u0000-\u001f\u007f-\u009f<>]/u.test(value))) {
    return { text: log('mc_cast', args,
      '[mc_cast 失败] arguments 必须是独立参数词组成的数组，不能包含空白、控制符或 <占位符>；按服务端说明填写实际值'), failed: true };
  }
  const command = `/mycli cast ${spell}${parameters.length ? ` ${parameters.join(' ')}` : ''}`;
  const inputError = chatInputError(command);
  if (inputError) return { text: log('mc_cast', args, `[mc_cast 失败] ${inputError}`), failed: true };
  const connection = port.connection();
  if (!connection) return { text: log('mc_cast', args, '[mc_cast 失败] 还没连上服务器'), failed: true };
  const detail = port.skillDetail?.(spell);
  if (detail?.invocation === 'command') {
    return { text: log('mc_cast', args,
      `[mc_cast 未发送] ${detail.name}（${spell}）的本连接服务端命令是 ${detail.command}，不是 /mycli cast。`
      + ` 用 mc_do ${JSON.stringify({ steps: [{ skill: 'chat', text: detail.command }] })}；先读该入口的目标和前提。`
      + '未附加原施法参数、未代为执行。来源 MC_RPG，观测 ' + detail.observedAt), failed: true,
      meta: { reason: 'command-route-mismatch', skillId: spell, advertisedCommand: detail.command, dispatchStarted: false } };
  }
  const route = port.abilities.hasAbility(spell) ? null
    : port.commands.misplacedPrefix(command, '/mycli cast');
  if (route) {
    const example = JSON.stringify({ steps: [{ skill: 'chat', text: route.suggestedCommand }] });
    return { text: log('mc_cast', args,
      `[mc_cast 未发送] 本工具固定使用 /mycli cast；服务端已给出 ${route.id} 的另一条命令用法：${route.usage}（观测 ${new Date(route.observedAt).toISOString()}）。`
      + ` 若仍要执行该操作，用 mc_do ${example}；先核对服务端前提。这里只纠正命令入口，未代替执行，也未确认子命令、参数、目标或资格。`), failed: true };
  }
  const blocked = port.abilities.manualCastBlock(spell);
  if (blocked) {
    return { text: log('mc_cast', args, `[mc_cast 暂缓] ${blocked}；该技能以新的服务端状态为准，其他技能和动作仍可选择`),
      failed: true, endsTurn: true };
  }
  let sent = false;
  try {
    connection.send(command);
    sent = true;
    connection.published?.(command);
    port.abilities.noteManualCast(spell);
    return log('mc_cast', args, `[mc_cast] 已发送 ${command}；是否生效以服务端回执和现场状态为准`);
  } catch (error) {
    return { text: log('mc_cast', args, sent ? `[mc_cast] 命令已发送，但本地记录失败:${String(error)}；效果仍未知`
    : `[mc_cast 失败] 发送抛错:${String(error)}；结果未知，未自动重试`), failed: true,
    data: { commandSent: sent, outcomeUnknown: true, goal_completed: false } };
  }
}

export function createQiandengjiCastTool(port: QiandengjiCastToolPort): ToolDef {
  return { ...QIANDENGJI_CAST_TOOL, handler: async args => invokeQiandengjiCast(port, args) };
}
