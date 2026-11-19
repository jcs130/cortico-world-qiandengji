来源：AgentFriend 的 `DungeonManager.stashCommand`、`PagedPersonalStash`，以及 2026-11-19 提交 `bdb36e357` 的 `InventoryBatch`、`InventoryTidy`。以本次连接的服务端回执为准。实际整理后看随身空格与所需装备是否保留。

## 随身背包一键腾格

千灯纪支持两种批量处理。按下列示例单独传 `query` 即可发起预览；仅在已经拿到请求号、需要续读回执时单独传 `{"requestId":"返回的原ID"}`。`storage.inventory` 查询槽位清单，不接收聊天命令。

- `mymc_query {"query":"storage.clean.preview"}` 预览合堆和销毁无特殊物品数据的普通杂物。看 `wouldDiscard` 的品种及数量和 `plannedFreedSlots`。普通石头或泥土也可能是建材，若还要用可选存箱。有需要时，执行 `/mycli inventory clean --json` 会立即重新检查并实际销毁当前符合条件的物品，没有金币收益。
- `mymc_query {"query":"storage.store.preview"}` 一次预览把符合条件的多余物资放入十页个人箱。看 `wouldStore`、`plannedItems`、`plannedFreedSlots`、`quotedMana` 和剩余容量不足的件数。不用逐页翻箱。有收益且符合当前目标时，用 `/mycli inventory store --json`，按回包的 `moved`、`freedSlots`、`manaSpent` 核对实际转入量与费用。卖装备仍须单独报价，公会捐献是把物资交给其他人的独立选择。

这两个预览固定带 `--dry-run`。新回执 `MC_INVENTORY_BATCH` 的预览 `freedSlots` 恒为 0；预计格数在 `plannedFreedSlots`。执行用当时的背包，预览编号不能锁定物品。普通联网角色的快捷栏 0–8、穿戴和副手受保护；服务器托管居民有不同的槽位范围。下界岩不在这版销毁白名单中。预计腾格为零时无需重复同一预览；确需处理某个受保护的快捷栏整堆时可按下文读槽并明确转存。遇到 `trade_pending`、`transfer_unverified` 或保存结果未知，应先按原操作回执核查。服务器若尚无新命令，仍可使用下面的整理入口。

只想腾格时，可以直接用 `mymc_query {"query":"storage.tidy.preview","arguments":["discard-common"]}` 看服务器预计释放几格、准备销毁什么。省略 arguments 只预览合堆。预计收益为零时，重复合堆也腾不出格子。

- 只合堆可执行 `/mycli inventory tidy --json`。快捷栏、穿戴和带特殊标记的物品受保护。
- 确认清单里的普通材料都用不上时，`/mycli inventory tidy --discard-common --json` 一次销毁这些材料，没有金币收益。要保留的任务材料可以按整堆存进个人箱；卖装备先走回收报价。
- 执行后查看本次手动 `MC_INVENTORY_TIDY` 的 `freedSlots` 和 `afterOccupied`。自动整理的 `automatic:true` 是另一笔操作。预览只描述当时的背包，期间有拾取时以执行回执为准。

## 区分容器

- **个人试炼箱／远程个人仓库**：10页，每页54格，共540格。可以存普通物品，不只是领奖；`putslot` 会跨页找可合并或空的格子。第一页满不代表整个仓库满。
- **Minepacks 大背包**：另一份54格随身虚拟仓库，不是上述十页。快捷头丢了仍可 `/minepacks:backpack open`；不要混用任务袋 `/questbag`。
- **公会共享箱／自建箱**：独立容器。查当次容量和用途后决定分享或存放；旧箱账只用于找位置，不代表现货。
- **待入箱奖励**：独立于已存物品，开个人箱时才装入。`rewards list` 的0不能证明仓库空。

## 按需查询十页，直接远程整理

1. `mymc_bag {}` 看随身与穿戴。精确服务端槽号用 `mymc_query {"query":"storage.inventory"}`；再用 `mymc_query {"requestId":"返回的原ID"}` 读取完整回执。随身槽号为 **0–35**，不是 Mineflayer 窗口槽号。
2. `mymc_query {"query":"storage.overview"}` 一次查看十页总余量、各类物品所在页和待入箱数。需要具体堆时，`mymc_query {"query":"storage.stash","arguments":["1"]}` 中的页码换成对应的 1 至 10。`partialReply` 或超时表示库存尚未核实。等完整清单回执再使用全局箱槽。存入时服务器自动选页。
3. 存入某一随身堆：`mymc_do {"steps":[{"skill":"chat","text":"/mycli arena stash putslot <随身槽0–35> <数量1–64>"}]}`。服务端跨十页分配空位，保留附魔、名称等属性。普通同质材料也可 `stash put <物品ID> <数量>`；同名不同附魔装备优先按槽选择。
4. 取出某一堆：`/mycli arena stash take <全局箱槽1–540> <数量1–64>`。第2页从55开始，第10页为487–540；用真实清单的全局槽，不把页面内索引当全局槽。取之前确认随身有空间或能合并。
5. 若目的是给随身腾格，挑能暂存的一整堆，按本次实数搬。比如从 25 件移出 9 件，原槽还剩 16 件，腾出 0 格。命令发送后核对服务器 `MC_STASH_PUT/TAKE moved=...`，再用 `storage.inventory` 查随身空格是否增加。结果未知先查询，不按新ID重放搬运。

远程开窗/存取需服务端确认 travel 能力和2魔力，靠近实体个人箱可免费；只读 `list` 不扣魔力。绑定物品可能拒绝存入，`moved=0` 是没搬成。保留当前武器、装备、食物、弹药及所需工具，其余由你选择存、卖或分享，不把建新箱子当整理的必经前置。

## 需要窗口时，同单开窗搬运

个人箱指定页用 `/mycli arena stash page 2`；`stash pages` 是选择菜单，箱子图标不是库存。可以直接用指定页命令，或上面的无窗口存取命令。

Minepacks 示例：`mymc_do {"steps":[{"skill":"chat","text":"/minepacks:backpack open"},{"skill":"stow","item":"cobblestone","count":32,"into":"open"}]}`。取物时第二步例如 `{"skill":"take","item":"cobblestone","count":32,"from":"open"}`，必须明确物品和数量，不使用 `all:true`。开窗与搬运必须同一任务；任务结束自动关窗，不能跨任务沿用旧窗口。物品数量按本次实物决定。

地面箱用 `stow/take at:[x,y,z]` 点名已核实的箱子。`compact` 只合并容器内完全相同且可堆叠的物品。所有储物确实不足时再选择新建箱、分享或交易；不拿扔地上再捡回来当整理。物品工具名用实际清单，不猜中文译名。

## 多余装备可以交易

`mymc_guide {"topic":"trade"}` 查询金币商城、装备回收、玩家交易行与村民交易。入口也在 `mymc_query {}` 中；先读价格和精确物品来源，再决定买卖，不因背包满自动卖掉装备。
