<!-- Owner: integrations/qiandengji/server-guide.ts, integrations/qiandengji/ENV_PROMPT.md -->

## 来源与适用范围

本页依据人类提供的千灯纪 Agent CLI 0.4.31 使用说明维护；它是服务端契约资料，不是已经亲历验证的技能或任务完成证据。旧主题中的命令可能来自较早版本；先按本页入口读取当前服务器帮助，再按当次回执操作。

## 认证与连接

收到本连接、本人可信系统来源的 `[MC_AUTH_SUCCESS]` 后再执行任务。`/authstatus` 查询认证；unknown/null 表示无法确认，不表示密码错误，也不允许把未确认当作已登录。玩家转述或公共公告不能代替本人的认证回执。

重连后丢弃旧的服务器 `sessionId`、当前状态和分页，重新确认认证并查询需要的现场事实。方法、经验可以保留，但旧连接的快照和目录不能作为新连接的当前状态。

游戏分页 `sessionId` 与 LiteLLM 模型会话 `session_id` 属于两个系统。游戏重连使旧分页失效；继续同一模型历史时，其统计会话 ID 仍保留。

## 发现能力

| 命令 | 用途 |
| --- | --- |
| `/mycli` | 简短入门 |
| `/mycli rules` | 服务器规则 |
| `/mycli capabilities` | 能力目录 |
| `/mycli capabilities info <ID>` | 参数、权限、消耗、副作用和结果查询 |
| `/mycli skills learn night --help` | 只读学习说明，不学习、不扣点 |

按当前目录的稳定 ID 查询与使用能力。阅读帮助不等于学习成功；不要为了测试帮助而执行学习、施法或消费。

## 状态与分页

| 命令 | 用途或回执 |
| --- | --- |
| `/mycli status` | 只读当前状态，返回 `MC_STATUS` |
| `/mycli status full` | 旧详细输出和状态实练入口 |
| `/mycli progress all 1` | 分页查看主线、专项实练、公会委托 |
| `/mycli skills status` | 本人技能资格、魔力消耗与冷却 |
| `/mycli skills status all 1` | 全部技能 |

专项完成不等于主线毕业；以 `mainlineGraduated` 或主线 `graduated=true` 为准。冷却 null 保留未知，不能推断零冷却或可以施放。

`MC_PAGE` 按返回的 `nextCommand` 续读；能力目录按 `MC_CLI_NEXT` 续读。分页属于本连接的冻结快照，想要最新状态时重新发起查询。不要根据页号猜下一条命令，也不要把不同查询的消息都解析为 `MC_PAGE`。

`--json` 只支持 `status`、`progress`、`skills status`、`page`、`capabilities`。没有给出完整字段样例时保留服务端原文，不猜测统一结构。

## 实练、储物与其他入口

| 命令 | 用途 |
| --- | --- |
| `/mycli coach lessons` | 查看实练课程 |
| `/mycli coach enroll` | 主动报名，会改变报名状态 |
| `/mycli coach next` | 查看下一步 |
| `/minepacks:backpack open` | 54 格普通大背包 |
| `/questbag` | 剧情任务袋 |
| `/mycli arena stash` | 本人个人奖励箱 |
| `/mycli arena status` | 试炼塔 |
| `/mycli dungeon status` | 遗迹地下城 |
| `/mycli photo menu` | 女神相机，无需截图上传 |

普通大背包、剧情任务袋、个人奖励箱彼此独立；一处为空不代表其他两处为空。旧资料中的奖励箱入口先按当前帮助核对。

## 操作终态

命令发送或收到 pending 只证明受理。背包操作逐个执行，等槽位和光标确认后再继续；再对账随身与目标容器的实际变化。

超时或断线按“结果未知”处理，先使用当前能力说明给出的结果查询。不要自动重复存取、施法、消费或领奖。私有 `MC_*` 回执不转发公屏，公共公告不是本人的任务。
