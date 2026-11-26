import type { ToolDef, ToolOutcome } from 'agent-mc-world/contracts';

/** Explicit write surface. Current journal/skill replies decide IDs and eligibility. */
export const TASK_ACTION_DECL: Omit<ToolDef, 'handler'> = {
  name: 'mymc_task_action',
  tags: ['act'],
  barrierAfter: true,
  description: 'Execute one current server-owned task or skill write: journal_submit with an itemId from the current journal, learn with an ID from current skills.status/info, or migrate for the current character. Mineflayer/Java bodies use mymc_query journal and queue one exact chat command; Numen bodies use numen_command "/mycli journal --json" and the same original command/receipt path. The terminal body/server receipt and a fresh journal or skills read decide actual success. Never invent IDs or amounts, never resend an unknown request, and never use this to repeat historical claims. A sent command is not a completed task, learned skill or credited migration.',
  parameters: {
    type: 'object', additionalProperties: false,
    properties: {
      action: { type: 'string', enum: ['journal_submit', 'learn', 'migrate'], description: 'journal_submit dispatches the original domain validation; learn spends only current eligible points; migrate credits verified unused legacy points once.' },
      id: { type: 'string', pattern: '^[A-Za-z0-9_:.-]{1,100}$', description: 'Required only for journal_submit or learn. Copy the exact itemId or skill/node ID from a current reply. Omit for migrate.' },
    },
    required: ['action'], allOf: [
      { if: { properties: { action: { const: 'migrate' } }, required: ['action'] },
        then: { not: { required: ['id'] } },
        else: { required: ['id'] } },
    ],
  },
};

export function taskActionArgs(value: Record<string, unknown>): Record<string, unknown> {
  const action = value.action;
  if (action === 'migrate') {
    if (Object.hasOwn(value, 'id')) throw new Error('migrate takes no id or point amount');
    return { steps: [{ skill: 'chat', text: '/mycli profession migrate --json' }] };
  }
  if (action === 'journal_submit' || action === 'learn') {
    const id = value.id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_:.-]{1,100}$/.test(id)) throw new Error('Copy an exact current item or skill ID');
    const text = action === 'journal_submit' ? `/mycli journal submit ${id}` : `/mycli skills learn ${id} --json`;
    return { steps: [{ skill: 'chat', text }] };
  }
  throw new Error('Unknown task action');
}

export function taskActionNote(action: unknown): string {
  if (action === 'journal_submit') return '[任务提交] 已进入原领域验收；完成与否以原回执和随后 journal 查询为准。';
  if (action === 'learn') return '[技能学习] 已提交当前 ID；是否学会和扣点以保存回执及随后 skills.status/info 为准。';
  if (action === 'migrate') return '[旧点迁移] 已按当前角色请求迁移；以迁移回执及随后职业学习点复查为准，不重复领取。';
  return '';
}

export function withTaskActionNote(result: string | ToolOutcome, action: unknown): string | ToolOutcome {
  const note = taskActionNote(action);
  if (typeof result === 'string') return [note, result].filter(Boolean).join('\n');
  return { ...result, text: [note, result.text].filter(Boolean).join('\n') };
}
