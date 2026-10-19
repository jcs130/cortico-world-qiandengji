> 历史高级接入说明。安装入口和发行版本以 [简明说明](../integrations/qiandengji/README.md)、当前 package.json 与发布记录为准；下文旧版本号不代表当前默认配置。

# 联机版我的世界 · 千灯纪服务器 World

内置现代 Web 可视化，展示背包、任务、技能、魔力和服务端回执；通过千灯纪适配器支持服务器玩法与已验证的模组协议。包名仍为 `cortico-world-qiandengji`，原配置和 World ID `mymc` 保持兼容。

`server-guide.ts` 的 `cli` 主题保存人类提供的 Agent CLI 0.4.31 契约。环境入口只保留认证、目录、分页和结果未知的短说明，完整帮助按需读取；资料更新不代表服务器实测、主线毕业或能力已学会。

这里保存千灯纪账号规范、传送、公会/试炼、技能目录、服务器资料及旧 `mymc_*` World/MCP 装配。它们不属于默认 Agent MC World 产品，也不在通用发行包的 files 白名单中。

默认导出 `MYMC`，World ID 为 `mymc`，配置位于 `worlds.mymc`，工具前缀为 `mymc_`。在 Cortico 扩展页安装 `cortico-world-qiandengji`，或在扩展目录安装已发布版本，重启宿主加载。配置服务器地址与账号后再启用；安装不会自动连接服务器。此发布候选为 `0.4.1-dev.20261017.4`，面向 Cortico `>=0.2.2 <0.3.0`、World API 6，尚未发布。

独立核心 `agent-mc-world@^0.5.7-rc.7` 和可选服务器实现 `agent-mc-qiandengji@^0.5.0-dev.20261017.4` 是普通依赖；Cortico 由宿主提供。发行包包含编译后的浏览器界面与离线自描述，不依赖邻接源码目录。已有部署继续沿用 `mymc`、原账号、记忆和账本；升级前备份部署目录。默认 `serverPack:none` 是通用 Minecraft 接入，千灯纪资料包需显式开启。私有 API 5 兼容包不另行公开发布。

源码入口是 `cortico.ts` 的 `MYMC`、`runtime.ts` 的 `MymcAgentRuntime` 以及 `stdio.ts`；核心扩展端口为 `agent-mc-world/extension`。构建命令在仓库根执行 `pnpm build:extensions`。旧操作说明保存在 `LEGACY-README.md` / `LEGACY-DEPLOYMENT.md`，只用于兼容维护。

新 Agent 应从服务器帮助、目录和实际回执学习玩法，把适用条件与失败边界交给自己的方法库。这里的旧快捷传送、试炼前置检查等维护规则，不自动作为新通用 Agent 的学习成果。后续应把已观测协议与资料逐步替换为显式服务器能力适配，保持来源和版本，避免默认强制活动脚本。

服务器能力源码位于 `engine/`，通过显式本地 factory 传给核心。法术、魔力、试炼、随身容器规则和保护频道均由可选资料包维护。快战术的模型选择由宿主维护；这里提供 battlefield/choice 和再次校验。`combatOptions` 只含可执行策略，不包含模型 endpoint。演出端点需显式配置。锁定的共享可视化资源包含匹配版本的完整原版音频和独立公共原创 BGM；保持原始素材来源，不包含角色私有素材、部署状态或凭据。

## 宿主模型调用

### 操作经验证据

直接挂载的 Mineflayer 和 Java World 使用共享核心 `WorldOperationLearning`，将原工具调用、异步终态和有时效的现场数值连接到 `mymc_memory action:experience`。快战术实际提交的身体选择也走同一采集器；只读 battlefield 轮询不制造训练样本。采集运行号独立于宿主 run，通过原 callId 和 executionId 回查。数据缺失保持未知，存储失败不重放游戏动作。

Agent 可按需 `experience/help → list/get → reflect` 保存带条件、反例和来源的本地经验，再在相似场景 search/get；`mymc_choose` 可读少量适用历史。采集不会自动总结、安装策略或将检索记为采用，维护者也不替 Agent 写学习结论。宿主个人记忆仍由宿主管理。源码接入与实际加载、真实复用收益分别验收。

### 快决策连接

支持 `WorldHost.decisions` 的 Cortico 版本可复用宿主保存的 System One 连接：先在宿主供应商页保存连接和密钥，再选择 Core 的默认快决策连接。World 中 `hostDecisions.combat.connection` 设为 `host`，`decisionProvider` 留空即继承默认；指定已保存的连接名仅覆盖此 World。

按需候选选择使用 `mymc_choose`（路线、生存、技能、方法、目标）；`hostDecisions.choice.decisionProvider` 留空继承宿主，显式选择仅覆盖当前 World，通用模式也可使用。它返回短建议，不接管身体或自动换目标。`mymc_life` 按需给出通用生活故事线，`mymc_guide stories` 才提供千灯纪专项线索。两类资料均标注维护者来源，实际采用、阶段与证据由宿主记忆保存。

`connection` 为 `auto` 或省略时，新配置的空地址继承宿主；已有 `endpoint` 保持兼容。`endpoint` 模式供独立 SDK 宿主按完整地址连接；模型与密钥环境变量属于该宿主适配器，`engineConfig` 会排除整个 `hostDecisions` 配置。`host` 模式不使用留存的旧地址，宿主不可用时维持原规则控制。

`timeoutMs` 限制等待，`maxAgeMs` 限制现场有效期。云端调用可分别调整；超时、换连接、换场景或候选已失效时不会应用旧建议。规则控制在请求期间继续。当前战术端口由千灯纪资料包提供；通用 Minecraft 核心只提供现场与执行能力。主决策仍复用 Cortico 的模型、人格和会话设置。

会话身份、完整历史、上下文预算、思考参数、生成并发和模型统计由 Cortico 宿主管理。World 使用宿主认知入口与取消信号，主模型地址、密钥和生成限额使用宿主配置。

自有 Cortico fork 的 [调用端实现](https://github.com/jcs130/Cortico/commit/a2bfc77dda254931df5c5241cea27cc8777d4db9) 包含持久会话、稳定请求、完整预算及普通/流式统计。包含该实现的宿主可在部署配置顶层设置：

```json
{
  "generation": {
    "maxConcurrent": 4
  }
}
```

这是单个 Agent 对每个服务 origin 的生成上限；同地址的不同模型配置共用名额，独立服务分别计数。同一会话跨服务最多一个在途生成，空出名额时前台优先。按实际调用量和服务容量选择限额；上述配置不会修改模型服务的并发设置。原版宿主是否支持该配置需按其版本核对，安装本 World 不会添加宿主功能。

Agent 命名空间保存在宿主的 `data/agent-identity.json`，主会话身份保存在上下文旁的元数据文件，分支身份在首次请求前落盘。备份和迁移宿主数据时应保留这些文件，以及原目标、记忆和用量账本。已有主会话 ID 保持不变；会话 ID 用于关联统计，实际缓存仍按输入 token 前缀匹配。

用量账本中的 `attempt.clientQueueMs` 是调用端准入等待，`inferenceStats.queueMs` 是服务端排队，`executionMs` 是服务报告的推理执行耗时。缺失值保持 `null`，输出上限不充当独立思考预算。接入与采样只记录元数据，不新增周期推理。这些宿主改动保持本 World 的 API、工具、消息与回执契约兼容，无需为调用端优化替换游戏执行器。

方块保护默认不逐格预检。正常操作失败或服务端拒绝后，才对目标查询原因；已明确被拒的格子仍跳过。可选 `protectionPreflight:true` 恢复操作前预检。

## 通用信息能力

消息索引实现已迁入独立核心；本包只保留旧文件名、作用域与工具前缀适配，不复制查询逻辑。普通 MC 模式也提供消息检索和考虑标记。`mymc_tool_help` 从当前实际装配的工具生成说明，可按 JSON pointer 展开参数；`mymc_help` 继续负责动作手册。查询不重放消息、不调用模型，也不证明自主学习。公会、试炼、魔法等服务端协议仍通过显式服务器包启用。各宿主需要更新核心与服务器包的固定依赖后才能取得相同实现。

`toolParameterDescriptions` 默认为 `inline`；可配置为 `on-demand`，将参数说明保留在 `mymc_tool_help`，减少每轮重复投递的文字。参数类型、枚举、必填项和执行器不变。完整说明可按工具名和 JSON pointer 读取；切换后需重新挂载 World。该投影由核心公开接口实现，适用于通用、服务器包和原生客户端适配。

服务器包会在当前事实中保留最近一次“已有在途任务”的接单拒绝、时间和原文；新的接单、交付或无在途状态会清除已失效的拒绝。它不阻断其他动作，不推断未知任务身份。
