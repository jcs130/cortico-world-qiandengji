# 联机版我的世界 · 千灯纪服务器 World

内置现代 Web 可视化，展示背包、任务、技能、魔力和服务端回执；通过千灯纪适配器支持服务器玩法与已验证的模组协议。包名仍为 `cortico-world-qiandengji`，原配置和 World ID `mymc` 保持兼容。

`server-guide.ts` 的 `cli` 主题保存人类提供的 Agent CLI 0.4.31 契约。环境入口只保留认证、目录、分页和结果未知的短说明，完整帮助按需读取；资料更新不代表服务器实测、主线毕业或能力已学会。

这里保存千灯纪账号规范、传送、公会/试炼、技能目录、服务器资料及旧 `mymc_*` World/MCP 装配。它们不属于默认 Agent MC World 产品，也不在通用发行包的 files 白名单中。

默认导出 `MYMC`，World ID 为 `mymc`，配置位于 `worlds.mymc`，工具前缀为 `mymc_`。在 Cortico 扩展页安装 `cortico-world-qiandengji`，或在扩展目录执行 `corepack pnpm add --ignore-workspace cortico-world-qiandengji`，重启宿主加载。配置服务器地址与账号后再启用；安装不会自动连接服务器。Cortico World API 为 5。

0.4.0 将独立核心 `agent-mc-world` 作为普通依赖自动安装；Cortico 由宿主提供。发行包包含自身编译后的服务器扩展与控制台，不依赖邻接源码目录。已有部署继续沿用 `mymc`、原账号、记忆和账本；升级前备份部署目录。通用插件 `cortico-world-minecraft-agent` 的 ID 为 `mc`，不要与本插件同时启用同一连接。

源码入口是 `cortico.ts` 的 `MYMC`、`runtime.ts` 的 `MymcAgentRuntime` 以及 `stdio.ts`；核心扩展端口为 `agent-mc-world/extension`。构建命令在仓库根执行 `pnpm build:extensions`。旧操作说明保存在 `LEGACY-README.md` / `LEGACY-DEPLOYMENT.md`，只用于兼容维护。

新 Agent 应从服务器帮助、目录和实际回执学习玩法，把适用条件与失败边界交给自己的方法库。这里的旧快捷传送、试炼前置检查等维护规则，不自动作为新通用 Agent 的学习成果。后续应把已观测协议与资料逐步替换为显式服务器能力适配，保持来源和版本，避免默认强制活动脚本。

服务器能力源码位于 `engine/`，通过显式本地 factory 传给核心。法术、魔力、试炼、随身容器规则和保护频道均由本插件维护。快战术的模型选择由宿主维护；这里提供 battlefield/choice 和再次校验。`combatOptions` 只含可执行策略，不包含模型 endpoint。演出端点需显式配置；游戏音效使用部署者本地的匹配版本 Java 客户端资产，不随 npm 重新分发。

## 宿主模型调用

### 快决策连接

支持 `WorldHost.decisions` 的 Cortico 版本可复用宿主保存的 System One 连接：先在宿主供应商页保存连接和密钥，再选择 Core 的默认快决策连接。World 中 `hostDecisions.combat.connection` 设为 `host`，`decisionProvider` 留空即继承默认；指定已保存的连接名仅覆盖此 World。

按需候选选择使用 `mymc_choose`（路线、生存、技能、方法、目标）；`hostDecisions.choice.decisionProvider` 留空继承宿主，显式选择仅覆盖当前 World，通用模式也可使用。它返回短建议，不接管身体或自动换目标。`mymc_life` 按需给出通用生活故事线，`mymc_guide stories` 才提供千灯纪专项线索。两类资料均标注维护者来源，实际采用、阶段与证据由宿主记忆保存。

`connection` 为 `auto` 或省略时，新配置的空地址继承宿主；已有 `endpoint` 保持兼容。`endpoint` 模式供独立 SDK 宿主按完整地址连接；模型与密钥环境变量属于该宿主适配器，`engineConfig` 会排除整个 `hostDecisions` 配置。`host` 模式不使用留存的旧地址，宿主不可用时维持原规则控制。

`timeoutMs` 限制等待，`maxAgeMs` 限制现场有效期。云端调用可分别调整；超时、换连接、换场景或候选已失效时不会应用旧建议。规则控制在请求期间继续。当前战术端口由千灯纪资料包提供；通用 Minecraft 核心只提供现场与执行能力。主决策仍复用 Cortico 的模型、人格和会话设置。

会话身份、完整历史、上下文预算、思考参数、生成并发和模型统计由 Cortico 宿主管理。World 沿用 API 5 的认知入口与取消信号，主模型地址、密钥和生成限额使用宿主配置。

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
