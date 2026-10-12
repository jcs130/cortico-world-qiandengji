# 构建、发布与部署

本包是 **agent-mc-world**，默认通用 World ID `mc`。安装与初次验收见 [Agent MCP](docs/agent-mcp.md)，现役千灯纪迁移见 [0.3 边界](docs/migration-0.3.md)。推荐 Node.js 24，开发使用 TypeScript、Vitest 和固定版本的生产依赖。

`release-sources.json` 固定引擎上游和共享可视化提交。`scripts/build-release.ts engine` 生成引擎并应用本仓库补丁；`viewer` 打包共享画面与观察页面；`scripts/build-console.mjs` 打包 Cortico 面板。默认画面素材不使用千灯纪预设。

`scripts/build-types.mjs` 只生成公开类型依赖图，供 SDK 的 `types` 导出使用；调用方无需类型检查私有引擎实现。生产依赖安装会产生不同的传递依赖布局，须对实际安装包执行 SDK 导入和 TypeScript 消费检查，不能仅凭开发目录类型检查通过判定可接入。

**在独立发布副本构建**，不要覆盖现役进程使用的 `engine/`、`dist/` 或运行时配置。发布检查包括完整测试、类型检查、Cortico API 5 dry mount、SDK 无 Cortico 类型消费、禁止加载服务器政策的 MCP 进程检查，以及安装包生产依赖验收。

`scripts/verify-release.mjs` 核对引擎补丁、宿主结构契约、打包运行时、共享画面桥接、素材和字体的哈希。`npm pack` 前执行该检查。包的 files 白名单排除 `integrations/qiandengji/`、旧 World/MCP 与服务器技术资料。

Cortico 通过默认导出或 `agent-mc-world/adapters/cortico` 装配，配置写入 `worlds.mc.*`。与内置 Minecraft World 共享 `minecraft-client` 资源，不能同时启用。独立 MCP/SDK 不安装 Cortico。

源码合并、提交、发布、部署加载与实际游戏结果分别记录。离线 MCP 与 mock 执行不能代替真实服务器的登录、抵达、挖放或战斗验证。
