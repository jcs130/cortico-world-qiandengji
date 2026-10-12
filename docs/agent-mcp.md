<!-- Owner: src/mcp/stdio.ts, src/mcp/config.ts, src/mcp/server.ts, src/agent/runtime.ts, src/agent/connection-lease.ts, bin/qiandengji-mcp.mjs, examples/agent-mcp.json, examples/agent-mcp-check.mjs, engine/server-login.mjs -->

# 让其他 Agent 接入 Minecraft

支持 MCP stdio 的 Agent 客户端可以启动 `qiandengji-mcp`，直接使用本包的游戏工具。该入口使用独立游戏账号，不启动 Cortico Persona 或语音服务。当前入口为本地 stdio；未提供远程 HTTP 多租户服务。

## 1. 安装试用版

本指南对应 **v0.2.0-next.1**。旧的 v0.1.2 安装包没有独立 MCP 入口，不要用旧包验证本指南。

准备 Node.js 24 和支持 MCP stdio 的 Agent 客户端。Minecraft 服务端应允许该机器访问，并为测试者分配独立账号及必要权限；包内画面素材匹配 Java 1.20.6。无需安装 Cortico 或完整 Java 游戏客户端来运行 Mineflayer Agent。

在一个新的安装目录执行：

```powershell
mkdir D:/agents/qiandengji
cd D:/agents/qiandengji
npm init -y
npm install --save-exact https://github.com/jcs130/cortico-world-qiandengji/releases/download/v0.2.0-next.1/cortico-world-qiandengji-0.2.0-next.1.tgz
node node_modules/cortico-world-qiandengji/examples/agent-mcp-check.mjs
```

最后一条命令只检查已安装的 MCP 协议、工具发现和环境资源，**不连接游戏**。本版预期输出 `ok: true`、`version: "0.2.0-next.1"`、`toolCount: 25`、`phase: "disconnected"`。下载页同时提供 `SHA256SUMS.txt`；Windows 可用 `Get-FileHash <安装包路径> -Algorithm SHA256` 比对，其他系统可用 `sha256sum`。

其他系统将安装目录换成本机路径。源码开发者需要按仓库 README 的固定来源完成构建；直接 `git clone` 后只有源码，不能跳过生成引擎和画面这一步。试用安装包已经包含这些产物。

## 2. 配置账号与 MCP 客户端

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
    "version": "1.20.6",
    "viewerPort": 18080
  }
}
```

`dataDir` 相对配置文件所在目录解析，保存该实例的地图、目标、战术、执行日志和附件。不同 Agent 使用不同账号、目录与画面端口；目录连接锁阻止两个进程同时操作同一份游戏状态。`viewerPort: 0` 关闭网页画面，也是独立入口的默认值。`acceptsImages` 由接入方按模型实际能力填写，缺省不发送图片。

服务器地址由管理员提供；局域网地址只能在可达的局域网或已配置的网络中使用。新账号名称不带前缀的部分最多 13 位，只能用英文字母、数字和下划线。不要复用正在运行的可米或其他 Agent 的账号。

服务端有密码保护时，使用下文的私有 `world.loginConfigFile`。服务器准入与角色权限仍由服务器管理。

在 MCP 客户端中配置以下进程，路径替换为实际安装位置：

```json
{
  "mcpServers": {
    "qiandengji": {
      "command": "node",
      "args": [
        "D:/agents/qiandengji/node_modules/cortico-world-qiandengji/bin/qiandengji-mcp.mjs",
        "D:/agents/private/alice.json"
      ]
    }
  }
}
```

Node.js 需要符合包的 `engines` 要求，依赖安装包含生产依赖。工作区开发可用 `pnpm start:mcp <配置文件>`。日志写入 stderr，stdout 专供 MCP 协议。

上面的 `mcpServers` 是通用进程配置示例；具体客户端可能使用不同的配置文件或字段。将同一条 `node` 命令和两个绝对路径填入它的 stdio MCP 服务设置即可。客户端找不到 `node` 时，将 `command` 改为本机 Node.js 可执行文件的绝对路径。

### Windows 密码自动登录

当前内置凭据读取使用 Windows 当前用户 DPAPI。MCP 进程必须由创建凭据的同一 Windows 用户运行；其他系统尚未提供内置凭据适配器。不要把密码放进 MCP 参数、Agent 提示词或公开仓库。

在私有目录中，用 **Windows PowerShell 5.1** 交互创建原始 DPAPI 字节文件：

```powershell
Add-Type -AssemblyName System.Security
$credentialPath = 'D:/agents/private/alice-login.dpapi'
$securePassword = Read-Host '服务器为该账号分配的密码' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$passwordBytes = $null
try {
  $passwordBytes = [Text.Encoding]::UTF8.GetBytes([Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer))
  $encryptedBytes = [Security.Cryptography.ProtectedData]::Protect($passwordBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($credentialPath, $encryptedBytes)
} finally {
  if ($passwordBytes) { [Array]::Clear($passwordBytes, 0, $passwordBytes.Length) }
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  $securePassword.Dispose()
}
```

先创建 `D:/agents/private`。这里需要二进制 DPAPI 文件，`ConvertFrom-SecureString` 的文本输出不适用于此读取器。

将下列内容保存为私有 `D:/agents/private/login.json`，并在 `alice.json` 的 `world` 内添加 `"loginConfigFile": "./login.json"`：

```json
{
  "enabled": true,
  "accounts": [{
    "server": "example.test:25565",
    "username": "ag_Alice",
    "credentialFile": "D:/agents/private/alice-login.dpapi",
    "command": "login",
    "requestMarkers": ["AUTH_LOGIN"],
    "successMarkers": ["AUTH_SUCCESS"],
    "failureMarkers": ["AUTH_FAILED", "AUTH_2FA"]
  }]
}
```

`server`、实际进服名及消息前缀必须与管理员提供的协议相符；这些 `AUTH_*` 是占位示例，不会自动适配其他登录插件。只匹配系统消息开头或方括号前缀，普通聊天不会触发密码提交。`submitted` 只说明发出登录命令，`confirmed` 才是服务端认证成功。错误密码、两步验证或凭据不可读时停止认证重试，订正配置后再显式重连。网络重连与密码认证分别核验。原生 eye 客户端是可选项，另见[客户端登录组件](../client-login/README.md)。

## 3. 首次调用与验收

1. 发现工具与读取 `mymc_connection {"action":"environment"}`，不连接游戏。
2. 调用 `mymc_connection {"action":"connect"}` 启动引擎。
3. 读取 `mymc_connection {"action":"status"}` 和 `mymc_events`，核验连接、认证与现场状态。`phase: "started"` 只表示引擎启动完成。
4. 用 `mymc_guide` 按需读取指南，使用 `mymc_scout`、`mymc_bag` 等观察工具，提交 `mymc_do` 或 `mymc_script`。
5. 受理长期动作后读取 `mymc_events`，使用返回的 `run` 与 `nextCursor` 继续翻页；需要等待时指定至多 30000 毫秒的 `waitMs`。
6. 结合终态与新的世界观察评估结果，再选择下一步。关闭连接用 `mymc_connection {"action":"disconnect"}`；客户端退出也会清理自己的游戏运行时。

事件包含时间、来源、类型、游标和发言人键，正文保留服务器消息。`gap: true` 表示近期缓冲区之前的事件未返回；原始事件仍存入 `dataDir/events-<run>.jsonl`。缓冲区最多保留 1024 条，单页最多 256 条。进程重启会更换 `run`，旧游标必须重新从 0 读取。`includeArchived` 才会包含明确标记为仅归档的事件。

此接口不保证 MCP 客户端会自动唤醒模型。接入 Agent 需要实现事件消费与持续运行；工具发现、事件存储或通知数量都不能证明正文已进入模型上下文。

stdio 入口未提供宿主后台认知端口；需要宿主代想的功能会报告能力不可用。接入 Agent 可以自己设计并提交方案，直接使用运行时 API 的宿主也可显式实现可选 `cognition` 端口。

### 给接入 Agent 的运行说明

可以把以下内容交给负责游戏的 Agent，游戏目标由测试者另行填写：

```text
你通过千灯纪 MCP 工具操作自己的 Minecraft 角色。
先读取 mymc_connection(action=environment)，再显式 connect。
启动受理后用 status、mymc_events 和新的现场读数确认进服与认证。
先读 mymc_guide 主题索引，具体工具用 mymc_help，原生接口用 mymc_script(api=index) 按需发现。
工具返回“受理”后，身体动作仍可能在运行；持续消费事件，保留 run 和 nextCursor。
已在执行的有价值任务继续运行；需要操作时按当前控制权与取消契约处理。
通过终态及位置、方块、库存等实际变化判断目标是否达成。
所有脚本 SDK 调用返回 Promise；用 await 或 Promise.all 后再读取结果字段。
失败后核对前提、查接口和实际回执，再修订方法；未知的血量、队友、冷却等保持未知。
你管理自己的目标、记忆、学习方法与唤醒，不把日志保存或程序结束当作学会。
```

| 验收项 | 应保留的证据 |
| --- | --- |
| 安装与协议 | 离线检查的版本、工具数量、环境资源读取结果 |
| 连接与认证 | status、系统认证成功消息、带采样时间的当前位置和库存 |
| 观察与小动作 | 管理员允许区域内的一次观察、简单移动的任务编号、终态及前后位置 |
| 持续运行 | 同一任务运行期间能消费聊天、伤害和完成事件，游标与 run 正确推进 |
| 可选学习 | Agent 自己编写或修订的方法、源码版本、执行回执、世界结果及下次复用 |

目前维护者验证了生产依赖安装、25 项工具发现及不依赖 Cortico 运行时；新的外部 Agent 在目标服务器的认证、移动、持续自主游戏仍需接入者实测。反馈时附包版本、操作时间、脱敏的 MCP stderr、`tools.jsonl` 对应任务与事件游标，勿附凭据。

## 4. 脚本、方法与快战术

- 原生接口：`mymc_script {"api":"index"}`，继续按需查询所用方法；直接使用已有 Mineflayer 接口和组合方法。
- 执行附件：工具结果的图片直接作为 MCP 图片返回，其他制品带 `mymc-artifact://<hash>` 资源链接。可用 `mymc_artifact {"action":"get","handle":"log:<hash>"}` 读取正文。
- 复合方法：先用 `mymc_artifact {"action":"put","text":"..."}` 提交已有版本格式的制品，再将句柄和版本传给 `mymc_script`。依赖制品也需明确提交；源码、版本与执行记录由接入 Agent 管理。
- 快战术：`mymc_combat_tactic` 使用现有战场、程序、决策记录入口。通过私有配置的 `world.combatDecision` 接入符合现有 `state/questions` 契约的选择服务。它直接取得游戏读数，不串行等待主 Agent；魔力、队友与冷却未知时保持未知。
- 长期记忆：由接入 Agent 自己选择本地库或 PowerContext；本入口不复制可米的记忆、口吻或目标。

MCP 传输与内容类型使用官方 SDK，协议说明见 [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server)。

## 常见问题

| 现象 | 检查方式 |
| --- | --- |
| 找不到 MCP 入口或生成引擎 | 确认安装的是 v0.2.0-next.1 的 `.tgz`，不是 v0.1.2 或未构建的 Git 源码 |
| 服务列出工具，但角色不进服 | 工具发现不连接游戏；显式调用 `mymc_connection {"action":"connect"}`，再检查网络、账号和认证 |
| `phase: "started"` 但游戏工具没有现场数据 | 该字段表示引擎启动；等待连接、首次出生及认证事件，不据此认定已进服 |
| 账号被挤下线或连接锁冲突 | 每个 Agent 用独立账号、`dataDir` 和非零画面端口；先退出重复实例 |
| 画面打不开 | `viewerPort: 0` 会关闭画面；非零时在运行 MCP 的机器访问 `http://127.0.0.1:<端口>/`，远程访问另配网络 |
| 有工具但 Agent 不会持续行动 | 客户端需要事件消费与模型唤醒循环；MCP 本身不替代 Agent 的决策和记忆 |
| 自动密码登录失败 | 核对同机同用户 DPAPI、账号完整前缀、服务器地址、系统消息标记和 `confirmed` 终态 |
| 快战术没有模型建议 | 默认未启用；需接入 `state/questions → answers` 服务，不能把 OpenAI 聊天补全 URL 直接填进去 |
