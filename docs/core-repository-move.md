# Minecraft 核心源码归属迁移（2026-10-13）

| 能力/目录 | 迁移后维护位置 | 消费方式 |
| --- | --- | --- |
| core、client、contracts、runtime、MCP | minecraft-ai-friend/packages/agent-mc-world | agent-mc-world 公共 SDK/MCP/extension |
| 库存同步、导航/动作校验、方法/取消 | 同一核心包 | 原执行器，保持协议与数据格式 |
| 工具屏障、真实回合、任务编号/终态、事实/归档、防重/修订 | 同一核心包 | agent-mc/v1；受理不等于完成 |
| 登录、现代可视化接入、用量呈现端口 | 同一核心包 | 端点显式配置；viewer 源码另归 mc-visual-console |
| 千灯纪技能/法力/大背包/保护/玩法指南 | 本仓库 integrations/qiandengji | agent-mc-qiandengji 可选包 |
| 快决策模型驱动 | 千灯纪包的 host 端口，由宿主调用 | 显式 endpoint/model；核心无额外推理循环 |
| Cortico World 装配/UI | 本仓库 | cortico-world-qiandengji，API 5 |
| DSH 人格/模型/会话/目标/记忆 | dsh-minecraft-agent 与原生 DSH | 同一个 agent-mc-world 安装包 |
| 上游许可证、一次性导入与类型来源哈希 | 核心 provenance / vendor/native-types | 原记录保留，新增仓库迁移记录 |

原始基线：cortico-world-qiandengji@54fd7b2。源码移动不是全局改名。
包名 agent-mc-world、agent-mc/v1、工具名、默认关闭连接和旧数据迁移入口保持。
扩展以公共 MinecraftBot 类型接入，避免依赖方与核心复制的原生声明形成两套不兼容类型。

核心测试在核心包维护；服务器/宿主测试在本仓库维护。测试使用打包安装的核心，
不通过相邻源码别名、符号链接或重写核心实现获得通过。

本次不调整现役模型、会话、角色、密码、游戏目标、记忆或账本；不重启服务。
源码与离线验收不代表迁移后的包已部署或获得新的实际游玩证据。

## 本次离线验收

- 从暂存 Git 树导出独立核心目录；无 Cortico 安装/源码，离线安装锁定依赖，显式准备 viewer 制品后构建成功。
- 核心 42 组 / 284 项测试通过，含 SDK/MCP/子进程边界、取消等待、停止不复活、真实回合、目标修订及禁止隐式网络。
- 核心与扩展类型检查通过；公开声明在 Bundler、NodeNext 两种模式通过。
- 外部目录安装核心包后，服务器/宿主 28 组 / 196 项测试通过，API 5 包文件检查通过。
- DSH 12 项现有原生宿主、回执、取消与模型请求格式测试通过。
- 三个消费者的实际安装包解析到同一个核心安装位置。禁止网络和 Cortico 运行时导入时，DSH 禁用加载、Cortico 默认通用世界和 SDK/MCP 发现通过。
- 外部消费者依赖准备阶段补下载了缓存缺失的第三方依赖；运行检查在禁网钩子下完成。不能将其描述为所有依赖均首次离线安装。
- 未进行本次制品的真实服务器游玩验证，未重载现役服务，未发布 npm。
