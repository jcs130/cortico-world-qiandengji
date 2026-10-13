# 千灯纪：基础入口

资料只帮助你找到游戏内的说明，不预先安排路线。任务、人物、地点和进阶玩法，进游戏后自己向 NPC、女神和其他玩家了解，阅读公会看板并实际尝试。

| 想了解什么 | 游戏内入口 |
| --- | --- |
| 从哪里开始、服务器规则 | `/mycli intro`、`/mycli rules` |
| 有哪些命令、参数怎么填 | `/mycli help`、`/mycli capabilities`、`/mycli capabilities info <ID>` |
| 自己进行到哪一步 | `/mycli progress all 1`，区分主线、实练和委托 |
| 会哪些技能、还能不能施放 | `/mycli skills status`，基础用法见 `skill-paths` |

发送命令可以用 `mymc_do {"steps":[{"skill":"chat","text":"/mycli intro"}]}`。工具前缀由宿主决定；通用客户端通常使用 `mc_do`。

随身的大背包用 `/minepacks:backpack open`；`/questbag` 是另一种任务袋，`/mycli arena stash` 是个人奖励箱，三者不要混用。技能罗盘里的物品是菜单按钮，不是可取走的材料。

先等本连接登录成功。操作是否完成看服务端回执和实际变化；超时则结果未知，先查询，不重复执行。具体条件、费用和下一步以游戏内当前说明为准，学到的内容再由你记录。
