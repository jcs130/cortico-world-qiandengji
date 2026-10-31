# World / server extension development

- Java 1.21.1 is the primary maintenance and acceptance target. Server-attested appearance and observer transports follow validated payload formats rather than a 1.20.6-only host gate. Keep the original connection identity, actual packet codecs, source hashes and explicit 1.20.6 compatibility coverage.

- 核心包是首要项目，通用核心唯一源码在 jcs130/minecraft-ai-friend 的 packages/agent-mc-world。本仓库是消费端，只维护千灯纪服务器扩展、资料包和 Cortico API 6 薄 World 适配器及显式 API 5 私有兼容包，不恢复 core/ 副本。
- 通用感知、动作、导航、背包/合成、脚本/技能库、游戏记忆、学习评估和快决策状态/候选契约都先在核心实现、修复并公开导出，再以独立 SDK/MCP/宿主消费验证后更新锁定依赖。不能只为可米或 Cortico 加通用能力，其他模型与宿主应通过同一核心接口复用。
- 生产源码只通过 agent-mc-world 的公开 exports 引用核心。核心不反向依赖本仓库、Cortico、DSH 或 N.E.K.O。
- packages/qiandengji 是中立服务器包；integrations/qiandengji/package.json 发布完整 World，integrations/qiandengji-lite/package.json 发布基于官方 Minecraft World 的最小服务器接入扩展。lite 独立构建与验证，通用能力仍只消费核心公开接口；根目录是 private 开发工作区。
- 开发前核对远程 main 和 npm 版本。核心候选尚未发布时，显式准备与 package.json/锁文件匹配的 vendor 归档并校验 SHA；不从相邻源码目录抽取或打补丁。
- 服务器特有能力显式启用；主模型、快模型、人格、个人记忆和学习决策属于宿主，通用游戏记忆与技能演化机制属于核心，不增加隐式模型循环。
- 通用画面代码仍归 jcs130/mc-visual-console；演出/TTS/歌曲仍归独立 VTuber 扩展。
- 构建和测试使用独立副本。源码调整不授权重载；沿用线程已有明确中断范围，保留目标、记忆和账本。
- 提交前完整运行本仓库测试、类型检查、当前 API 6 包验证和私有 API 5 兼容包验证；核心变更另在主项目验收。显式暂存、conventional commit。
- 分开记录源码、提交、发行包、部署加载和实际游戏效果。任务受理、回合结束与目标完成必须分别验收。
