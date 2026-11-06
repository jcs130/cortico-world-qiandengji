服务端原生女仆不是同名的独立玩家。原版客户端可能把她投影成悦灵或村民，实体类型不能替代服务器的 `maidId`、主人 UUID 和原生状态。

先用 `mymc_maids {"action":"list"}` 取得本人女仆 UUID；分页从 page=0 开始，hasMore 为真时按需读下一页。随后用 `context`、`inventory`、`tasks` 加上 maidId，读当前生命、装备、原生工作要求与实际对话模式。旧服务器缺字段时保持未知，不能把未加载当死亡，也不能把菜单里的剑图标当作背包物品。

对话用 `action:"chat"`、maidId、已保存的 requestId 和 text（1–140 字，完整命令仍受 256 字符限制）。它使用女仆已配置的原生模型。`talk` 是旧外部宿主收件箱；`speak` 是指定台词，二者都不是女仆模型回复。pending 只表示已交给模型，等 chat-result 或用 `receipt` 的 operationId 查询原请求；replied 才是本次原生回复，回复内容也不是动作完成证明。

武器和护甲需要真实物品。先检查本人和女仆背包，再 `transfer`，最后 `equip` 并查询 `inventory` 的 equipment 读回。转交参数是 direction:"put"、女仆 slot、count 和 **playerWindowSlot**：本人主背包窗口槽 9–35、快捷栏窗口槽 36–44。适配层转换成服务器 Bukkit 槽，不要手工混用 0–8。装备使用 hand:"main"|"off"|"head"|"chest"|"legs"|"feet" 和已观察的女仆背包 slot；用空槽交换可卸下装备，绑定诅咒仍由原生机制处理。

每个不同写操作使用独立 requestId（1–48 位字母、数字、下划线或连字符），先保留 ID 再调用。写操作进入已有身体队列，不打断当前动作。队列受理与命令发送都不是成功：发送后用 `{"action":"receipt","maidId":"实际 UUID","operationId":"原 requestId"}` 对账。超时和断线不换 ID 重放，相同 ID 不用于不同参数。applied 是设置或交换生效，不代表工作任务完成。

工作用 tasks 返回的 taskId 与条件决定。follow/stay/sit、task/schedule/pickup、声音和外观入口按工具参数与当次 context.capabilities 选择。只因女仆在身边，不能假设她有武器、护甲或已切战斗工作；同行前可以核对装备、生命与工作能力，再决定准备、留守或共同出发。

`lifeState:dead` 要保留原 UUID 与 `death.evidence:"original_tlm_tombstone"`。按 context 给出的维度、墓碑位置和 nextStep 查询遗物及复活胶片。墓碑记录消失不证明已复活；当前桥接不承诺 Agent 能完成原模组祭坛复活，不自动新建替代角色或补发装备。

来源：Minecraft AI Friend `paper/integrations/touhou-maids/agent/CONTRACT.md` 的 0.1.7 契约。具体支持以已部署服务器为准；客户端包更新不代表服务端已部署。
