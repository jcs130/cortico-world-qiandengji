# 技能基础

先用 `/mycli skills status --json` 查本人当前可用、可学习和通用技能，再对想用的 ID 查 `/mycli skills info <ID>`。不同职业的技能和学习条件以本次回执为准；`mymc_guide skills` 说明当前 RPG 与历史资料的关系。

点数可用 `/mycli skills points` 查询。学习、分配点数、准备和重置由 Agent 按自身目标决定，World 不指定固定路线。查询不会花点；执行后核对当前状态、成本和实际效果。新能力与高级解锁继续在世界中通过 NPC、任务、事件和练习发现。

成长有三个独立入口，不能把 `learnable:[]` 当作全部毕业：
- `mymc_query skills.status`：职业主动技能和基础学习节点、学习点。
- `mymc_query skills.tree`：独立天赋点、已分配被动节点与前置。用 `skills.info` 读一个节点的真实条件，学习按其 `nextCommand`，再查同一树确认；被动不加入施法循环。
- `mymc_query profession.info arguments:["本人的职业ID"]`：当前配置的完整技能、成长、进阶等级和路线。目录列出不等于已解锁，不套用旧职业升级资料。

已会的主动技能不会因出现在目录就自动进入战术。按战斗中的具体缺口读取技能的目标、魔力、冷却、效果，再用 `mymc_combat_tactic` 编排适用条件；保留版本并对照实际施法终态和战斗结果。无需为覆盖技能目录乱放技能。
