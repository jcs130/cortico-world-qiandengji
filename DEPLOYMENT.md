# 构建、发布与部署

核心唯一源码与构建入口已迁至 `jcs130/minecraft-ai-friend/packages/agent-mc-world`。
本仓库根目录是 private 工作区，只构建服务器资料包和 Cortico 适配器。
迁移对照见 [core-repository-move](docs/core-repository-move.md)。

## 构建

1. 在独立副本准备并验证核心 `agent-mc-world-0.4.0.tgz`。
2. 将制品放入本仓库忽略的 `vendor/`；`pnpm-lock.yaml` 固定其完整性。
3. `pnpm install --offline --frozen-lockfile --ignore-scripts`，然后 `pnpm typecheck`、`pnpm build`、`pnpm test`。
4. 从 `packages/qiandengji` 打包服务器资料包，从 `integrations/qiandengji` 打包唯一公开 World。
5. 在外部目录安装三份实际 tgz，验证公开入口、SDK/MCP 和无隐式连接。

构建不再读取相邻核心源码。不要在现役部署目录构建，不覆盖私人配置或数据。
现代 viewer 的原始维护仓库仍是 `jcs130/mc-visual-console`；核心负责其明确锁定的发行制品。

## Cortico 规范

公开 World 包名保持 `cortico-world-qiandengji`，显示名“联机版我的世界”，API 5、
`cortico-world` 关键字、默认 WorldDefinition、独立 consoleClient/consoleStyle，
宿主 Cortico 为可选 peer。`adapters/cortico` 仍为 private 示例，不发布第二个 World。
安装包须通过自身 `dist/verify.mjs`，并在允许部署的阶段运行宿主原生扩展检查。

默认 `serverPack: none`；千灯纪包需显式启用。密码、模型端点、演出端点和账号都在私有配置中。
人格、目标、记忆由宿主保留，安装依赖不重写游戏账本。CLI 和包加载不自动连服。

## 发布顺序与现役边界

先发布核心，再发布服务器资料包，最后发布 Cortico World / DSH 适配器。
消费方固定经过验收的核心版本，升级时更新依赖和锁文件；不在启动时自动追逐 latest。
尚未发布的本地候选通过 tgz 安装；不能把构建成功写成 npm 发布成功。

当前仍遵守“先本地稳定运行，再发布”的约定。本次源码迁移完成离线验收，没有重启、
切换现役 Agent，也没有 npm 发布。此前现役的游戏效果不能用作本次新制品的联机验收。
源码提交、包哈希、安装验证、现役加载及实际游玩分别记录。
