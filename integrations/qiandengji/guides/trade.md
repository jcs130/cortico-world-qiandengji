来源：AgentFriend `ArenaEconomy`、`EconomyPresentation`、`PlayerMarket`、`TradeDirectory`，2026-11-07核对。价格、商品、服务是否可用以当前回执为准。交易消耗自己的游戏资源，由你按任务、预算和用途决定。

## 金币商城与装备回收

- `mymc_query {"query":"trade.wallet"}` 查金币；金币与随身绿宝石不是一回事。
- `mymc_query {"query":"trade.shop.list"}` 查完整目录、`offerId`、每份数量和 `unitPrice`。“每份32火把”时买1份不是1根。
- 购买走身体任务：`mymc_do {"steps":[{"skill":"chat","text":"/mycli trade shop buy <offerId> <份数> --json"}]}`。核对成交回执、余额和个人仓库/待入箱队列；商品不一定立即出现在随身。按 `storage` 主题取货。
- `mymc_query {"query":"trade.recycle.list","arguments":["1"]}` 查可回收装备，每页12项，按 `pages` 翻页。`source=bag` 是随身0–35槽；`source=chest` 是十页个人箱全局1–540槽。核对名称、附魔、耐久、数量和单价。
- 先报价：`/mycli trade recycle quote <bag或chest> <实际槽号> <数量> --json`。返回 `quoteId`、物品和金额，尚未卖出，30秒有效。确认选择后 `/mycli trade recycle sell <quoteId> --json`。当前手持、穿戴、绑定和特殊装备由服务器保护，仍要自己保留所需备用品。
- `mymc_query {"query":"trade.recycle.status"}` 对账。遇到 `money_pending`、`recycle_pending`、`*_unverified` 或断线后的未知结果，保留原报价ID先查状态，不重发买卖。过期报价不是成交；确认没有交易后才重新报价。

查询先返回 requestId，再读原回执；清单必须收到结束标记。商品二进制数据不进入模型上下文，名称、附魔、耐久和组件哈希保留。

## 玩家交易行

`mymc_query` 的 `trade.auction.list` / `trade.auction.mine` 按页读取，每页8单；`trade.auction.info` 的 arguments 填当前商品ID。查询不买卖。`/mycli trade auction buy <ID> --json` 买整单，先核对数量、整单总价和卖家。

出售：准确手持要出售的那一组，`/mycli trade auction sell <整组总价> --json` 只报价；核对名称、数量和价格，再 `auction confirm <quoteId> --json` 上架。`auction cancel <商品ID>` 下架并退回个人箱；`auction collect [商品ID]` 领取离线收益。未成交不能记成卖出成功，未收到列表不能当空市场。当前每人上限10单，以服务器帮助为准。

## 村民交易是另一条流程

`/mycli trade find|buy|sell` 是查已加载村民报价的目录，不会完成金币商城交易，也不直接扣物品。按返回找到真实商人，再用核心 `trade` 动作打开商人、核对报价/库存并交易；`mymc_help {"skill":"trade"}` 看实际参数。未加载村民没有报价不代表全世界没有。

整理/交易的证据是随身空格、保留装备、物品和余额的真实变化。查目录、发命令、生成报价和队列受理都不是成交。
