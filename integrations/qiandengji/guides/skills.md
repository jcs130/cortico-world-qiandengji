# 当前技能入口与历史资料

本页依据服务端 2026-10-28 正式 RPG 统一资料（AF 0.4.47.27 / QiandengjiRpg 0.2.6，minecraft-ai-friend 的 paper/docs/RPG_UNIFIED_20261028.md 和原生 VortexBridge 契约）整理，是按需参考，不是角色已学会的清单。

先读 `/mycli skills status --json`。当前 `MC_RPG` 回执区分 `available`（职业可用）、`common`（通用）、`learnable`（可学习）和 `skillPoints`。想使用哪一项，再读 `/mycli skills info <ID>`；命令入口有疑问时读 `/mycli skills --help` 或 `/mycli capabilities`。不需要把全部技能说明常驻上下文。

独立查询入口为 `mymc_query {"query":"status"}` 与 `mymc_query {"query":"skills.status"}`，不占身体队列。私有 `mcagent:state.profession` 也提供职业、RPG等级/经验、学习点、准备技能和经济观测；原版经验等级另记，经济未就绪不当作余额零。重连、后端加载失败或职业变化后核对新读数，不用历史目录补成当前能力。

更新后的六职业是骑士、法师、游侠、牧师、驯兽师、工程师。先看本人状态：`class=none` 是尚未选职，不是忘了某个职业技能；`available=[]`、`learnable=[]` 和零学习点也不能单独解释成服务器没有职业。此时可按本人意向查看 `/mycli profession list`、`profession info <目录中的ID>`，再自主决定 `profession choose <ID>`；等服务端保存确认后重新查本人状态，不能把看过目录当成已选择。已经选职时不重选，不以检查为由洗点或换职。

选职后起始主动技能已经可用。按当前 `skills list/status` 与单项 `skills info <ID>` 区分主动施法ID和学习/天赋节点；后者不能直接 cast。需要花点时用当前说明给出的 `skills learn <节点ID>`，按保存回执核对点数变化。准备当前可用主动技可用 `skills prepare <技能ID>`，核对 `activeSpell`/准备状态后再使用；学习点和天赋点分别记录。费用、等级条件、装备、目标、魔力和冷却照当次契约填写。

独立只读通道也提供 `mymc_query {"query":"profession.list"}`、`profession.status`，以及 `profession.info` / `skills.info` 配 `arguments:["目录中的ID"]`。学习/选职/准备属于另一次明确操作，不混进 query。身体在赶路时读取这些已声明查询不取消原任务。

当前正式资料与原生技能回执将 home、selfheal、food、blink、starbolt、frostnova、give、travel、prospect、night、feather 列为通用技能，无需选职或重复学习。每项实际效果、消耗、参数和冷却仍查当前详情；饱食是恢复饥饿，不是取得可分给伙伴的面包。旧女神提示、MC_SPELL 缓存、四职业笔记、旧熟练度与研习书均属于历史，不能证明当前职业资格或仍沿用原参数。

Mineflayer 的现有独立施法工具是 `mymc_cast {"spell":"<当前技能ID>","arguments":["<当前说明要求的参数>"]}`；没有参数时省略 arguments。`mymc_do` 的身体动作表不含 `skill:"cast"`，不要把施法塞进同一 steps 导致整批被拒。施法、其他身体动作与发言分别按真实依赖安排；发送成功不等于施法生效，不能因为没有出手或没有目标就口播成功。

`mymc_skills` 优先读取本人当前职业技能；中立引擎对应 `mc_skills`。职业可用技能、通用技能、最后一次可学习节点清单与准备的点击技分别记录来源时间。现场 `mcagent:state.profession.abilities` 的新技能会随下一次状态更新进入同一战斗能力列表，无需重登；旧记录与未知消耗/冷却不补成当前值。

已学会不等于会在战斗中使用。先按 `skills.info` 核对效果、目标、装备、范围、魔力和冷却，再自主决定用 `mymc_cast` 施放，或用 `mymc_combat_tactic` 的 `spells`/`rules`/`program` 组合已观测技能；未编排的职业技不会自动加入默认咏唱顺序。用 `mymc_combat_tactic {"report":回执编号}` 和现场状态核对真正效果，再保留或修订组合。被动节点无需 prepare/cast；只有发送回执不能当作已命中或已掌握。

可用 `mymc_do` 的 chat 步骤发送查询，例如：
```json
{"steps":[{"skill":"chat","text":"/mycli skills status --json"}]}
```

技能罗盘是菜单入口，不是可取物容器。无法操作菜单时使用服务端公开的文字命令。施法后分开核对服务端终态与生命、位置、物品等实际变化；失败、未知、已发送和生效分别记录。验证过的经验保存来源、时间、适用条件，未来按需检索。
