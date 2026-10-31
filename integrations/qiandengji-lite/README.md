<!-- Owner: src/index.ts, src/connection.ts, src/credentials.ts, scripts/build.mjs -->
# 千灯纪-lite

基于官方 Cortico 0.2.11 的 Minecraft World。动作、导航、合成、战斗、任务队列、游戏记忆与原版面板沿用官方实现；差异是独立的服务器认证通道与只读服务器信息。完整来源和每个文件的 SHA-256 见 UPSTREAM.json。

在 Cortico 扩展页安装 `cortico-world-qiandengji-lite`，启用 World `mymc_lite`。同一角色只启用一份 Minecraft 连接，先停用旧的 Minecraft／联机版 World。沿用原有 username、host、port 和协议版本；人设、Memory 和原游戏账本目录保持原样。配置段是 `worlds.mymc_lite`，游戏工具沿用 `mymc_` 前缀。原官方账本可使用原目录；其他引擎的账本保留作历史记录，不推断格式兼容。

此候选版先通过 GitHub Release 提供预编译包，npm 尚未上架。在 Cortico 的 `extensions/` 目录安装固定发行附件：

```sh
pnpm add https://github.com/jcs130/cortico-world-qiandengji/releases/download/qiandengji-lite-v0.1.0-rc.1/cortico-world-qiandengji-lite-0.1.0-rc.1.tgz
```

也可以下载 Release 的 zip，解压后在包目录运行 `pnpm install --prod`，再从 WebUI 扩展页选择该本机目录。安装后重启原 Cortico 实例，保留原部署目录；在新 World 的配置里填原服务器和原用户名，然后启用。不要新建 Bot 或另一份自主循环。此发行方式按版本下载，不使用 npm 自动更新。

在“账号登录”页填写“服务器密码”。Windows 使用当前用户 DPAPI；其他系统使用权限 0600 的私密文件。密码绑定服务器、端口与角色，页面和模型工具不读回密码。先保存，再连接；之后每次建连、自然重连都从原私密配置读取。密码不经普通游戏任务队列，不作为环境提示、工具参数或事件正文投递。`/login` 和 `/register` 不由模型聊天工具处理。

“等待服务器登录提示”“已提交”“认证成功且世界就绪”分别表示不同阶段。只有当前原生连接收到系统 `MC_AUTH_SUCCESS`、角色实体有效、实际世界区块已加载，才开放官方游戏身体与任务入口。普通 socket 建连、spawn、排队、AuthMe 普通成功文字或旧连接成功均不能替代该判据。错误密码、缺失凭据、二步验证和确认超时保留区别；超时不推断密码错误。

官网功能复用千灯纪的官方接入助手。新账号需操作者主动提供专属邀请；已有角色使用原私密身份文件，查询沿用原请求号。启用官网登录时必须与当前服务器和用户名一致，不会替换角色或重建身份。官网 API 建号就绪不代表游戏认证成功。

`mymc_server_info` 读取本连接认证、职业／技能最新观测、玩家名单和官网入口。职业／技能信息超过 15 秒就返回未知；玩家名单不声称距离或可见性。没有新增自动规划、模型循环、语音或隐式技能施放。

发行包包含所需的共享认证与服务器投影代码，不要求安装未发布的 SDK 候选包。构建依赖和锁文件记录其归档来源；生产游戏引擎仍是官方版本。Prismarine 向量统一锁定到其公共依赖范围内的 vec3 0.1.10，支持默认 pnpm 独立消费。需 Cortico >=0.2.11 <0.3.0、Node.js >=22。世界扩展不包含 Minecraft Java 图形客户端或服务端插件。
