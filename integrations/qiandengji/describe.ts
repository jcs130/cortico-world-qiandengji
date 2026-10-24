import type { ToolDef } from 'agent-mc-world/contracts';
import {HARNESS2_PRACTICE_TOOL} from 'agent-mc-world/learning';

/** Event types emitted by the owned Minecraft producers, translated by this
 * adapter. Tool definitions below come from the actual implementations. */
const events: Readonly<Record<string, string>> = {
  body: '身体控制权、当前执行状态和恢复条件。',
  chat: '同一游戏连接实际收到的玩家聊天，保留发言人。',
  'client.action': '原生客户端动作回执；受理和完成分开记录。',
  'client.disconnected': '原生客户端连接中断及其原因。',
  'client.message': '原生客户端实际收到的系统或界面消息。',
  'client.message_gap': '原生客户端消息序列缺口，不能当成完整历史。',
  'client.control_lost': '原生客户端控制租约丢失，动作需要重新核验。',
  combat: '真实战斗现场或战斗执行反馈。',
  enter: '当前连接观测到的玩家进入游戏。',
  event: 'Minecraft 生命周期、危险或环境通知。',
  'goal.metrics': '目标执行统计；计数本身不证明目标完成。',
  'goal.revision': '目标或阶段的有来源修订回执。',
  leave: '当前连接观测到的玩家离开游戏。',
  lifecycle: '引擎启动、中断或恢复的生命周期通知。',
  memory: '带来源和适用条件的游戏历史记忆，不代表当前现场。',
  method: '方法运行、源码版本与执行终态证据。',
  practice: 'Harness² 隔离方法练习终态；包含试跑和复盘证据，不代表线上采用。',
  photo: '摄影或图像处理的异步结果及失败状态。',
  reflex: '已有反射控制的实际触发和执行证据。',
  skill: '显式服务器资料包收到的技能或魔力回执。',
  sleep: '实际游戏睡眠状态事件。',
  'storage.migration':'旧游戏数据等待操作员审核迁移；不表示连接或动作完成。',
  tactic: '战术程序的执行或终态回执。',
  task: '任务执行终态；须进一步核对世界净变化。',
  'task.progress': '当前身体任务的中间进度和路线反馈。',
  'task.queue': '任务排队、启动或拒绝信息。',
  visual: '异步观察画面和关联的现场事实。',
  wake: '实际游戏起床或睡眠结束事件。',
  world: '当前连接收到的世界状态变化。',
  'world.snapshot': '带采样时间的世界状态快照。',
};

export function describeMymcImplementations(worlds: readonly { tools(): ToolDef[] }[]) {
  const tools = new Map<string, Pick<ToolDef, 'name' | 'description' | 'parameters'> & { tags: readonly string[] }>();
  for (const world of worlds) for (const tool of world.tools()) {
    if (!tools.has(tool.name)) tools.set(tool.name, { name: tool.name, description: tool.description,
      parameters: structuredClone(tool.parameters), tags: [...(tool.tags ?? [])] });
  }
  const practice={...HARNESS2_PRACTICE_TOOL,name:'mymc_practice',description:HARNESS2_PRACTICE_TOOL.description.replaceAll('mc_script','mymc_script')};
  tools.set(practice.name,practice);
  return { tools: [...tools.values()].sort((a, b) => a.name.localeCompare(b.name)),
    events: [
      ...Object.entries(events).map(([suffix, description]) => ({ type: `mymc.${suffix}`, description })),
    ] };
}
