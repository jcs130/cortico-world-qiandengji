# 千灯纪适配与资料包

`agent-mc-qiandengji` 是可选服务器扩展，不是 World 插件。它依赖中立 `agent-mc-world` 核心，不依赖或加载 Cortico。DSH 和其他宿主可以显式创建 `MymcAgentRuntime`，人格、目标、主模型和长期记忆仍由自己的宿主管理。

默认导出具名端口：`MymcAgentRuntime`、`MymcWorld`、配置与校验、资料目录、`QIANDENGJI_PACK`。`/host-decisions` 提供显式宿主快决策服务。启用前配置服务地址；不配置时没有额外模型请求。

原文资料在 `dist/guides/`，协议与动作校验在 `dist/engine/`。`/manifest` 声明资料包版本与能力。资料用于按需查询，实时库存、魔力、保护和任务结果以本人连接的回执为准。

构建来源为本仓库独立维护的 `integrations/qiandengji/`。Cortico 专用注册入口和控制台客户端不进入本包；历史许可证和来源说明保留。
