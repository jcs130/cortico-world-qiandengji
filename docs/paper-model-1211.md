# Paper 人物模型：Java 1.21.1 接入

服务器外观桥的源格式和 YSM 版本没有随 Java 升级改变，但旧 `createAppearance` 仅允许 Minecraft 1.20.6，导致 1.21.1 的客户端收到 `mcagent:appearance` 后没有创建接收器，网页仍显示普通玩家模型。

现在使用共享可视化的 `supportsViewerAppearanceVersion`，接入 1.20.6 和 1.21.1。仍核对原 YSM/协议/JAR 标识、玩家 UUID、实体 ID、连接 epoch、源文件和归档 SHA、数据上限与过期状态。只用玩家本人的现有连接获取资源；不改服务端分配，不建额外观察账号，不按角色名硬编码模型。未支持版本或资源仍明确不可用。

回归在两种真实版本注册表的模拟 Bot 上，通过第一和第三人称 Socket 路径验证：按需获取一次资源，先传完整校验过的原资源再发可渲染状态，保留本人身份，实体移除/重生/断线后清理。1.21.1 用旧入口时确实收不到外观状态，修复后通过。测试资源是明确的离线传输夹具，实际人物画面需要消费端独立验收。

共享来源及逐文件 SHA 见 `integrations/qiandengji/engine/viewer-appearance.provenance.json`。开发工作区显式消费已验证的 `agent-mc-world-0.4.8-dev.20261015.1.tgz`，SHA-256 为 `f8d452450f7611c589460d1614564abf83b8ce24927b1f6311e5e39652f8baf8`；归档留在本机 vendor，源码仓库保留锁。中立服务器包候选版本为 `0.4.1-dev.20261015.1`，无需修改 Cortico 主框架。
