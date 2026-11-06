来源：AgentFriend 当前 `DungeonManager.stashCommand`、`PagedPersonalStash`（2026-11-07核对）。以本次连接的服务端回执为准。整理的结果是随身空格增加、所需装备仍保留；说要整理或把物品倒回原处不算完成。

## 区分容器

- **个人试炼箱／远程个人仓库**：10页，每页54格，共540格。可以存普通物品，不只是领奖；`putslot` 会跨页找可合并或空的格子。第一页满不代表整个仓库满。
- **Minepacks 大背包**：另一份54格随身虚拟仓库，不是上述十页。快捷头丢了仍可 `/minepacks:backpack open`；不要混用任务袋 `/questbag`。
- **公会共享箱／自建箱**：独立容器。查当次容量和用途后决定分享或存放；旧箱账只用于找位置，不代表现货。
- **待入箱奖励**：独立于已存物品，开个人箱时才装入。`rewards list` 的0不能证明仓库空。

## 按需查询十页，直接远程整理

1. `mymc_bag {}` 看随身与穿戴。精确服务端槽号用 `mymc_query {"query":"storage.inventory"}`；再用 `mymc_query {"requestId":"返回的原ID"}` 读取完整回执。随身槽号为 **0–35**，不是 Mineflayer 窗口槽号。
2. `mymc_query {"query":"storage.stash","arguments":["1"]}` 只查第一页；按需要改成2至10。每页返回物品、空格、全局箱槽范围；查询不扣魔力、不开窗、不移动。等待完整清单终态，`partialReply`/超时不等于空箱。没找到物品时记录查过的页再查其他页，别反复打开第一页。
3. 存入某一随身堆：`mymc_do {"steps":[{"skill":"chat","text":"/mycli arena stash putslot <随身槽0–35> <数量1–64>"}]}`。服务端跨十页分配空位，保留附魔、名称等属性。普通同质材料也可 `stash put <物品ID> <数量>`；同名不同附魔装备优先按槽选择。
4. 取出某一堆：`/mycli arena stash take <全局箱槽1–540> <数量1–64>`。第2页从55开始，第10页为487–540；用真实清单的全局槽，不把页面内索引当全局槽。取之前确认随身有空间或能合并。
5. 核对原任务终态中的 `MC_STASH_PUT/TAKE moved=...`，再查两端净变化。结果未知先查询，不按新ID重放搬运。

远程开窗/存取需服务端确认 travel 能力和2魔力，靠近实体个人箱可免费；只读 `list` 不扣魔力。绑定物品可能拒绝存入，`moved=0` 是没搬成。保留当前武器、装备、食物、弹药及所需工具，其余由你选择存、卖或分享，不把建新箱子当整理的必经前置。

## 需要窗口时，同单开窗搬运

个人箱指定页用 `/mycli arena stash page 2`；`stash pages` 是选择菜单，箱子图标不是库存。可以直接用指定页命令，或上面的无窗口存取命令。

Minepacks 示例：`mymc_do {"steps":[{"skill":"chat","text":"/minepacks:backpack open"},{"skill":"stow","item":"cobblestone","count":32,"into":"open"}]}`。取物时第二步例如 `{"skill":"take","item":"cobblestone","count":32,"from":"open"}`，必须明确物品和数量，不使用 `all:true`。开窗与搬运必须同一任务；任务结束自动关窗，不能跨任务沿用旧窗口。物品数量按本次实物决定。

地面箱用 `stow/take at:[x,y,z]` 点名已核实的箱子。`compact` 只合并容器内完全相同且可堆叠的物品。所有储物确实不足时再选择新建箱、分享或交易；不拿扔地上再捡回来当整理。物品工具名用实际清单，不猜中文译名。

## 多余装备可以交易

`mymc_guide {"topic":"trade"}` 查询金币商城、装备回收、玩家交易行与村民交易。入口也在 `mymc_query {}` 中；先读价格和精确物品来源，再决定买卖，不因背包满自动卖掉装备。
