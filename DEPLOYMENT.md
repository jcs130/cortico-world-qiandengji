# 构建、发布与部署

本包是 `agent-mc-world`，0.4.0 起默认入口为中立 SDK。Cortico API 5 的可选 World ID 为 `mc`。安装与离线检查见 [Agent MCP](docs/agent-mcp.md)，本次拆分见 [能力迁移](docs/framework-decoupling.md)。推荐 Node.js 24。

## 独立构建

`core/` 是本仓库维护的源码。`release-sources.json` 固定自有核心路径与共享 viewer 制品哈希；Cortico 来源只保存在 `provenance/`，不参与构建。不读取 Cortico checkout，不抽取示例世界，不应用框架补丁。

在全新的发布目录运行 `node scripts/clean-check.mjs <新目录绝对路径>`，使用已缓存依赖离线安装、构建、检查公开类型并测试。普通构建运行 `pnpm build`。构建输出仅写发布副本，不能覆盖现役目录、配置或数据。

`build.mjs` 编译独立核心与客户端，并校验、解包随源保存的通用 viewer。`build-types.mjs` 生成公开声明依赖图，调用方无需安装或类型检查 Cortico。`verify-build.mjs` 核对源码、运行时、声明、viewer 素材的哈希和默认入口；`npm pack` 前必须通过该检查。发行包不包含千灯纪扩展或历史示例世界入口。

打包后在新目录只装生产依赖，运行随包 `examples/agent-mcp-check.mjs`，并用实际安装目录检查 SDK 类型与入口。开发目录通过不能代替发行包通过。检查 MCP 时不连接服务器。

## 可选装配

Cortico 用户安装 `cortico-world-minecraft-agent`，千灯纪用户安装 `cortico-world-qiandengji`。两者自动安装精确版本的 `agent-mc-world`；Cortico 由宿主提供，声明可选 peer。两包都采用 API 5、`cortico-world` 搜索关键字、默认 WorldDefinition 和独立控制台产物。核心没有 World manifest，也不进入插件搜索结果。

执行 `node scripts/build-extensions.mjs` 生成两种插件。通用插件配置为 `worlds.mc.*`，千灯纪保留 `worlds.mymc.*`。两者共享互斥资源名，不能同时使用同一账号。服务器插件只依赖公开的 `agent-mc-world/extension` 端口，不读取邻接核心源码。必须用实际 `.tgz` 的生产安装目录运行 Cortico `check:extension`，不能只检查仓库目录。

千灯纪扩展在 `integrations/qiandengji/` 单独维护；需要显式配置扩展模块与参数，通用安装不会带入。演出桥需要明确模块、端点与相同 bot 身份；没有扫描旧端口的回退。来源、许可证与旧数据迁移方案随包保存。

## 发布与上线门槛

源码、构建、离线验收、提交、发布、部署与实际游玩分别记录。对发布副本依次执行完整测试、类型检查、三个包的 `npm pack`、包级离线安装与 API 5 检查，再发布核心和两个插件。插件固定同次核心版本，因此先发布核心；npm 认证失败时保留制品与校验值，不能记作发布成功。

0.4.0 的部署记录见 `docs/release-0.4.0.md`。原始停止期间的离线验收记录保留为历史证据。实服效果与用户后续批准的启动验证单独记录。
