# 独立核心迁移与验收（0.4.0-next.1）

> 以下是最初迁移阶段的能力对照与审计基线。后续更新、发布和获授权的实服观察见 [0.4.0 发行记录](release-0.4.0.md)。

本次修改在独立仓库完成。`jcs130/Cortico` 的 Minecraft 示例只作为能力基线，其源码没有改动。没有启动现役服务、连接真实 Minecraft 服务器或实际游玩。

## 基线与发行包差异

核对时间：2026-10-13。完整文件差异、制品 SHA256 和提交列表见 [来源审计](../provenance/source-audit-20261013.json)。

| 对象 | 核对结果 |
| --- | --- |
| 独立 World 远程 main | `084234b24f816562d6493da9d57fe9f11b0a7874` |
| 用户修改的 Cortico 能力基线 | `jcs130/Cortico@8c00fbb022ea82fc9725301fde0437ccc00fdcc9`，包版本 0.1.8 |
| 公共 Cortico npm 包 | 0.1.12，不能凭版本号替换用户 fork 的能力基线 |
| 独立仓库最近原有标签 | `v0.3.0-next.2`；main 此后还有 5 个提交，包括目标结案、CLI 0.4.31 和 viewer 更新 |
| npm `cortico-world-qiandengji` | 0.1.2；默认入口仍是 Cortico World，构建脚本抽取框架源码 |
| npm `agent-mc-world` | 审计时未发布，registry 返回 404 |
| 0.1.2 引擎 vs 本次迁入基线 | 164 vs 195 个文件；51 个变化，31 个新增，无删除 |
| 一次性迁入 | 固定 fork 加 35 个补丁，包含工作区原有蓝图轨道审查改动；此后直接维护 `core/` |
| 可视化 | Java 1.20.6 通用制品，来自共享 viewer `8536b285…`；旧 0.1.2 使用 `0deacf36…` 的千灯纪预设 |

`provenance/import-20261013.json`、`import-files.json` 保存补丁来源和逐文件原始哈希。旧构建器保存为不可运行的 `.txt` 史料。日常构建不读取这些构建器、补丁、Cortico 源码、Git checkout 或旧 `engine/`。

## 代码边界

```text
宿主（人格、目标决策、模型、记忆、调度）
  ├─ SDK / MCP / 可选 Cortico API 5 适配器
  │    └─ contracts → 独立 core → Mineflayer / 同一 bot 的 viewer
  └─ 可选宿主决策辅助器（显式配置和驱动）

千灯纪扩展 → contracts + core 扩展接口
演出桥 → 显式端点 + bot 身份；viewer 只持有 relay 接口
```

| 层 | 维护位置 | 责任 |
| --- | --- | --- |
| 中立协议与类型 | `src/contracts/` | `agent-mc/v1`、事件、工具控制、执行回执、事实、归档、上下文预算 |
| 游戏核心 | `core/` | 连接、库存、导航、动作与几何校验、身体队列、方法执行、游戏事实；独立源码 |
| 客户端宿主端口 | `src/client/` | 显式连接、回合、屏障、取消、请求账本、事实原文、SDK |
| MCP | `src/mcp/` | 官方 MCP SDK；完整传递控制字段和回执 |
| Cortico 适配器 | `src/adapters/minecraft.ts`、`adapters/cortico/` | API 5 命名和配置装配；核心不导入 Cortico |
| 宿主可选决策辅助器 | `adapters/host-decisions/` | 旧受阻建议、快战术和模型小动作；没有被核心导入或自动启动 |
| 千灯纪扩展 | `integrations/qiandengji/` | `/mycli`、魔力/技能、保护频道、公会/试炼、服务器战术、YSM/观战频道和规则；默认发行包不带此扩展 |
| 通用演出桥 | 共享 `mc-visual-console` 的 `host/viewer-performance-relay.mjs` | 本仓库随包副本在 `bridges/performance/`，哈希记录在 `provenance/performance-bridge.json` |

默认 `agent-mc-world` 导出中立 SDK，不再默认导出 `MC`。Cortico 通过 `agent-mc-world/adapters/cortico` 或专门的适配器包装配。N.E.K.O 等宿主可使用 SDK/MCP；核心没有反向导入这些宿主。

## 能力迁移对照

| 能力 | 新归属与语义 | 离线证据 |
| --- | --- | --- |
| 库存、窗口、手持同步与物品名称 | 核心 Mineflayer fixes、window、item-facts、装备与手持组件；保留服务端确认 | hand-equipment、equipment、item-display、crop-placement、storage-correction |
| 导航、保护拒绝、碰撞与动作校验 | 核心 executor、skills、pathfinder、precheck、空间预算；保护协议由服务器扩展提供端口 | action-contract、route-diagnostics、placement-miss-state、spatial-budget、flight-timing |
| 原生方法与组合方法 | 核心 method-* 与隔离 worker；保留依赖哈希、原始轨迹、执行终态 | method-*、procedure-*、method-await |
| 回执证据 | ToolOutcome 和 EventEnvelope 的 execution、events、blobs、控制字段经过 IPC/SDK/MCP | neutral-protocol、procedure-ipc、mcp |
| 当前事实分区 | 采样分区按 key 替换，内容寻址保存原文；不自动转成长期记忆 | neutral-protocol、agent-runtime、world |
| 请求去重 | 同 id 同参数共享结果；磁盘 pending 记录防止中断后自动重放未知动作 | neutral-protocol、request-ledger |
| 目标修订 | 宿主明确提交 revise，expectedRevision 防止覆盖新版本；保留目标身份与前后原文，新计划重新核验证据 | goal-revision、goal-metrics、goal-closure |
| 真实回合与工具屏障 | beginTurn/endTurn、acknowledgeBarrier；单个 RPC 返回不能结束回合 | neutral-protocol、proxy-lifecycle |
| 等待取消与停止 | AbortSignal 贯穿 SDK、MCP 与子进程；旧连接的迟到事件只归档，不能更新当前执行状态 | neutral-protocol、proxy-lifecycle、method-await |
| 法术、魔力、战术程序、公会/试炼 | 迁到千灯纪扩展，仍使用当前 bot；宿主通过 battlefield/choice 选择动作，扩展再次校验 | combat-*、battlefield、guild-progress、trial-*、world-cast |
| 图片观察与蓝图构思 | 核心返回截图、物理读数，校验宿主提交的蓝图；图片理解和设计模型由宿主调用 | optional-models、blueprint-railway、procedure-* |
| 可视化 | 同一动作 bot 的区块、实体、库存、原生窗口；没有自动创建第二个观测账号 | viewer-*；实际画面仍需以后进服验收 |
| 演出 | 未配置不导入、不扫描、不访问；配置后只访问指定 origin 并核对 sourceId | network-boundary；共享 relay 的 2 项 Node 测试 |
| 旧数据 | 显式复制到新目录、逐文件哈希，原目录保留；未知宿主数据归档 | migration；旧 procedure 格式兼容测试 |

## 宿主协议

协议详见 [agent-mc/v1](protocol-v1.md)。宿主必须消费事件与执行终态，再结合目标条件判断完成。`accepted`、`validated`、`completed` 都不把 `goalCompleted` 变成 true。

`mc_goal` 是宿主投影到当前连接的工作清单，核心不自行生成或采纳目标。长期版本与跨场次恢复由宿主负责。已有 `reopen` 判断撤回仍保留，新增 `revise` 可以替换实施计划并保存原因。

模型小动作、受阻建议和快战术调用已迁到宿主目录；通用配置不再暴露模型 endpoint。服务器扩展只读 `combatOptions` 中的实体预算、可执行移动与接敌策略。旧 `combatDecision` 的模型配置经迁移计划交给宿主，执行限制交给服务器扩展。

## 网络与演出配置

默认启动 MCP 只提供工具发现和本地数据访问，不登录游戏。不配置服务器扩展就不注册或解读千灯纪频道，不调用 `/mycli`；YSM 外观与观战频道接收器也已迁出核心，默认不注册或发包。不配置 `performanceBridge` 就不创建演出 relay。远程玩家头贴图下载默认关闭，需要时显式设置 `remoteTextures: true`。

演出配置示例：先在宿主中解析 `agent-mc-world/bridges/performance` 为本地 file URL，再设置 `world.performanceBridge = { module, endpoint }`。endpoint 是演出服务的明确 HTTP(S) origin。桥收到演出请求时才检查 `/identity`，sourceId 必须一致，不回退到其他端口。关闭 viewer 会撤销 relay 请求。

核心的显式联网能力仍包括游戏连接、授权、用户请求的 Java 资源准备、viewer 和可选贴图。离线验收禁止的是默认发现/导入时的隐含连接，以及未配置的模型、演出和服务器调用。

## 构建、升级与迁移

```text
node scripts/clean-check.mjs <全新的绝对目录>
```

复制自有源码、锁文件、已校验 viewer 制品；使用 `pnpm install --offline --frozen-lockfile --ignore-scripts`，检查没有 `.sources`、`engine` 和 Cortico 依赖，再构建、检查公开类型、运行离线测试。干净构建允许使用本机 pnpm 包缓存；不等于从空网络缓存安装依赖。

正常构建为 `node scripts/build.mjs` → `build-types.mjs` → `verify-build.mjs`。独立核心升级不再被 Cortico 示例源码覆盖；上游有价值的改动需要按功能审查并移植。同一 `agent-mc/v1` 内追加字段保持兼容，不兼容变更必须新协议版本并提供迁移。

`planLegacyConfiguration(input)` 只生成拆分方案，完整保留输入，不启动模型和连接。`copyLegacyData(oldDir,newDir)` 要求新目录不存在；所有文件保存在 `legacy-originals`，可识别执行账本/制品另外恢复至新目录，活进程租约不会恢复。宿主人格、凭据、目标记忆不会被游戏核心自动采用。旧 `cortico.procedure/v1` 原文与哈希保持不变，新制品使用 `agent-mc.procedure/v1`。

保留根 LICENSE、`core/LICENSE-Cortico.txt`、来源与补丁哈希。历史标识和旧数据格式按需兼容，没有以全局改名代替模块迁移。

## 验收结果的范围

最终构建与测试记录见 [验收记录](decoupling-acceptance.md)。源码完成、构建通过、离线验证、提交发布、部署加载与实际游玩必须分别记录。离线测试不能证明实服战斗、服务器插件格式或画面效果已经验证。
