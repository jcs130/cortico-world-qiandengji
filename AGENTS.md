# World / server extension development

- 通用核心唯一源码在 jcs130/minecraft-ai-friend 的 packages/agent-mc-world。本仓库只维护千灯纪服务器扩展、资料包和 Cortico API 5 World 适配器，不恢复 core/ 副本。
- 生产源码只通过 agent-mc-world 的公开 exports 引用核心。核心不反向依赖本仓库、Cortico、DSH 或 N.E.K.O。
- packages/qiandengji 是中立服务器包，integrations/qiandengji/package.json 是唯一公开 Cortico World 发布入口；根目录是 private 开发工作区。
- 开发前核对远程 main 和 npm 版本。核心候选尚未发布时，显式准备 vendor/agent-mc-world-0.4.0.tgz，使用锁文件验证；不从相邻源码目录抽取或打补丁。
- 服务器特有能力显式启用；主模型、快模型、人格、记忆和学习决策属于宿主，不增加隐式模型循环。
- 通用画面代码仍归 jcs130/mc-visual-console；演出/TTS/歌曲仍归独立 VTuber 扩展。
- 构建和测试使用独立副本。源码调整不授权重载；沿用线程已有明确中断范围，保留目标、记忆和账本。
- 提交前完整运行本仓库测试、类型检查、API 5 包验证；核心变更另在主项目验收。显式暂存、conventional commit。
- 分开记录源码、提交、发行包、部署加载和实际游戏效果。任务受理、回合结束与目标完成必须分别验收。
