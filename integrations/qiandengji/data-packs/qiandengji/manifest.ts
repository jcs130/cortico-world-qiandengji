/** Maintainer-supplied reference material; never evidence of learned or completed game goals. */
export const QIANDENGJI_PACK = Object.freeze({
  protocol: 'agent-mc-resource-pack/v1', id: 'qiandengji', version: '0.4.0',
  referenceRevision: '2026-10-13',
  title: '千灯纪技能与玩法资料包', activation: { configKey: 'serverPack', value: 'qiandengji', restart: true },
  source: 'https://github.com/jcs130/cortico-world-qiandengji', license: 'MIT',
  entry: '../../server-guide.js', documents: '../../guides/',
  guideTool: 'mymc_guide', authoritative: false,
  capabilities: ['stories', 'onboarding', 'skills', 'mana', 'protection', 'portable-storage', 'guild', 'trial', 'flight'],
  description: '选择后启用千灯纪协议适配和按主题查询的资料。命令、权限、魔力、库存与任务结果仍以本连接的服务端回执为准。',
});
