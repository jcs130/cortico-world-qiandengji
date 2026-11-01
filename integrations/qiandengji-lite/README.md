<!-- Owner: src/index.ts, src/connection.ts, src/credentials.ts, scripts/build.mjs -->
# 千灯纪-lite

基于官方 Cortico 0.2.11 的 Minecraft World。动作、导航、合成、战斗、任务队列与游戏记忆沿用官方实现；差异是千灯纪接入流程、独立认证通道、只读信息和适用于远程玩家的界面。完整来源和每个文件的 SHA-256 见 UPSTREAM.json。

需官方 Cortico >=0.2.11 <0.3.0，建议使用 0.2.12 与 Node.js 24 LTS。官方 0.2.12 使用 Node 22.14 时会因缺少 `node:module.registerHooks` 而无法启动。0.1.2 已发布到 npm，可在扩展页输入 `cortico-world-qiandengji-lite@0.1.2` 安装，重启后启用 World `mymc-lite`。同一角色只启用一份 Minecraft 连接，先停用旧的 Minecraft／联机版 World。沿用原有 username、host、port 和协议版本；人设、Memory 和原游戏账本目录保持原样。配置段是 `worlds.mymc-lite`，游戏工具沿用 `mymc_` 前缀。原官方账本可使用原目录；其他引擎的账本保留作历史记录，不推断格式兼容。

正式版同时提供 npm 包和 GitHub Release 预编译包，两处 0.1.2 的归档字节一致。在 Cortico 的 `extensions/` 目录安装：

```sh
pnpm add cortico-world-qiandengji-lite@0.1.2 --registry=https://registry.npmjs.org/
```

首次创建 `extensions/` 时按官方文档放置独立工作区文件 `pnpm-workspace.yaml`（`packages: []`），避免把扩展装进 Cortico 主工程。WebUI 的 npm 包名输入框支持上面的包名；[GitHub 固定归档](https://github.com/jcs130/cortico-world-qiandengji/releases/tag/qiandengji-lite-v0.1.2)也继续提供，网页 URL 安装命令须在终端执行。

也可以下载 Release 的 zip，解压后在包目录运行 `pnpm install --prod`，再从 WebUI 扩展页选择该本机目录。官方 0.2.12 的本机目录校验只允许 ASCII 字符，中文用户名或下载目录会被拒绝；请改用全英文解压路径，或使用上面的 npm 包名。安装后重启原 Cortico 实例，保留原部署目录；打开“账号登录”完成下述注册或原账号登录，插件会配置并启动同一个 World。不要新建 Bot 或另一份自主循环。GitHub 附件保留固定版本；npm 安装可使用正常的包更新流程。

从 0.1.0 升级时，先正常停止原 Cortico，再在解压包中执行 `node client/migrate-lite-config.mjs <原部署目录/config.json>`，将旧的 `worlds.mymc_lite` 改为 `worlds.mymc-lite`。工具保留原配置备份，目标键已存在时拒绝覆盖。原服务器、用户名、密码文件、部署 data 和 Memory 目录不变，游戏工具仍为 `mymc_`；不要新建角色或删除原部署。全新安装无需迁移。

在“账号登录”页确认游戏账号名，点击“注册并进入游戏”。通过插件首次接入无需邀请码；插件生成并私密保存身份和游戏凭据，完成网站建号后自动配置同一个 World 并连接，不另建 Bot 或模型循环。名字优先建议使用当前 Agent 的名字；服务器账号使用 `ag_` 前缀，后缀为 1–13 位英文、数字或下划线。中文昵称不被悄悄改写或截断，请用户填写游戏账号名，人设与个人记忆不变。撞名时显示真实错误，不自动换一个名字重试。

已有角色选择“登录已有账号”，使用原账号与原服务器密码；密码留空会沿用已保存凭据。已有官网身份可以在高级入口导入原私密身份文件，再使用同一个登录按钮。原角色已配置时，本流程拒绝用另一个名字覆盖它。密码和 API 凭据不进入模型上下文、工具、聊天或普通任务队列。

“注册处理中”“游戏账号已就绪”“已提交游戏登录”“当前连接已认证且世界就绪”分别显示。只有当前连接收到系统 `MC_AUTH_SUCCESS`、角色实体有效且实际世界区块已加载，才开放游戏身体并显示入服成功。网络超时和结果未知保留原身份和请求号，只查询原请求，不换身份、重放建号或降低认证条件。关闭页面不会丢失已保存的身份；继续接入使用原请求。建连和自然重连继续从私密配置读取原凭据。

Lite 不管理本地服务器，不提供 OP、作弊、存档生成或服务器控制台入口；游戏权限由千灯纪服务器决定。通用官方 Minecraft World 的本地建服功能保持在原官方 World 中。配置页仅保留必要的接入地址、端口、账号和版本。

`mymc_server_info` 读取本连接认证、职业／技能最新观测、玩家名单和官网入口。职业／技能信息超过 15 秒就返回未知；玩家名单不声称距离或可见性。没有新增自动规划、模型循环、语音或隐式技能施放。

发行包包含所需的共享认证与服务器投影代码，不要求安装未发布的 SDK 候选包。构建依赖和锁文件记录其归档来源；生产游戏引擎仍是官方版本。Prismarine 向量统一锁定到其公共依赖范围内的 vec3 0.1.10，支持默认 pnpm 独立消费。需 Cortico >=0.2.11 <0.3.0、Node.js 22.15+ 或 24 LTS（建议 24 LTS）。世界扩展不包含 Minecraft Java 图形客户端或服务端插件。

## 配套 Java 客户端

Lite 的“Java 客户端”页提供 [官网当前客户端下载](https://mc.kangqiang.site/downloads.html#game-clients)，供真人游玩或另一个账号观战。按官网当前说明下载整合包并在自己的启动器中导入，Java、Minecraft、模组、YSM 和模型链版本以官网当期配套为准；不从旧 World 归档强制安装某个图形客户端或降级现役 YSM。

普通玩家使用原用户名；观战使用符合规则的 `xxx_eye` 账号（总长最多 16 位），旁观与相机权限由服务器分配。Agent World 和 Java 图形客户端同时在线时使用不同账号，避免把原连接挤下线。不要把本机保留的特殊 live 账号当作新用户模板。

World 包不包含 Java 游戏二进制、第三方模组、模型原包、账号、密码、私人身份文件、Agent 记忆或模型 Key。配套客户端在官网分别下载；`client/README.md` 保留接入说明。本次发布不等于第三方 ag_yiyilin 已部署，也不替代账号本人对真实入服结果的验收。
