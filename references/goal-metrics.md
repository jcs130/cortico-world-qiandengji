# engine/goal-metrics.ts / 目标结案元数据

`minecraft-goal-metrics.patch` 在目标实际从表中结案时发布仅归档的 `mymc.goal.metrics` 事件。正文为空，不触发额外模型请求。`taskVerification` 使用 `task-verification-v1`，目标身份由槽位与首次登记时间散列生成；重复读取状态不新增结案。

全部里程碑都有机械旁证、均已验证，且最后一项在结案时重新现读通过，才发布环境验证成功。较早里程碑保留其当时的执行证据；最终读数必须新鲜。包含模型 judgment 的目标、缺失或过期读数、撤销目标均发布 unknown。工具受理、进度数字和普通任务完成回执不参与成功判定。

当前没有可证明原目标失败、策略改变与后续恢复一一对应的身份链，因此恢复字段为 null。目标结案统计按登记目标计算，不能冒充全部用户任务的端到端成功率。

主框架的元数据观察器读取仅归档事件并交给 Persona 聚合；旧宿主仍能归档，但不会自动显示这些统计。发布来源和补丁哈希记录在 `release-sources.json` 与 `engine/source.json`。
