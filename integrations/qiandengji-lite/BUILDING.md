<!-- Owner: scripts/build.mjs, scripts/stage.mjs, pnpm-lock.yaml -->
# 构建和发行

官方源码来自 `cortico@0.2.11` 的固定 npm 归档。共享认证从 `agent-mc-world/client` 公开入口消费，服务器资料从 `agent-mc-qiandengji/portal` 与 `/engine` 公开入口消费；不从相邻源码目录抽取或修改实现。

当前构建候选 SDK 尚未发布 npm。按 package.json 的文件依赖准备 `../../vendor/` 下的两个归档，完整 SHA-256 在 UPSTREAM.json；构建器会校验。共享认证文件另外核对公开核心提交 `a45a4a40bd3097749fc24822a04b0a1e274747bd` 的 Git blob SHA `b15bea989ed3fc0ad192b4c8a0cf78e97db1a9c1`，保证所用认证实现与公开源码一致。发行目录内已嵌入这些小型公开接口，安装者不需要候选 SDK。

在本目录执行 `pnpm install --frozen-lockfile`、`pnpm build`、`pnpm typecheck` 和 `pnpm test`。`node scripts/check-loopback-login.mjs` 仅连接本机临时协议测试端，不连接真实服务器，不调用模型。

用官方 Cortico 的 `describe:extension` 与 `check:extension` 更新并验收自描述。随后执行 `pnpm release:stage`，从打印的发行目录运行 `npm pack`。发行目录去除构建专用 devDependencies，保留全部运行时依赖，适合 npm 包安装和解压后的本地目录安装。不要将开发目录直接当作预编译发行包分发。
