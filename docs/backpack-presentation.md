# 大背包外观与实时状态分离

千灯纪的大背包入口使用 `minecraft:player_head` 和服务器指定的 profile texture；基础类型不能改成一个虚构的背包 ID。

可选资料包独立检查同一连接的当前随身物品：只有实际头颅 profile 中的纹理 URL 精确匹配已随包保存并校验的原 PNG，才提供 `serverItemPackId`。不按显示名、UUID 或基础 ID 猜外观，不创建第二个账号，不查询网络纹理，不发送聊天或游戏命令。

这份仅外观的投影不附带生命、技能、法力或权限，也不建立 MC_GUIDE 的会话认证。实时状态仍沿原有本人身份、会话、序号和新鲜度校验。当前物品不再匹配、连接退出或观察器关闭时，投影失效；普通服务器没有匹配物品时保持标准显示。

回归：`node --test tests/server-presentation.test.mjs tests/presentation-resources.test.mjs`。这验证可选模块及原资源的边界；实际消费端还需固定模块与共享观战版本、重建并现场核验，不能把模块测试当作已部署。
