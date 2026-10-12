# 联机版我的世界 · 千灯纪服务器 World

内置现代 Web 可视化，展示背包、任务、技能、魔力和服务端回执；通过千灯纪适配器支持服务器玩法与已验证的模组协议。包名仍为 `cortico-world-qiandengji`，原配置和 World ID `mymc` 保持兼容。

`server-guide.ts` 的 `cli` 主题保存人类提供的 Agent CLI 0.4.31 契约。环境入口只保留认证、目录、分页和结果未知的短说明，完整帮助按需读取；资料更新不代表服务器实测、主线毕业或能力已学会。

这里保存千灯纪账号规范、传送、公会/试炼、技能目录、服务器资料及旧 `mymc_*` World/MCP 装配。它们不属于默认 Agent MC World 产品，也不在通用发行包的 files 白名单中。

默认导出 `MYMC`，World ID 为 `mymc`，配置位于 `worlds.mymc`，工具前缀为 `mymc_`。在 Cortico 扩展页安装 `cortico-world-qiandengji`，或在扩展目录执行 `corepack pnpm add --ignore-workspace cortico-world-qiandengji`，重启宿主加载。配置服务器地址与账号后再启用；安装不会自动连接服务器。Cortico World API 为 5。

0.4.0 将独立核心 `agent-mc-world` 作为普通依赖自动安装；Cortico 由宿主提供。发行包包含自身编译后的服务器扩展与控制台，不依赖邻接源码目录。已有部署继续沿用 `mymc`、原账号、记忆和账本；升级前备份部署目录。通用插件 `cortico-world-minecraft-agent` 的 ID 为 `mc`，不要与本插件同时启用同一连接。

源码入口是 `cortico.ts` 的 `MYMC`、`runtime.ts` 的 `MymcAgentRuntime` 以及 `stdio.ts`；核心扩展端口为 `agent-mc-world/extension`。构建命令在仓库根执行 `pnpm build:extensions`。旧操作说明保存在 `LEGACY-README.md` / `LEGACY-DEPLOYMENT.md`，只用于兼容维护。

新 Agent 应从服务器帮助、目录和实际回执学习玩法，把适用条件与失败边界交给自己的方法库。这里的旧快捷传送、试炼前置检查等维护规则，不自动作为新通用 Agent 的学习成果。后续应把已观测协议与资料逐步替换为显式服务器能力适配，保持来源和版本，避免默认强制活动脚本。

服务器能力源码位于 `engine/`，通过显式本地 factory 传给核心。法术、魔力、试炼、随身容器规则和保护频道均由本插件维护。快战术的模型选择由宿主维护；这里提供 battlefield/choice 和再次校验。`combatOptions` 只含可执行策略，不包含模型 endpoint。演出端点需显式配置；游戏音效使用部署者本地的匹配版本 Java 客户端资产，不随 npm 重新分发。
