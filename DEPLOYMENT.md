<!-- Owner: package.json, scripts/build-release.ts, src/config.ts, references/server-technical/index.json -->

# 在另一台机器部署千灯纪

## 安装 World

1. 准备支持 World API 5 的 Cortico（本包以官方 0.1.8 SDK 检查，推荐 Node.js 24）。
2. npm 发布版在控制台扩展页填写 `cortico-world-qiandengji` 安装。使用 GitHub 安装包时，按 README 的 pnpm 命令将 [Releases](https://github.com/jcs130/cortico-world-qiandengji/releases) 中的 `.tgz` 安装到 Cortico 的扩展目录，再重启 Cortico；扩展页不能直接填写压缩包地址。
3. 停用原 Minecraft World，在千灯纪页面填写服务器地址、端口、协议版本和账号，启用千灯纪。配置段为 `worlds.mymc`，示例见 [README](README.md)。
4. 游戏连接后打开画面链接。默认端口 7793，第一人称 `/`、第三人称 `/third/`、2.5D `/dungeon/`；多实例分配不同端口。

Agent 登录名自动补 `ag_` 前缀，填 `Alice` 时以 `ag_Alice` 登录，已有前缀不会重复添加。完整名称须为 4–16 位英文字母、数字或下划线。

安装包已包含游戏引擎与现代画面、Java 1.20.6 素材，不需要另外部署可视化仓库。`viewerAssetsDir` 默认解析当前安装包的位置，换机器或更新版本后不必沿用旧盘符。若配置中已有旧 `viewerAssetsDir`，删除该覆盖值后重载 World，或改为自定义素材的实际路径。内置素材匹配 Java 1.20.6；其他版本须单独核对协议和渲染资源。

本包通过普通 Mineflayer 玩家连接 Minecraft Java 服务端。千灯纪的技能、公会和试炼能力依赖服务端 `/mycli` 等协议；换服务器不代表这些功能自动可用。私有服务器地址与凭证由部署者填写。

## 模型选项

主 LLM 在 Cortico 模型供应商页自行选择。快速决策是可选的选择题服务，接口地址在「千灯纪 · 节奏与反射」配置，服务背后的模型可自行更换；空值、超时或无效响应不会关闭游戏规则和原始任务反馈。没有多模态模型时自动使用游戏结构化读数，网页画面照常显示；「现场观察方式」设为 `structured` 可强制使用读数。无需部署向量模型。完整说明见 README 的「模型配置与回退」。

## 更新画面和源码

共享可视化源码统一在 [mc-visual-console](https://github.com/jcs130/mc-visual-console) 维护，素材也在该仓库按版本提交。维护者更新 `release-sources.json` 的已验证提交后，重新构建并发布此 World；安装者更新 World 包并重载即可加载新引擎和素材。浏览器刷新后可根据 `viewer-client.json` 的 `browserBundleSha256` 核对画面版本。仅更新 Git 源码不会改变已运行进程或已经复制的静态目录。

源码构建步骤见 README。生成的 `engine/`、`dist/` 不在 Git 中，发布 `.tgz` 包包含它们；直接从源码链接安装时，须先完成构建。发布前构建、运行测试和类型检查，再上传安装包和校验和。`examples/github-release.yml` 是供维护者安装的自动发布工作流模板。

`release-sources.json` 同时锁定引擎源码和 `patches/` 中的客户端修复。构建时逐项检查并应用补丁，`engine/source.json` 记录补丁哈希；发布检查会核对这些记录，避免重建时遗漏装备、容器及掉落物的自定义名称修复。物品显示名称优先使用服务器实例名称，操作和数量统计仍使用原注册表 ID。

## 技术资料与角色迁移

`references/server-technical/` 是带来源、适用范围和更新时间的项目问答。需要给角色查询时，将整个目录复制到 `<部署>/workspace/references/server-technical/`；已有资料先比较版本，保留订正后的内容。Persona 提示只需保留入口：

```text
服务器和项目技术资料入口是 references/server-technical/index.json。观众问到时按需读取目录、搜索并分段查阅原文，用白话简短回答，保留来源与适用时间。
```

发布包只分发游戏和入服资料，原主播的模型、音色、记忆等个体快照不随包安装。该目录不是玩法活动索引，不填入 `references.indexFiles`，也不自动写入亲历记忆。

保留同一位角色时，私下迁移部署的工作区、记忆、提示词、配置与运行数据；这些内容不在发布包里。同步正在写入的数据前先停止源端相应进程。同一 Minecraft 账号由一台机器连接。语音、Live2D、模型服务和音乐由相应演出扩展管理，千灯纪 World 不包含这些服务或私人媒体。

迁移后核验连接、当前目标、实际任务终态、装备、网页人物与背包。安装检查和测试不会证明目标服务器已经连通，也不会启动真实角色代替这些核验。
