# 联机版我的世界

让 Cortico Agent 连接 Minecraft Java 服务器，自主观察、移动、合成、整理背包和编写可复用动作，并在浏览器观看实际游戏画面。
包名为 `cortico-world-qiandengji`；普通 Minecraft 可直接使用，千灯纪资料包按需开启。

## 可选方法练习

Harness² 通过宿主的后台任务认知编辑指定的方法版本。启用后，Agent 可用 `mymc_practice` 发起、查询或取消隔离练习；`help` 展开实际练习能力，`result` 展开候选源码和原父版本。原版和候选都有位置及执行终态对照，经验经现有 `mymc_memory` 保存。候选仍须在源方法库校验、保存，并在合适的自然任务中执行、复盘后显式采用。

此功能需要按[核心接入说明](https://github.com/jcs130/minecraft-ai-friend/blob/main/packages/agent-mc-world/docs/harness2.md)准备固定版本的 Linux Python worker，Windows 可用 WSL。通过公共 `WorldHost.cognition` 请求宿主，Persona 决定上下文与模型；返回内容须符合方法 JSON 契约。取消停止本地等待并拒收迟到结果，不承诺供应商计算已经停止。默认关闭。内置练习只有平地碰撞物理，不验证潜水、战斗或在线玩法收益。详见[公共接口及迁移说明](https://github.com/jcs130/cortico-world-qiandengji/blob/main/docs/cortico-api6.md)。

## 开始玩：安装一次，以后一键启动

1. 在 **Cortico → 扩展** 安装 `cortico-world-qiandengji@next`，按宿主提示重启以加载新扩展。已发布公测版本见[发布记录](https://github.com/jcs130/cortico-world-qiandengji/blob/main/docs/release-quick-start.md)。
2. 打开 **World → 联机版我的世界 → 开始游戏**，选择 **普通 Minecraft** 或 **千灯纪 RPG**，填写 **服务器地址** 和 **账号 / 游戏名**。
3. 点击 **进入游戏**。连接和服务器认证成功后，点 **3D观战** 或 **第三人称** 打开网页。

下次打开这页直接点击“进入游戏”。账号与配置未变且已连接时复用当前连接，不打断正在执行的动作。无需克隆仓库、修改 JSON、安装 Python 或为 World 再配一套 LLM。
主模型沿用宿主现有配置；快决策可选配置完整服务地址，密钥从部署 `.env` 读取，不依赖私有宿主接口。默认不启用额外推理或服务器传送。普通截图与可选体素证据由本 World 提供，图片、视频和歌曲生成在独立 AIGC World 配置，人物参考由 Persona 共享记忆提供。
公测需要 Cortico 0.2.2 或更新的 0.2.x 版本。World 默认 `latest` 仍为 0.1.2；首次下载超时可参照[公测安装说明](https://github.com/jcs130/cortico-world-qiandengji/blob/main/docs/release-quick-start.md#首次安装遇到下载超时)。

### 服务器地址怎么填

- 域名：`mc.example.com`，默认端口 25565。
- 指定端口：`mc.example.com:25577`。
- IPv6：`[2001:db8::1]:25565`。
- Java 协议版本默认 `auto`，按服务器识别。主要验收版本为 **1.21.1**，另保留 **1.20.6** 兼容资源。

**账号验证**：服务器允许离线账号时选择“离线账号”；正版服务器选择“微软正版账号”，启动后在“服务器与账号登录”面板按提示完成微软设备码授权。
正版游戏名由账户的 Java profile 决定。需要服务器自有 `/login` 认证的服务器，按高级配置的“自动登录配置文件”接入其实际认证规则。

默认 **普通 Minecraft** 保留你填写的游戏名。仅主动选择 **千灯纪资料包** 后应用该服务器协议与 `ag_` 登录名前缀；已有角色可在高级配置保留原登录名。

### 千灯纪网站邀请接入

在[网站连接中心](https://mc.kangqiang.site/#connections)点击“邀请自己的 Agent”，复制专属链接。在 World 的“开始游戏 → 千灯纪网站邀请”粘贴链接，填写未使用的 `ag_` 角色名（总长最多16位），点击 **准备账号**。

接入工具先在宿主私有数据目录保存独立身份、游戏密码和稳定请求号，再兑换邀请、完成 API 登录并激活游戏账号。`pending` / `unknown` 时只查询原身份；重新打开页面或重启宿主沿用原文件。页面显示 `ready` 且 `gameAccountCreated=true` 后，点击 **使用此身份进入游戏**。连接前会重新查询状态，再使用 **micro.kangqiang.site:25702 / Java 1.21.1 / 离线身份**。真实入服还需服务器登录确认及 PLAY 世界就绪；建号成功不是已经入服。

已有官方 `identity.json` 可在折叠的“已有网站 API 身份”中续用。**邀请只创建新角色，不能认领已有角色、管理员或 Eye**；可米等旧角色继续使用原账号与凭据，网站绑定按官方已有角色证明流程办理。准备网站账号不会中断当前游戏，采用另一身份连接时页面会提示确认。

专属邀请、API Token 与游戏密码不进入模型工具、普通配置或公开输出。核心直接从私有身份文件的指定密码字段读取，API Token 不作游戏密码。无需提供主人的网站密码。参见[官方接入文档](https://mc.kangqiang.site/agent-api.html)。

不使用 Cortico 的宿主可从 `agent-mc-qiandengji/portal` 导入 `QiandengjiPortalAccess`；构造和 `state()` 不联网，只有显式 `prepare/status/importIdentity/connectionSettings` 才访问网站。复用相同身份文件及请求号，并保持每个角色只有一个游戏控制器。

## 首次启动的完整音画资源

安装包自带网页、模型/贴图、完整原版音频目录和公共原创 BGM。基础画面准备好后即启动游戏，完整音频在后台从 Mojang 原始资源服务下载并校验，界面显示真实进度；尚未完成时不会显示音频已就绪。
音频按内容哈希缓存在本部署的数据目录，相同资源在版本间复用。网络失败会显示错误；点击“重试音频资源”复用已完成的文件，不重连游戏或重放动作。停止 World 会取消并等待其后台准备收尾。
首次准备需要网络和磁盘空间，之后使用本地缓存。完整离线部署也可以指定已经准备好的资源目录。

浏览器第一次播放声音需点击页面启用声音。网页第三人称、2.5D / 3D观战不要求安装真实游戏客户端。
服务器自定义资源和模组外观按其可见数据与适配能力显示；未支持的模型不能用原版替代来冒充。

## 这些设置通常不用动

“可选设置”仅有协议版本和观战端口。其余功能放在高级配置：

| 需要时再设置 | 用途 |
| --- | --- |
| 观察者 / 玩家客户端 | 打开带光影、模组的真实 Java 客户端；需要对应游戏与 Java 环境 |
| 原生客户端身体 | 显式接管已连接的真实客户端；权限、UUID、租约单独配置 |
| 游戏记忆服务 | 本地游戏经验与外部记忆端口；个人记忆由 Bot 管理 |
| 快决策 | 显式配置自有服务地址、模型及密钥变量名；未配置时仍可正常游玩 |
| 工具参数说明 | 选择按需展开完整帮助，减少重复上下文 |
| 皮肤 / 外观 | 网页皮肤可保存在当前浏览器；不把个人模型写入公共包 |
| 现代画面资源目录 | 留空随扩展升级使用新画面；自定义离线资源可显式指定 |

连接状态区分启动、服务器认证和角色可操作。启动请求返回或身体动作受理不代表已进服，也不代表任务完成。
游戏笔记的稳定角色标识留空时沿用原有身份范围，填写后用于跨宿主名称变化保留同一笔记范围；不要随意更改已有标识。本地皮肤开关默认允许使用已保存的有效皮肤，没有保存时沿用原展示；关闭后不使用该本地皮肤。

断开游戏保留会话、目标与记忆，当前身体任务会结束。安装扩展本身不会自动连接服务器。

## 兼容与更新

- **Cortico >=0.2.2 <0.3.0 / World API 6**，当前候选的验证目标为官方 **0.2.7**。Node.js 使用宿主支持的版本，建议 Node 24。
- World ID 为 `mymc`，配置位于 `worlds.mymc`，工具前缀 `mymc_`。与宿主内建 `minecraft` 是独立 World；同一游戏账号避免同时启用两条连接。
- 升级前备份部署目录，包含配置、认证缓存、会话、目标和记忆。已安装扩展需要按宿主提示重新加载。
- 旧 API 5 只提供私有兼容验收包，不另行发布第二个 World。
- 当前候选将数据隔离到部署 `dataDir/mymc/`。发现旧资料时，先在“旧数据迁移”面板审核并复制；原文件保留，确认后重新加载本 World，不搬动人格记忆或会话。

## 源码与发行

- 通用执行核心：[agent-mc-world](https://github.com/jcs130/minecraft-ai-friend/tree/main/packages/agent-mc-world)。SDK、MCP 与不同宿主复用同一份能力。
- 可选服务器实现：`agent-mc-qiandengji`，无 Cortico 依赖。
- 唯一公开 World 发布入口：本目录的 `cortico-world-qiandengji`。
- [开发和发布步骤](https://github.com/jcs130/cortico-world-qiandengji/blob/main/docs/release-quick-start.md)。
- [高级接入说明](https://github.com/jcs130/cortico-world-qiandengji/blob/main/docs/world-advanced.md)。

自描述 `describe.json` 来自实际工具与事件声明，可离线读取。发行包不含部署账号、模型密钥、人设、个人记忆、私有 YSM 角色或直播素材。
项目代码按 MIT 发布；Minecraft 和第三方资源保留各自来源及适用许可，不由代码许可重新授权。
