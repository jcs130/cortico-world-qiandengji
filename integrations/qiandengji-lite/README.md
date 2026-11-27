<!-- Owner: src/index.ts, src/shared-world.ts, src/connection.ts, src/credentials.ts, scripts/build.mjs -->
# 千灯纪-lite

0.2.1 是同一 `agent-mc-world` 内核的轻量接入，不再复制官方 Cortico Minecraft World。执行、导航、合成、战斗、真实队列、取消和终态均由共享 MinecraftClientWorld 处理；Lite 只负责命名、14 工具白名单、账号接入和公共连接诊断。需官方 Cortico >=0.2.17 <0.3.0、Node.js 22.15+ 或 24 LTS。运行时固定共享游戏内核 preview.142 和 Qiandengji preview.108；本候选未宣称发布或真实入服成功。准备依赖和构建见 BUILDING.md。

已验证发行包可在原 Cortico 的 `extensions/` 独立工作区安装，或按官方流程选择预编译本机包目录。不要直接把待同步依赖的开发目录当作发行包。同一角色只启用一个 Minecraft 连接，先正常停止旧 World。沿用原 username、host、port、版本、部署 data、游戏账本目录和 Memory；不新建 Bot、人设、任务 worker 或模型循环。配置段仍为 `worlds.mymc-lite`，World id=`mymc-lite`，工具 `mc_` 映射为 `mymc_`。

从 0.1.0 升级时，正常停止原 Cortico，再执行 `node client/migrate-lite-config.mjs <原部署目录/config.json>`，只迁移旧 `worlds.mymc_lite` 配置键，保留备份并拒绝覆盖冲突目标。0.1.1／0.1.2 已使用新键，无需重复迁移；不删除原身份、凭据、历史账本或个人记忆。历史账本保留，不推断不同引擎存储格式兼容。

## 账号与当前连接

login/client/log 面板保留。账号页“注册并进入游戏”通过公开 portal 首次接入，无需邀请码；按当前 Agent 名称建议 `ag_` 账号，后缀为 1–13 位英文、数字或下划线，不静默改写中文或长名字。撞名显示真实错误，不自动换身份。网站建号后私密绑定并启动同一个 World，不运行额外自主循环。

已有角色选择“登录已有账号”，沿用原账号和服务器密码；留空使用原凭据。高级入口可导入原官网私密身份，配置或身份属于另一角色时拒绝覆盖。私密目录仍为 `secrets/qiandengji-lite/`，credential 格式、绑定文件和 Windows DPAPI 不变。密码/API Key 不进入模型、普通工具、聊天、游戏任务队列或日志。

Lite 设置 `cfg.loginConfigFile=credentials.bindingFile`、`cfg.loginConfirmation='mc-auth-success'`。认证与自然重连由共享内核独占；Lite 不监听原生聊天、payload、bridge 或 bot，也不落盘 native 状态。仅使用 `console().invoke('connection','state',[])` 的公共当前读数，严格要求 `connection.ready && connection.worldReady && connection.serverLogin.authSuccessReceived`，并核对公共 server 的 host/port/username 与当前 Lite 实例／生命周期。缺读数、错账号、旧实例、停止或超过 5 秒的缓存都不 ready，不从 start 返回值、spawn 或网站建号推断已登录。

只读诊断 timer 同步 onboarding.nativeReady；停止立即释放 timer、清缓存并拒绝迟到响应。重复点击不重复接入；超时和未知结果保留原身份及请求号，只查询原请求。不会更换账号、重放任务或降低门槛。

## 工具与能力差异

仅暴露以下 14 项，声明和实际处理器使用同一白名单，原参数必填、枚举、分支和取消 signal 原样转交共享工具：

`mymc_do`、`mymc_scout`、`mymc_policy`、`mymc_goal`、`mymc_map`、`mymc_blueprint`、`mymc_check`、`mymc_view_map`、`mymc_bag`、`mymc_queue`、`mymc_blocked`、`mymc_stop`、`mymc_escape`、`mymc_server_info`。

不暴露共享核心其他工具，不额外添加 worker、persona、hidden 模型循环或技能施放。do/scout/escape 等身体动作须通过当前连接门禁；stop 始终允许交给真实队列取消，read 工具保留原始终态。队列受理不等于完成，终态、事件、附件和游戏证据不被文字替换或编造。

`mymc_server_info` 的 section 仍为 auth/profile/skills/players/help。当前公开 connection 接口没有 Lite 可消费的职业、技能和原生玩家名单读数，因此 profile/skills 返回 `null`，players 返回 `[]`。这与旧 Lite 的原生 RPG/payload 拦截不同：没有读数不猜职业、不从 skillIds 推导技能、不声称名单距离或可见性。可显式用普通 chat 步骤询问服务器游戏内帮助。将来只可消费明确公开且当前的读数，不能恢复私有协议访问。

Lite 只连远程服务器，不管理本地服务端；强制 external、关闭 startWithWorld/cheats，配置页仅有 host/port/username/version，拒绝旧 access、控制台、OP、存档和作弊管理调用。escape 只是保留共享工具，是否获准由远端服务器决定，Lite 不授予权限。

## 配套 Java 客户端

client 面板链接到 [官网当前下载页](https://mc.kangqiang.site/downloads.html#game-clients)。Java、Minecraft、模组、YSM 及模型链版本以官网当期配套为准，不从旧归档强制安装或降级第三方客户端。

真人沿用原用户名；观战使用 `xxx_eye` 规则账号（总长最多 16 位），权限由服务器分配。Agent 与 Java 客户端同时在线需不同账号，避免挤下线，不把私人 live 账号当模板。包不包含游戏二进制、第三方模组、模型、账号、配置、密码、私密身份、记忆或 Key；`client/README.md` 保留接入说明。
