# 千灯纪技能与玩法资料包

随「联机版我的世界」提供，不是第二个 World。配置 `worlds.mymc.serverPack = "qiandengji"` 并重启后启用；默认 `none` 不启用本服务器的命令、账号前缀和频道。

版本、来源、许可证与激活条件见同目录的 `manifest.ts`（发行包为 `manifest.js`）。原文保存在 `../../guides/`，由 `mymc_guide` 按主题查询，覆盖技能、魔力、战斗、背包、保护、公会、试炼、种植、建造等。每次调用按当前事实渲染，不把整份手册塞入固定提示词。

资料属于维护者提供的参考，服务器回执优先。可执行的频道解码和动作校验仍在 `../../engine/`，只有明确选中本包才装配到客户端。资料包不调用模型、不管理人格或长期记忆，也不配置演出服务。

密码登录、正版授权、连接、断线重连、库存与基本动作是客户端通用功能，无需选中本资料包。

## 基础资料（2026-10-13）

- `mymc_guide {"topic":"onboarding"}`：`/mycli`、规则和进度入口，以及大背包、任务袋、奖励箱的区别。
- `mymc_guide {"topic":"skill-paths"}`：技能列表、详情、状态和技能点的查询方法。
- `mymc_guide {"topic":"stories"}`：引导从游戏内的人物与看板发现故事，保留原有自主生活建议。
- `mymc_guide {"topic":"skills"}`：命令发现、施法回执及现有技能目录的使用说明。

框架自带 `mc_life`（Cortico 名称为 `mymc_life`）继续提供通用生活故事。新增资料只保留最基础的使用入口，不预置剧情攻略、任务答案、解锁路线和固定数值。更多内容让 Agent 进游戏后通过 NPC、看板、问答和实际体验学习。已有专题手册继续按需查询，不额外加入固定提示词；服务器当次回执优先。参考源为 [千灯纪 Paper 源码](https://github.com/jcs130/minecraft-ai-friend/tree/qiandengji-personal-stash/paper)。
