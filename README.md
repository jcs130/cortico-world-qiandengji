# 联机版我的世界 / 千灯纪资料包

本仓库维护 Cortico API 5 World 和可选千灯纪服务器扩展。通用 Minecraft 核心的唯一源码位于 [minecraft-ai-friend/packages/agent-mc-world](https://github.com/jcs130/minecraft-ai-friend/tree/main/packages/agent-mc-world)。

## 包与依赖

| 包 | 职责 | 核心引用 |
| --- | --- | --- |
| `agent-mc-world` | 身体、SDK/MCP、动作执行、背包同步、战场/战术程序、事实/回执、可视化接入 | 在 MC AI Friend 主项目维护 |
| `agent-mc-qiandengji` | 千灯纪协议、技能与魔力报文解析、服务器物品用法和玩法资料 | `agent-mc-world@0.4.0` |
| `cortico-world-qiandengji` | 唯一公开 Cortico World，显示“联机版我的世界” | 核心 + 可选服务器资料包 |
| `dsh-minecraft-agent` | DSH 宿主适配器，独立仓库 | 同一个核心包 |

核心不依赖这些宿主或资料包。通用可视化仍由 `jcs130/mc-visual-console` 维护。
Cortico 内置示例世界保持独立，不在这里修改。

### 可选真实 Java 客户端身体

`worlds.mymc.provider: "java-client"` 使用核心的真实客户端桥；原主会话、人格和模型不变，也不会启动 Mineflayer 或额外模型循环。配置 `javaClient` 的实际 UUID、服务器、私有连接文件、账本目录、控制器 ID 和租期。SDK 的 `MymcAgentRuntime` 与 API 5 World 使用同一身体。只有明确启用 `javaHostControl.enabled` 才由宿主接管并续租；控制丢失后停下，不能自动重新夺取控制权。

操作以 `mymc_operations` 为准。`mymc_do` 保留旧工具名，兼容单步 chat、control、look、快捷栏主手 equip、已持有食物 eat 和无参数 use，转换后保持原动作 ID、屏障与真实回执。暂不支持旧多步依赖、寻路、采矿、合成或 Mineflayer 脚本；不把命令换名冒充这些能力已迁移。默认保留队列，显式 append/now 可用。原记忆本和服务器消息继续查询；旧目标、公会和试炼资料通过 `mymc_history` 读取，不自动重放。

真实画面来自同一身体的帧缓冲。显式指定 `javaClient.viewerPageFile`（mc-visual-console 的 native-client 页面）和 `viewerPort` 才开启本机只读网页。未配置不扫描端点。旧部署的 Mineflayer 环境提示词覆盖需先备份，再换成 `ENV_PROMPT_JAVA.md`；不要混用两种身体的执行说明。

通用战场、战术程序、候选验证、能力状态、战斗回执与可选快决策服务已归入核心。
普通 Minecraft 接入可直接使用，无需开启千灯纪资料包。
本仓库 `engine/combat-*` 与 `host/*` 的历史入口仅转出核心公开接口；
千灯纪技能名、指令格式、试炼与自定义报文仍由显式服务器包适配。
详见核心的 [组件边界](https://github.com/jcs130/minecraft-ai-friend/blob/main/packages/agent-mc-world/docs/component-boundaries.md)。

## 构建本地候选

当前 0.4.0 尚未发布到 npm。先在 MC AI Friend 的核心包目录完成构建并打包，将
`agent-mc-world-0.4.0.tgz` 放入本仓库忽略的 `vendor/` 目录；开发锁文件校验该安装包。
公开子包依赖仍使用版本号，发布后消费者正常安装 npm 包，无需克隆主项目或本仓库。
根工作区只安装开发入口，`vec3` 覆盖与锁文件保持一致；公开子包在构建和打包阶段单独处理。

```sh
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
pnpm test
cd packages/qiandengji && npm pack
# Cortico World 的发行目录为 integrations/qiandengji；仓库根目录 private，不发布。
```

不要在现役部署目录构建；使用独立源码副本。构建只编译服务器扩展和宿主适配器，不复制、抽取或修补核心源码。
`adapters/cortico` 是私有的通用装配示例，不额外发布第二个 World。

## 连接与服务器能力

安装不会自动连接服务器。通用模式默认 `serverPack: none`；千灯纪需显式选择 `qiandengji`。
模型地址、快决策及演出端点均由宿主显式配置。服务器自动传送默认关闭；普通 `goto` 保留行走语义。
密码按服务器和账号作用域保存于本机私有配置。

历史使用文档在 `docs/`；其中迁移前目录描述以 [核心迁移说明](docs/core-repository-move.md) 为准。
MIT 许可和上游来源保留；核心来源记录随核心迁入主项目，Git 历史仍可追溯。
