服务端原生女仆不是同名的独立玩家。原版客户端可能把她投影成悦灵或村民，实体类型不能替代服务器的 `maidId`、主人 UUID 和原生状态。

先用 `mymc_maids {"action":"list"}` 取得本人女仆 UUID；分页从 page=0 开始，hasMore 为真时按需读下一页。随后用 `context`、`inventory`、`tasks` 加上 maidId，读当前生命、装备、原生工作要求与实际对话模式。旧服务器缺字段时保持未知，不能把未加载当死亡，也不能把菜单里的剑图标当作背包物品。

这些查询与 `nearby`、`workshop`、`receipt`、不带 choice 的 `brain` 已声明为只读分支，可交给只读 worker，不占用身体控制。执行 worker 的范围需包含 `mymc_maids`。`companions` 事实摘要保留观察时间、坐下/移动状态、已查询装备和交谈入口；完整背包与工作清单按需读取。

日常交谈和主人安排工作是两个入口。先 `nearby` 或最新 `context.conversation` 确认真实对象、距离和频道；服务端 0.1.12-conversation 支持在同世界附近点名，例如“肥鱼，你好”或“@肥鱼 你好”。用普通附近文字发送，或现有附近语音链路；全服喊话、私聊和语音小组不会触发附近点名。范围以当前返回的 nearbyRange 为准（该版为 8 格），在线或旧位置不代表现在就在附近。收到带真实来源的回复才算对方回应，不因发送成功就说聊完了。

附近点名是公开聊天，不读取主人私聊或给访客工作工具。可米安排工作、装备和跟随仍用下面的主人接口；不要把同一句话同时通过附近点名和 chat 重复发给她。语音的 sent 只表示发送，不能当作真人听见；context.speech 可查音色、传输及失败原因。名字是称呼，maidId 是协议身份，不能用旧原版投影识别真实人物。

主人交谈及工作要求用 `action:"chat"`、maidId、已保存的 requestId 和 text（1–140 字，完整命令仍受 256 字符限制）。它使用当前配置的原生/Harness 运行方式。`talk` 是旧外部宿主收件箱；`speak` 是指定台词，二者都不是她的模型回复。pending 只表示已交给模型，等 chat-result 或用 `receipt` 的 operationId 查询原请求；replied 才是本次回复，回复内容也不是动作完成证明。`brain` 不带 choice 查询当前模型及可选方式；确需切换时使用实际返回的 choice 与独立 requestId，忙碌时不切换，不重建角色或清空记忆。

外观以 `context.appearance` 的实际 YSM/原生模型为准，顶层 modelId 可能只是备用模型。`damageProtected` 是原生伤害保护，不表示所有删除或虚空情况都安全。旧服务器缺这些字段时保持未知，不臆造能力或自动修改她的设置。

武器和护甲需要真实物品。先检查本人和女仆背包，再 `transfer`，最后 `equip` 并查询 `inventory` 的 equipment 读回。转交参数是 direction:"put"、女仆 slot、count 和 **playerWindowSlot**：本人主背包窗口槽 9–35、快捷栏窗口槽 36–44，可用 `mymc_bag {"detail":"slots"}` 现读，不必编脚本或试算整理。适配层转换成服务器 Bukkit 槽，不要手工混用 0–8。装备使用 hand:"main"|"off"|"head"|"chest"|"legs"|"feet" 和已观察的女仆背包 slot；用空槽交换可卸下装备，绑定诅咒仍由原生机制处理。

女仆 `inventory` 的 `availableSlots` 表示已解锁的可用容量，不是空槽数；例如 6 表示只能用 0–5 号槽。`inventoryAccess` 给出本次可用范围、空槽和锁定槽数量；不能把 `slotCount:36` 的总容量当作全部可用。当前连接收到的原始操作拒绝可通过同一 `operationId` 读取，保留错误与时间；它不证明后来重试成功。成功受理/排队的操作仍向服务器查最新回执，不把旧 queued 缓存成最终成功。重连后无本地原回执时仍按服务器结果处理，不重放未知操作。

`mymc_bag` 汇总数量不等于精确槽位。转交前可按需读 `mymc_script {"api":"inventory.items"}` 的公开契约，再运行只读 `return await bot.inventory.items()` 取得当前 slot 与物品身份；装备槽用 `await bot.read("inventory.slots")`。执行者需要同时获得该只读入口，不能按汇总列表顺序猜槽号。本人背包满时先核对可用堆叠或合理的交出物品，不能直接宣称无法交接，也不要丢东西腾位。

每个不同写操作使用独立 requestId（1–48 位字母、数字、下划线或连字符），先保留 ID 再调用。写操作进入已有身体队列，不打断当前动作。队列受理与命令发送都不是成功：发送后用 `{"action":"receipt","maidId":"实际 UUID","operationId":"原 requestId"}` 对账。超时和断线不换 ID 重放，相同 ID 不用于不同参数。applied 是设置或交换生效，不代表工作任务完成。

工作用 tasks 返回的 taskId 与条件决定。follow/stay/sit、task/schedule/pickup、声音和外观入口按工具参数与当次 context.capabilities 选择。只因女仆在身边，不能假设她有武器、护甲或已切战斗工作；同行前可以核对装备、生命与工作能力，再决定准备、留守或共同出发。

主人格可根据当前目标安排一次合成、照料已有农地，或让她继续随行。需要合成时用 `workshop` 查已授权工位、`recipes`、`productsPerCraft` 和 `currentOrder`。空目录表示没有可选工位。`unsupported_action` 表示服务端明确不支持，`unavailable` 表示这次查询未取得有效回包。客户端须先确认工位能力才能下单。

站在同维度能看见她的工位附近，空闲时用 `make`，传 `maidId`、新 `requestId`、清单中的 `workshopId` 与 `recipeId`。可选 `quantity` 为成品总数，须是单次产出的整倍数，省略则制作一批。`inventory` 可选 `chest`（默认工位补给箱）或 `backpack`（女仆背包），材料和成品使用同一处。同一连接内重复提交原编号只返回已有提交状态。

`queued` 表示身体队列受理，`pending` 表示服务端接单。用 `{"action":"receipt","maidId":"实际 UUID","operationId":"原 requestId","operationAction":"make"}` 对账，重连后沿用这条查询。收到 `data.status:"completed"` 和 `goalCompleted:true` 后，核对 `observation.verified`、`itemId`、`count` 和 `inventory` 确认实际交付。已有工单时读 `currentOrder.operationId`，缺材料时先查可用库存。若原结果未知，保留编号并核对对应库存。

确有需要时才安排农场工作。核对有权使用的附近耕地、种子、空位和原生工作时段，再从 `tasks` 读取 `touhou_little_maid:farm` 并用 `task` 选择。以成熟作物收取、地块补种、实物增量确认成果；`applied` 仅是模式生效。要出发时可用 `follow` 结束农场工作。野外同行前查 `context.companion` 和 `inventory`。护卫需要合用的主手武器，远程模式还需相应弹药。

自动同行按 `context.follow` 的实际 `walkBeyond`、`stopWithin`、`recoveryBeyond` 与 `ownerDistance` 判断。`within_follow_distance` 表示处于允许自由活动的范围，不是掉队；`walk_requested` 只表示原生导航已请求。不要把固定贴身距离、对方先走或反复发送 follow 当作前进前置。32／16／64 格是部分实体的自定义配置，其他实体和旧服务器可不同。`follow_profile_invalid`、停留、工作或跨维度暂停应读实际原因；重复设置模式不能替代排查。

0.1.14-companion 的主人远传／跨维度随行是独立能力：跟随中的原同伴在主人传送前附近（该版 16 格内）时，服务端尝试带到已加载且安全的落点。它不要求同伴先踩传送门，也不保证远方、未加载或没有安全落点时成功。自己使用 `mymc_do` 的 `transit` 穿门后，以真实维度变化确认本人到达，再按需核对同伴；不要以等待她走进门替代自身穿门。任务的人类新要求优先于旧等待条件，未知能力仍按当前帮助和回执确认。

`sitting:true`、`canMove:false` 与空装备可以同时存在，不能用“已复活”替代这些准备。`enabled` 表示模式可选，conditions 是原生条件说明，不保证现在有工具或环境可实际开工；选择模式、装备成功与实际工作结果分别核验。

`lifeState:dead` 要保留原 UUID 与 `death` 的事件 ID。证据可为原生死亡事件 `original_tlm_death_event`，或墓碑 `original_tlm_tombstone`；墓碑晚到补充同一事件，不是又死一次。按 context 给出的维度、墓碑位置和 nextStep 查询遗物及复活胶片。墓碑记录消失不证明已复活；当前桥接不承诺 Agent 能完成原模组祭坛复活，不自动新建替代角色或补发装备。

若同一 UUID 有晚于 `death.diedAt` 的原生存活记录，旧墓碑仍在也不代表再次死亡。客户端保留该历史证据；随后未加载时标为未知，按需查询。遗物取回是独立事项，不能因生命恢复就宣称遗物已取回，也不能继续把旧死亡当当前复活任务。

0.1.8-life 返回的 `historicalDeath` 只表示历史，`lastSeenAlive.observedAt` 是最近存活见证；`recovery.observedAt` 是再次观察到原 UUID 存活的时间，不是实际复活时间。`recovery.persisted` 表示服务端是否已保存该见证。重连或女仆卸载后仍可按需读取，不能把这些历史字段当作当前加载或当前生命，也不据此重放复活操作。

来源：Minecraft AI Friend `paper/integrations/touhou-maids/agent/CONTRACT.md` 和 `paper/docs/MAID_CONVERSATION_20261108.md`（0.1.12-conversation）。字段和实际支持以当前服务器回执为准；客户端包更新不代表服务端已部署。
跟随补充来源：同仓库 `paper/docs/MAID_FOLLOW_RADIUS_20261111.md` 与原生 `NativeMaidFollowSupport`／`NativeMaidCompanionSupport`；不将候选文档当作当前实体配置。
