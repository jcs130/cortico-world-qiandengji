# Agent MC World

基于 **Mineflayer 的独立 Minecraft Agent 客户端 / 具身执行 Harness**。Agent 可以连接配置的 Minecraft Java 服务器，观察现场、组合动作、编写方法并读取实际执行结果。配套 skill 教 Agent 使用这些能力；主模型、目标、记忆和学习评价由接入的 Agent 提供。

从 **v0.3.0-next.1** 起，包名为 `agent-mc-world`，默认 Cortico World ID 为 `mc`，工具为 `mc_*`。仓库暂沿用 [cortico-world-qiandengji](https://github.com/jcs130/cortico-world-qiandengji)，便于保留发布历史。**千灯纪是服务器玩法集成，已移到 `integrations/qiandengji/`，不随通用发行包安装。** 默认客户端不加账号前缀、不改写传送命令，也不假定公会、试炼、法术或服务器权限。

## 接入入口

| 方式 | 入口 | Agent 提供 |
| --- | --- | --- |
| MCP stdio | `minecraft-agent-mcp <私有配置.json>` | 支持工具调用与持续消费事件的宿主 |
| TypeScript SDK | `agent-mc-world/client` | 模型、记忆、事件唤醒与学习评价 |
| Cortico API 5 World | 默认导出 / `agent-mc-world/adapters/cortico` | Cortico Core 与 Persona |
| 可复制的 Agent skill | `skills/minecraft-agent/` | 同一台机器或可访问的客户端入口 |

安装 [Releases](https://github.com/jcs130/cortico-world-qiandengji/releases) 中的 `.tgz`，按 SHA256SUMS 核对。推荐 Node.js 24；无需安装 Cortico 即可使用 MCP/SDK，包括 SDK 类型。当前版本是试用版，不自动迁移已有可米部署。

```text
npm install --ignore-scripts <agent-mc-world 安装包的绝对路径>
node node_modules/agent-mc-world/examples/agent-mcp-check.mjs
```

离线检查不会连接游戏。复制 `examples/minecraft-agent.json` 为私有配置，填写服务器、账号与协议版本，再设置 MCP 进程：

```text
node <绝对安装目录>/node_modules/agent-mc-world/bin/minecraft-agent-mcp.mjs <私有配置的绝对路径>
```

调用 `mc_connection {"action":"connect"}` 后读取连接事件确认登录。**每个 Agent 使用自己的账号、数据目录和非零画面端口**。当前连接仅支持 offline 身份；Microsoft/online-mode 认证尚未实现。不是所有版本、模组服与插件都已验证。内置网页素材匹配 Java 1.20.6；其他版本需验证协议和画面素材。

## 可用能力

- 原生观察与操作：位置、背包、实体、区块、局部体素、碰撞射线、导航、挖放、物品交互、方向键与视角。用 `mc_help` 和 `mc_script {"api":"index"}` 按需发现实际接口。
- 持续执行：已有任务可在 Agent 思考时继续，队列与脚本共用身体控制权、取消清理和真实终态。受理、执行结束、世界生效与目标完成分别核验。
- 自主学习的执行基础：原生 Mineflayer 脚本、版本化方法制品、组合执行、哈希、调用轨迹。Agent 自己提出改法、验证、评价、检索与复用；保存源码不代表学会。
- 空间读数：轨道端口与高度连通检查、体素切片和碰撞射线。无效路径不会被自动解释为深沟、断梯或不可达。
- 现代画面与 OBS：第一人称、第三人称、2.5D、透明 HUD 与只读技术指标，来自独立 [mc-visual-console](https://github.com/jcs130/mc-visual-console) 的固定版本。
- 系统 1：通用生存/战斗反射、可选受阻建议与小动作。旧版异步快战术仍依赖 RPG 能力协议，尚未向通用入口开放；不会伪称已具备。

服务器特有技能应从该服务器的帮助、目录和实际回执学习。服务器说明属于可选资料，不能自动替 Agent 做传送、强制补给或完成判定。演出、TTS、歌曲与向量服务分别装配。

## 文档

[接入与验收](docs/agent-mcp.md) · [SDK 与 skill](docs/minecraft-client.md) · [架构归属](docs/architecture.md) · [Harness 指标](docs/harness.md) · [0.3 迁移边界](docs/migration-0.3.md) · [构建部署](DEPLOYMENT.md)
