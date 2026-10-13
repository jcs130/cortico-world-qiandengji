/** Server manuals are read by topic; the index needs no manual file reads. */
import { readFileSync } from 'node:fs';
import { QIANDENGJI_PACK } from './data-packs/qiandengji/manifest.ts';

export const MYMC_GUIDE_TOPICS = [
  { id: 'cli', title: 'Agent CLI 0.4.31', description: '认证、能力、状态、分页与未知结果' },
  { id: 'world', title: '世界与自主探索', description: '世界设定、独自生活与活动选择' },
  { id: 'stories', title: '千灯纪故事线', description: '游戏内发现与选目标' },
  { id: 'onboarding', title: '基础入口', description: '进度与道具' },
  { id: 'skill-paths', title: '技能基础', description: '点数与说明' },
  { id: 'protection', title: '保护与权限', description: '村庄保护、采集拒绝与操作边界' },
  { id: 'travel', title: '传送与抵达', description: '归乡、村庄路标、实际高度与脱困' },
  { id: 'guild', title: '公会委托与共享', description: '看板、接单交付、公共箱与分享装备' },
  { id: 'trial', title: '试炼塔', description: '入场、楼层进度、第七层与通关核验' },
  { id: 'storage', title: '背包与个人奖励箱', description: '开窗存取、腾格、箱账、收纳与领奖' },
  { id: 'tasks', title: '任务执行与受阻', description: '队列、依赖、终态、材料与失败后的调整' },
  { id: 'skills', title: '技能学习与施法', description: '命令目录、技能说明、魔力、冷却与罗盘' },
  { id: 'flight', title: '飞行术', description: '限时飞行、落脚点与同单施法飞行' },
  { id: 'control', title: '直接控制与方法试验', description: '短时按键、斜飞、跃空反馈与自主修订动作序列' },
  { id: 'combat', title: '战斗与补给', description: '主动选敌与接管、可用连招、装备、救援与撤离' },
  { id: 'tactics', title: '自主快战术与修订', description: '自己编写候选程序、短步、反馈与版本对照' },
  { id: 'mining', title: '探矿与挖掘', description: '绝对定位、隐藏矿石、安全井口与保护' },
  { id: 'living', title: '种植钓鱼与烹饪', description: '生长回访、岸上钓鱼、熔炉与睡觉' },
  { id: 'building', title: '家与建造', description: '布局、蓝图、施工核验与设计经验' },
  { id: 'railway', title: '铁路设计与连通性', description: '选线美感、轨形连通、动力与试乘' },
  { id: 'social', title: '玩家交往与动作', description: '附近感知、公屏私聊、拜访、挥手与赠物' },
  { id: 'vision', title: '现场视觉与空间几何', description: '第一人称、切片、射线、净空与证据边界' },
  { id: 'broadcast', title: '直播与加入方式', description: '介绍玩法、内测 QQ 群、事实解说与语音节奏' },
  { id: 'state', title: '当前环境读数', description: '任务、目标、探索、规则与摄像机当前采样' },
] as const;

export type ServerGuideTopic = typeof MYMC_GUIDE_TOPICS[number]['id'];

export function serverGuideIndex(): string {
  return MYMC_GUIDE_TOPICS.map(({ id, title, description }) => `${id}：${title}；${description}`).join('\n');
}

/** Templates remain intact so the World can render them from its current envPromptVars. */
export function readServerGuide(topic?: unknown): { text: string; failed?: true } {
  if (topic === undefined || topic === 'index') return {
    text: `千灯纪玩法索引。资料包 ${QIANDENGJI_PACK.id}@${QIANDENGJI_PACK.version}，维护者资料；用 mymc_guide 的 topic 读取相关全文，规则与命令以当次服务端回执为准。\n${serverGuideIndex()}`,
  };
  const entry = MYMC_GUIDE_TOPICS.find((candidate) => candidate.id === topic);
  if (!entry) return { failed: true, text: `玩法主题无效。省略 topic 查看索引，或使用以下主题：\n${serverGuideIndex()}` };
  const text = readFileSync(new URL(`./guides/${entry.id}.md`, import.meta.url), 'utf8').trim();
  return { text: `# 千灯纪 · ${entry.title}\n\n资料记录来源与操作建议；规则、位置和状态以当前服务端回执为准。\n\n${text}` };
}
