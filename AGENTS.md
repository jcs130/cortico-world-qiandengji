# Agent MC World 开发约定

- 产品是通用 Mineflayer 客户端 / Agent Harness，包名 `agent-mc-world`，默认 Cortico World ID `mc`。仓库名称暂沿用发布历史，不自动更改远程仓库。
- MCP、SDK 和自有宿主类型不得依赖 Cortico 或指定服务器的玩法。Cortico 只作宿主适配器。
- 千灯纪规则、账号、传送和玩法目录在 `integrations/qiandengji/` 维护，不进入默认发行包。服务器特有能力由 Agent 按帮助与真实回执学习，维护者写的规则不得冒称自主学习。
- 游戏操作复用 Mineflayer 与同一执行器；技能说明、脚本、组合方法和评价分别处理，避免重复实现动作控制。
- 画面与 OBS 通用代码维护在 `jcs130/mc-visual-console`；演出/TTS/歌曲维护在独立 VTuber 扩展。向量/记忆服务由宿主适配，不能代替当前游戏事实。
- 开发前核对远程主分支和发布版本。生成引擎和共享画面按 `release-sources.json` 固定提交构建。
- 发布构建使用独立副本，禁止覆盖现役 `engine/`、`dist/` 或配置。结构调整不授权重载；沿用本线程范围匹配的中断授权，保留目标、记忆和账本。
- 提交前通过完整测试和类型检查；发布另外检查 API 5 装配、SDK 类型独立、MCP 无 Cortico/服务器政策、生产依赖安装与包内容。显式暂存文件，使用 conventional commit。
- 源码、提交、安装包、加载与实际游戏验证分别记录。离线检查、源码存在、程序结束和随机成功不能代替目标净进展或学习证据。
