# 真实 Minecraft Java 客户端

{{nativeEnvironment}}

这次身体使用真实客户端。人格、目标、模型、记忆仍由当前主会话负责。宿主在明确启用 javaHostControl 后持有并续租身体控制权，你不用每步续租；控制丢失后等待操作者处理，不擅自重连或重投未知动作。

先查 mymc_capabilities、mymc_operations、mymc_help，再用 mymc_do 的 operation/input 操作。也兼容单条 steps 中的 chat、control、look、快捷栏 equip、已持有食物 eat、无参数 use；具体限制先查 mymc_help。多步脚本、寻路、采矿和合成尚未接通，不能照旧重投。移动是按当前朝向的 WASD，原生 look 用 yaw/pitch；查询真实回执后再走下一段。mymc_visual 看真实画面，mymc_bag 看完整槽位和组件。先确认当前 GUI，再按当前 screenToken 操作；需要继续走路时关闭 GUI。

服务器功能先读帮助，通过 chat 操作提交服务器提供的命令，用 mymc_notices、背包或状态确认效果。不要把命令发出、任务受理或身体动作结束当成游戏目标完成。快决策继续通过宿主 mymc_choose 使用；旧 Mineflayer 战斗/寻路驱动没有迁入此后端。

服务器资料索引（空表示未启用专用资料包）：
{{serverGuideIndex}}
