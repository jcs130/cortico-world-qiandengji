<!-- Owner: src/mcp/stdio.ts, src/mcp/config.ts, src/mcp/server.ts, src/agent/runtime.ts, src/agent/connection-lease.ts, bin/qiandengji-mcp.mjs, examples/agent-mcp.json -->

# 让其他 Agent 接入 Minecraft

支持 MCP stdio 的 Agent 客户端可以启动 `qiandengji-mcp`，直接使用本包的游戏工具。该入口使用独立游戏账号，不启动 Cortico Persona 或语音服务。当前入口为本地 stdio；未提供远程 HTTP 多租户服务。

## 配置

将 `examples/agent-mcp.json` 复制到自己的私有目录，填写服务器地址、端口与分配的账号。`username: "Alice"` 默认登录为 `ag_Alice`；迁移已有角色时才使用 `preserveLoginName`。

```json
{
  "dataDir": "./private-agent-data",
  "timezone": "Asia/Shanghai",
  "acceptsImages": true,
  "world": {
    "host": "example.test",
    "port": 25565,
    "username": "Alice",
    "viewerPort": 18080
  }
}
```

`dataDir` 相对配置文件所在目录解析，保存该实例的地图、目标、战术、执行日志和附件。不同 Agent 使用不同账号、目录与画面端口；目录连接锁阻止两个进程同时操作同一份游戏状态。`viewerPort: 0` 关闭网页画面，也是独立入口的默认值。`acceptsImages` 由接入方按模型实际能力填写，缺省不发送图片。

服务端有密码保护时，使用 World 已支持的私有 `world.loginConfigFile`，格式和生成方式见 `client-login/README.md`。服务器准入与角色权限仍由服务器管理。

在 MCP 客户端中配置以下进程，路径替换为实际安装位置：

```json
{
  "mcpServers": {
    "qiandengji": {
      "command": "node",
      "args": [
        "D:/agents/cortico-world-qiandengji/bin/qiandengji-mcp.mjs",
        "D:/agents/private/alice.json"
      ]
    }
  }
}
```

Node.js 需要符合包的 `engines` 要求，依赖安装包含生产依赖。工作区开发可用 `pnpm start:mcp <配置文件>`。日志写入 stderr，stdout 专供 MCP 协议。

## 调用顺序

1. 发现工具与读取 `mymc_connection {"action":"environment"}`，不连接游戏。
2. 调用 `mymc_connection {"action":"connect"}` 启动引擎。
3. 读取 `mymc_connection {"action":"status"}` 和 `mymc_events`，核验连接、认证与现场状态。`phase: "started"` 只表示引擎启动完成。
4. 用 `mymc_guide` 按需读取指南，使用 `mymc_scout`、`mymc_bag` 等观察工具，提交 `mymc_do` 或 `mymc_script`。
5. 受理长期动作后读取 `mymc_events`，使用返回的 `run` 与 `nextCursor` 继续翻页；需要等待时指定至多 30000 毫秒的 `waitMs`。
6. 结合终态与新的世界观察评估结果，再选择下一步。关闭连接用 `mymc_connection {"action":"disconnect"}`；客户端退出也会清理自己的游戏运行时。

事件包含时间、来源、类型、游标和发言人键，正文保留服务器消息。`gap: true` 表示近期缓冲区之前的事件未返回；原始事件仍存入 `dataDir/events-<run>.jsonl`。缓冲区最多保留 1024 条，单页最多 256 条。进程重启会更换 `run`，旧游标必须重新从 0 读取。`includeArchived` 才会包含明确标记为仅归档的事件。

此接口不保证 MCP 客户端会自动唤醒模型。接入 Agent 需要实现事件消费与持续运行；工具发现、事件存储或通知数量都不能证明正文已进入模型上下文。

stdio 入口未提供宿主后台认知端口；需要宿主代想的功能会报告能力不可用。接入 Agent 可以自己设计并提交方案，直接使用运行时 API 的宿主也可显式实现可选 `cognition` 端口。

## 脚本、方法与快战术

- 原生接口：`mymc_script {"api":"index"}`，继续按需查询所用方法；直接使用已有 Mineflayer 接口和组合方法。
- 执行附件：工具结果的图片直接作为 MCP 图片返回，其他制品带 `mymc-artifact://<hash>` 资源链接。可用 `mymc_artifact {"action":"get","handle":"log:<hash>"}` 读取正文。
- 复合方法：先用 `mymc_artifact {"action":"put","text":"..."}` 提交已有版本格式的制品，再将句柄和版本传给 `mymc_script`。依赖制品也需明确提交；源码、版本与执行记录由接入 Agent 管理。
- 快战术：`mymc_combat_tactic` 使用现有战场、程序、决策记录入口。通过私有配置的 `world.combatDecision` 接入符合现有 `state/questions` 契约的选择服务。它直接取得游戏读数，不串行等待主 Agent；魔力、队友与冷却未知时保持未知。
- 长期记忆：由接入 Agent 自己选择本地库或 PowerContext；本入口不复制可米的记忆、口吻或目标。

MCP 传输与内容类型使用官方 SDK，协议说明见 [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server)。
