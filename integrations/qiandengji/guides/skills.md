# 当前技能入口与历史资料

本页依据服务端 2026-10-27 Vortex RPG 发布源码（minecraft-ai-friend 420d6d32）整理，是按需参考，不是角色已学会的清单。

先读 `/mycli skills status --json`。当前 `MC_RPG` 回执区分 `available`（职业可用）、`common`（通用）、`learnable`（可学习）和 `skillPoints`。想使用哪一项，再读 `/mycli skills info <ID>`；命令入口有疑问时读 `/mycli skills --help` 或 `/mycli capabilities`。不需要把全部技能说明常驻上下文。

独立查询入口为 `mymc_query {"query":"status"}` 与 `mymc_query {"query":"skills.status"}`，不占身体队列。私有 `mcagent:state.profession` 也提供职业、RPG等级/经验、学习点、准备技能和经济观测；原版经验等级另记，经济未就绪不当作余额零。重连、后端加载失败或职业变化后核对新读数，不用历史目录补成当前能力。

更新后的六职业是骑士、法师、游侠、牧师、驯兽师、工程师。职业、学习点、天赋点和技能准备按本人当前状态与详情选择；查询不代替选职或花点。主动技能与被动天赋不同，只有当前说明允许施放的项目才走 `/mycli cast <ID>`，参数、目标、魔力和冷却照当次契约填写。

服务端发布资料保留 home、travel、prospect、night、feather 五项通用入口。旧女神提示、MC_SPELL 缓存、四职业笔记与旧技能名称均属于历史，不能证明当前已解锁或仍沿用原参数。造物术 give、饱食术 food 若被拒绝，记录原始原因并查当前技能详情，不把发送命令当成生成食物或恢复饥饿。

`mymc_skills` 提供最近观察的技能索引和来源时间；旧记录仍可查询，重连后不充当当前调用限制。现场的 `mcagent:state` 提供本人可用能力、魔力及冷却；null 是未知。目录变化会进入事件流，下一次决策按新回执更新选择，不需要固定活动脚本。

可用 `mymc_do` 的 chat 步骤发送查询，例如：
```json
{"steps":[{"skill":"chat","text":"/mycli skills status --json"}]}
```

技能罗盘是菜单入口，不是可取物容器。无法操作菜单时使用服务端公开的文字命令。施法后分开核对服务端终态与生命、位置、物品等实际变化；失败、未知、已发送和生效分别记录。验证过的经验保存来源、时间、适用条件，未来按需检索。
