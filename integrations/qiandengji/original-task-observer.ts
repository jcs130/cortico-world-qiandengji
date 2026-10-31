/** Public-core readback for hosts retaining their original Minecraft executor. */
import {
  causalNeeds, sampleEffect, observedEffect, taskEffectProgress, NoEffectPlanBook,
  type SkillCall, type EffectSample, type ObservedEffect,
} from 'agent-mc-world/client';
type Bot = Parameters<typeof sampleEffect>[0];
type Step = { skill: string; needs?: number[]; at?: unknown };
type Readback = { inventoryReady: boolean };
type Landing = { step: number; call: Step; outcome: string; observedEffect?: unknown };
type Sample = { cell: [number, number, number] | null; dimension: string; value: EffectSample };

export function createOriginalTaskObserver(options: { now?: () => number; scope?: () => string } = {}) {
  const book = new NoEffectPlanBook({ now: options.now });
  let previous: Bot | null = null;
  const dimension = (bot: Bot) => String(bot.game?.dimension ?? 'unknown');
  const cell = (call: Step): [number, number, number] | null =>
    Array.isArray(call.at) && call.at.length === 3 && call.at.every(n => typeof n === 'number' && Number.isFinite(n))
      ? [...call.at] as [number, number, number] : null;
  const key = (steps: readonly Step[]) => JSON.stringify([options.scope?.() ?? null, steps]);
  // This retained body supplies a conservative frame of its loaded entities.
  // Unknown item metadata or targets leave comparison unavailable.
  const context = (steps: readonly Step[], bot: Bot | null, readback: Readback): string | null => {
    if (bot !== previous) { previous = bot; book.clear(); }
    if (!bot || !readback.inventoryReady || !steps.some(s => s.skill === 'pickup')
        || steps.some(s => !['goto', 'pickup', 'look', 'wait'].includes(s.skill))) return null;
    try {
      const sample = sampleEffect(bot, null, { inventoryReady: readback.inventoryReady });
      if (!sample.position || !sample.inventory || sample.window === undefined || !bot.entities) return null;
      const entities = Object.values(bot.entities);
      if (entities.length > 4096) return null;
      const drops = [];
      for (const entity of entities) {
        if (entity.name !== 'item') continue;
        const item = entity.getDroppedItem?.();
        const p = entity.position;
        if (!item || item.name === 'item' || !Number.isSafeInteger(item.count) || item.count < 0 || !p
            || ![entity.id, p.x, p.y, p.z].every(Number.isFinite)) return null;
        drops.push({ id: entity.id, name: item.name, count: item.count, position: [p.x, p.y, p.z].map(n => Math.round(n * 10) / 10) });
      }
      const targets = [];
      for (const call of steps) if (call.skill === 'goto') {
        const at = cell(call);
        if (!at) return null;
        const target = sampleEffect(bot, at, { inventoryReady: readback.inventoryReady }).target;
        if (!target) return null;
        targets.push({ at, ...target });
      }
      return JSON.stringify({ scope: options.scope?.() ?? null, dimension: dimension(bot),
        position: sample.position.map(n => Math.round(n * 10) / 10),
        inventory: Object.fromEntries(Object.entries(sample.inventory).sort(([a], [b]) => a.localeCompare(b))),
        window: sample.window, targets, drops: drops.sort((a, b) => a.id - b.id) });
    } catch { return null; }
  };
  const observer = {
    inspectTask(steps: readonly Step[], bot: Bot | null, readback: Readback): string | null {
      const review = book.review(key(steps), context(steps, bot, readback));
      return review ? `[同一选择暂无新的现场变化] 原任务#${review.latestTaskId}已有${review.completedNoopTasks}次完成回执，`
        + '但可比的工作读数未变化且含无事可做的步骤。本次未入队，原队列保留。请读取原终态；有新现场后可重新核验。' : null;
    },
    causalNeeds: (steps: readonly Step[], index: number, bot: Bot | null) => causalNeeds(steps as readonly SkillCall[], index, bot),
    beforeStep(call: Step, bot: Bot, readback: Readback): Sample {
      const at = cell(call);
      return { cell: at, dimension: dimension(bot), value: sampleEffect(bot, at, { inventoryReady: readback.inventoryReady }) };
    },
    afterStep(call: Step, before: unknown, bot: Bot, readback: Readback): ObservedEffect {
      const sample = before as Sample;
      const after = sampleEffect(bot, sample.cell, { inventoryReady: readback.inventoryReady });
      if (sample.dimension !== dimension(bot)) { after.position = null; after.inventory = null; }
      return observedEffect(call.skill, dimension(bot), sample.cell, sample.value, after);
    },
    onTaskFinished(task: { id: number; kind: 'done' | 'partial' | 'blocked'; steps: readonly Step[]; landings: readonly Landing[] }, bot: Bot | null, readback: Readback) {
      const progress = taskEffectProgress(task.landings.map(s => ({ outcome: s.outcome, skill: s.call.skill,
        ...(s.observedEffect ? { observedEffect: s.observedEffect as ObservedEffect } : {}) })));
      if (task.kind === 'done') book.record({ key: key(task.steps), taskId: task.id, context: context(task.steps, bot, readback), progress });
      const label = { changed: '有变化', unchanged: '未变化', unknown: '未知' }[progress.workObservation];
      return { progress, text: `[本单客户端工作读数] ${label}；已测${progress.measuredSteps}步，未知${progress.unknownSteps}步。目标完成仍由原始回执与实际结果核对。` };
    },
  };
  return { observer, reset() { previous = null; book.clear(); } };
}
