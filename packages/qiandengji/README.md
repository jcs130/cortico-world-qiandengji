# 千灯纪适配与资料包

rc.26 候选由宿主提供共享核心 rc.90 或兼容版本，通过 peerDependencies 声明此契约；服务器包不再自行安装另一份核心。宿主应显式依赖一个满足范围的 agent-mc-world，默认 pnpm 的新包年龄筛选或后续核心发布不会让服务器包和宿主使用不同的游戏实现。游戏登录机制由核心实现，服务端确认后才放行操作；本包的可选网站接入模块保存独立的私有身份，不复制游戏认证状态机。可选 MineDojo 资料索引默认路径为空，不自动下载或启用。

`agent-mc-qiandengji` 是可选服务器扩展，不是 World 插件。它依赖中立 `agent-mc-world` 核心，不依赖或加载 Cortico。DSH 和其他宿主可以显式创建 `MymcAgentRuntime`，人格、目标、主模型和长期记忆仍由自己的宿主管理。

默认导出具名端口：`MymcAgentRuntime`、`MymcWorld`、配置与校验、资料目录、`QIANDENGJI_PACK`。`/host-decisions` 提供显式宿主快决策服务。启用前配置服务地址；不配置时没有额外模型请求。

`agent-mc-qiandengji/portal` 导出 `QiandengjiPortalAccess`，供 SDK、MCP 宿主及其他框架复用[官方网站接入](https://mc.kangqiang.site/agent-api.html)。显式传入本机私有目录，使用 `prepare` 准备邀请身份、`status` 查询原请求；`connectionSettings` 再次核对 `ready` 与建号成功后才返回连接参数和私有密码字段指针。`state` 只读本地状态，不产生网络或模型请求。已有网站身份使用 `importIdentity` 续用；普通游戏角色保持原连接，不用邀请重建。此模块不自动连接游戏，不提供后台轮询或额外模型循环。

普通 `goto` 默认保持步行。确认服务器支持并需要自动改道时，显式配置 `serverTravel.enabled: true`，才会在匹配目的地前加入服务器传送。Agent 主动请求的传送命令不受此开关限制。升级后不再把附近取物自动改成传送。

原文资料在 `dist/guides/`，协议与动作校验在 `dist/engine/`。`/manifest` 声明资料包版本与能力。资料用于按需查询，实时库存、魔力、保护和任务结果以本人连接的回执为准。

构建来源为本仓库独立维护的 `integrations/qiandengji/`。Cortico 专用注册入口和控制台客户端不进入本包；历史许可证和来源说明保留。

`agent-mc-qiandengji/presentation` 是可独立使用的被动观战端口，唯一输入是调用方已拥有的 Mineflayer bot。自动模式先核验本连接直接收到的 `MC_GUIDE` 身份、会话和时间，再注册千灯纪状态通道；普通服务器不注册这些通道。它只投影本人生命、技能和魔力，离线、死亡、换身份或过期即清除；不登录、不发送游戏命令、不创建模型回路或第二条游戏连接。服务器专用解析只维护在本资料包，通用核心仅装配显式的本地端口。发布者也可按提交与 SHA256 把此无依赖文件作为静态扩展资料交付，不必安装任何宿主适配器。
