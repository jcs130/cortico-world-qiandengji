# 联机版我的世界 · Agent MC World

为 Minecraft Agent 提供现代 Web 可视化、丰富的游戏信息，并通过扩展适配服务器技能和模组内容。可视化页面随 World 提供，共享渲染代码在 `mc-visual-console` 维护。

基于 **Mineflayer 的独立 Minecraft Agent 客户端 / 具身执行 Harness**。Agent 可以连接配置的 Minecraft Java 服务器，观察现场、组合动作、编写方法并读取实际执行结果。配套 skill 教 Agent 使用这些能力；主模型、目标、记忆和学习评价由接入的 Agent 提供。

从 **v0.3.0-next.1** 起，包名为 `agent-mc-world`，工具为 `mc_*`。0.4.0 起默认入口是中立 SDK，可选 Cortico 适配器的 World ID 为 `mc`。仓库暂沿用 [cortico-world-qiandengji](https://github.com/jcs130/cortico-world-qiandengji)，便于保留发布历史。**千灯纪是服务器玩法集成，已移到 `integrations/qiandengji/`，不随通用发行包安装。** 默认客户端不加账号前缀、不改写传送命令，也不假定公会、试炼、法术或服务器权限。

## 接入入口

| 方式 | 入口 | Agent 提供 |
| --- | --- | --- |
| MCP stdio | `minecraft-agent-mcp <私有配置.json>` | 支持工具调用与持续消费事件的宿主 |
| TypeScript SDK | `agent-mc-world/client` | 模型、记忆、事件唤醒与学习评价 |
| 联机版我的世界（Cortico API 5） | npm `cortico-world-qiandengji` | Cortico 与明确配置的服务器 |
| 宿主开发适配端口 | `adapters/cortico/`（仓库内私有示例，不进入核心安装包） | 开发者自行装配；不另发 World 插件 |
| 可复制的 Agent skill | `skills/minecraft-agent/` | 同一台机器或可访问的客户端入口 |
| 本机连接台 / Java 启动器 | `minecraft-agent-client <私有配置.json>` | 服务器与账号配置；可选已安装的 Java 客户端 |

安装 `agent-mc-world` 或对应 World 插件，也可安装 `.tgz` 并按 SHA256SUMS 核对。推荐 Node.js 24；无需安装 Cortico 即可使用 MCP/SDK，包括 SDK 类型。发布和部署的实际状态见 [0.4.0 记录](docs/release-0.4.0.md)，升级不自动迁移既有数据。

```text
npm install --ignore-scripts <agent-mc-world 安装包的绝对路径>
node node_modules/agent-mc-world/examples/agent-mcp-check.mjs
```

离线检查不会连接游戏。复制 `examples/minecraft-agent.json` 为私有配置，填写服务器、账号与协议版本，再设置 MCP 进程：

```text
node <绝对安装目录>/node_modules/agent-mc-world/bin/minecraft-agent-mcp.mjs <私有配置的绝对路径>
```

调用 `mc_connection {"action":"connect"}` 后读取连接事件确认登录。**每个 Agent 使用自己的账号、数据目录和非零画面端口**。v0.3.0-next.2 加入 `auth: microsoft` 原生设备码授权、独立凭据缓存和 `version: auto`；离线服使用 `auth: offline`。账号验证、协议进入游戏、网页画面和 Java 窗口就绪分别显示。见 [正版账号与启动器](docs/online-accounts.md)。

目标是连接 Mineflayer 支持的 **Java 服务器**。白名单、服务端权限、反机器人限制、协议版本及模组协议仍需实际验证；不保证任意服务器可用。内置现代画面素材匹配 Java 1.20.6，其他版本明确使用基础画面或另配匹配资源；协议登录不代表渲染或全部玩法兼容。

## 可用能力

- 原生观察与操作：位置、背包、实体、区块、局部体素、碰撞射线、导航、挖放、物品交互、方向键与视角。用 `mc_help` 和 `mc_script {"api":"index"}` 按需发现实际接口。
- 持续执行：已有任务可在 Agent 思考时继续，队列与脚本共用身体控制权、取消清理和真实终态。受理、执行结束、世界生效与目标完成分别核验。
- 自主学习的执行基础：原生 Mineflayer 脚本、版本化方法制品、组合执行、哈希、调用轨迹。Agent 自己提出改法、验证、评价、检索与复用；保存源码不代表学会。
- 空间读数：轨道端口与高度连通检查、体素切片和碰撞射线。无效路径不会被自动解释为深沟、断梯或不可达。
- 现代画面与 OBS：第一人称、第三人称、2.5D、透明 HUD 与只读技术指标，来自独立 [mc-visual-console](https://github.com/jcs130/mc-visual-console) 的固定版本。
- 连接与启动：独立本机连接台、微软设备码授权、自动版本协商、已安装 Java 客户端启动；Agent / 观察者 / 玩家缓存分离。MCP 可同时开启连接台，授权码不放进模型资源或 OBS。
- 通用生存/战斗反射与可选随机小动作在核心。受阻模型建议、模型小动作和快战术选择迁到宿主；千灯纪的法术、魔力和战术程序在服务器扩展。

服务器特有技能应从该服务器的帮助、目录和实际回执学习。服务器说明属于可选资料，不能自动替 Agent 做传送、强制补给或完成判定。演出、TTS、歌曲与向量服务分别装配。

## 文档

[接入与验收](docs/agent-mcp.md) · [SDK 与 skill](docs/minecraft-client.md) · [架构归属](docs/architecture.md) · [Harness 指标](docs/harness.md) · [0.3 迁移边界](docs/migration-0.3.md) · [构建部署](DEPLOYMENT.md)

## 独立构建与协议

核心源码在 `core/`，构建不抽取 Cortico 或打补丁。`node scripts/clean-check.mjs <新目录>` 可用离线依赖缓存验证完全没有 Cortico 源码和安装包的构建。默认入口、公开声明、SDK/MCP 和部署生命周期分别验证。

参阅 [迁移对照和能力基线](docs/framework-decoupling.md)、[agent-mc/v1 协议](docs/protocol-v1.md)、[原始离线验收](docs/decoupling-acceptance.md)、[0.4.0 发布和部署记录](docs/release-0.4.0.md)。
