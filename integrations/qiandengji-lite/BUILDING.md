<!-- Owner: scripts/build.mjs, scripts/stage.mjs, pnpm-lock.yaml -->
# 构建和发行

0.2.1 仅从 `agent-mc-world/extension` 消费共享 MinecraftClientWorld、默认配置与 namespace 包装，从 `agent-mc-qiandengji/portal` 消费官网接入。不复制官方 Minecraft World、不修改 bridge、不读取私有 core 源码或 bot。

运行时依赖固定为 `agent-mc-world@0.5.7-rc.160-preview.142`、`agent-mc-qiandengji@0.5.0-rc.50-preview.108`；开发依赖官方 `cortico@0.2.17`。Mineflayer、pathfinder、viewer、vec3 由共享核心拥有，Lite 没有直接运行时依赖，不锁旧版本或降级。

开发的 `file:../../vendor/...` 引用、override 和锁文件已同步到经过实际 SHA256 核对的 preview.142 / preview.108 归档；发行声明使用版本号。构建会在已安装版本不符或包缺失时明确失败，不能通过私有 core 路径或去掉认证门槛绕过。本轮仅准备本地候选，尚未发布或连接真实服务器。

依赖已同步后，在本目录运行 `pnpm build`、`pnpm typecheck`、`pnpm test` 和 `node scripts/verify.mjs`。构建只编译 Lite 代码和浏览器 UI，不联网、不连接 Bot、不运行模型。describe.json 从实际共享工具声明的白名单生成，参数结构、必填项、枚举和分支保持原样。UPSTREAM.json 记录实际安装包版本、公开 package.json 与 entry 字节 SHA-256，不记录主源码绝对路径或私密凭据。当前 pending 元数据不是发行验证成功。用 Node 24 运行 `node scripts/build.mjs --inspect` 只刷新实际已安装公开包及白名单的诊断元数据，status 固定 pending，不生成发行产物、不通过版本校验。

单元测试使用假 World、EventEmitter 和临时私密 fixture。`node scripts/check-loopback-login.mjs`、`node scripts/check-loopback-ready.mjs` 使用本机临时 TCP 回环的假公共 connection 状态，不启动 Mineflayer、真实游戏服务器或模型。真实 MC_AUTH_SUCCESS 的解析和原生登录回归由共享内核负责，Lite 测试只验证公共读数消费与门禁。

`pnpm release:stage` 先验证已构建产物，然后仅写入本 Lite 目录的 `release-staging/`，已有目录时拒绝覆盖。发行内容采用显式文件白名单，保留两个 SDK 的运行时依赖；不打包源码、旧 World 副本、dev file 路径、配置、secrets、账号、账本或根工程。stage 不安装、不运行 Bot、不自动发布或 Git commit/push。
