# 其他 Agent 接入与首次验收

## 1. 安装

推荐 Node.js 24。新建独立目录，从 [GitHub Releases](https://github.com/jcs130/cortico-world-qiandengji/releases) 下载 v0.3.0-next.2 的 `agent-mc-world-*.tgz`，按 SHA256SUMS 核对，然后：

```text
npm install --ignore-scripts <安装包绝对路径>
node node_modules/agent-mc-world/examples/agent-mcp-check.mjs
```

检查预期为 `profile:minecraft`、`phase:disconnected`、`gameConnected:false`；它验证 MCP 工具、资源与指标协议，不登录或操作游戏。

## 2. 私有配置与 MCP

离线服复制 `examples/minecraft-agent.json`，正版服复制 `examples/minecraft-online.json`。填写 `world.host`、`port`、`username`、`auth`、`version`。`version: auto` 自动协商；Microsoft 模式的 username 是缓存标识，游戏名来自已验证 Java profile。每个 Agent 使用独立账号、数据目录和端口。插件密码认证是另一层，不等于正版认证。

```json
{
  "mcpServers": {
    "minecraft": {
      "command": "node",
      "args": [
        "D:/agents/mc/node_modules/agent-mc-world/bin/minecraft-agent-mcp.mjs",
        "D:/agents/mc/private-client.json"
      ]
    }
  }
}
```

stdout 保留给 MCP，诊断走 stderr。客户端不会自动连接；工具发现后调用 `mc_connection {"action":"connect"}`。受理启动与登录完成分别核验，从状态/事件检查认证和当前实体，不把“连接中”当作已进服。

配置 `consolePort: 7796` 后，**同一个 MCP 进程**提供 `http://127.0.0.1:7796/`。首次 Microsoft 登录在该连接台查看设备码并自行授权；不把授权码交给模型或直播。不要另开第二个进程连接同一账号。无需 MCP 的人工连接台可用 `minecraft-agent-client <私有配置.json>` 启动。见 [账号、缓存与启动器](online-accounts.md)。

密码不放进仓库或传给模型。`world.loginConfigFile` 指向宿主准备的私有登录配置；相对路径按私有配置所在目录解析。当前登录凭据实现使用 Windows DPAPI，跨平台凭据存储尚未验证。匹配可信系统消息，不从玩家聊天触发密码发送；没有适合的凭据实现时由宿主管理认证，不能自行假造配置格式。

## 3. 工具与事件

先读取 `mc://environment` 和工具 Schema，使用 `mc_help` 获取目标动作，使用 `mc_script {"api":"index"}` 查原生方法。不要假设服务器有法术、传送或领地指令；从实际帮助和回执学习。

`mc_do` 是持久任务队列。工具返回“受理”后持续消费 `mc_events`；返回的 `run`、`nextCursor` 要保留，下次带回。运行切换或历史缺口按回执处理，重读当前事实，不能沿用旧 run 的游标或把缺少事件当作成功。事件正文、说话人和时间需要实际送入模型。

精确空间问题用体素/碰撞读数；外观问题用支持图片的宿主接收 `mc_visual` 真图。每个原生脚本 SDK 调用返回 Promise，先 await 再读取结果。运行程序结束不证明目标完成，需核对相关脚格、高度、方块、库存或实体变化。

可组合方法以 `mc_artifact` 存放 UTF-8 制品，`mc_script` 按指定版本执行。方法库、搜索、评价、采用/回退由 Agent 自己维护；日志不会自动变成长期记忆。

## 4. 安全的首次验收

1. 使用自己的测试账号连接获准访问的服务器，核对原账号名、协议与登录终态。
2. 读取实际位置、维度、背包和附近实体，保留采样时间。
3. 在许可区域做一段短距离移动，比较提交动作、终态和实际脚格。
4. 编写一段只读原生脚本，await 读数并核对实际结果；再逐步验证可逆动作。
5. 从该服务器的帮助发现一种特有能力，保留目录、用法和真实回执，再考虑固化为可复用方法。

不使用可米现役账号，不为凑学习样本制造战斗或死亡。安装验收与真实游戏验收分别记录。

## 5. 画面与 OBS

设置 `world.viewerPort` 为实例独立端口，连接台列出实际画面入口；Java 1.20.6 现代画面提供 `/`、`/third/`、`/dungeon/` 和 OBS。素材版本不匹配时明确提示并使用基础画面，基础画面不具备现代 OBS/HUD 功能。YSM、自定义皮肤、粒子和观战依赖服务端实际数据，未收到时不能当作已加载。新版共享画面包含实际路径/操作标记与 OBS FOV 校准；公开解释需显式发布，不能冒称读取了模型思维。

指标端口默认关闭；启用 `metricsPort` 后只读 `http://127.0.0.1:<指标端口>/api/harness/metrics`。OBS 与统计页面配置见 [Harness](harness.md)。模型耗时、token 和缓存由宿主通过 `mc_trace` 上报，不由游戏工具猜测。
