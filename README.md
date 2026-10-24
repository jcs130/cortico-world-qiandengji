# 联机版我的世界 / 千灯纪资料包

**普通用户入口**：安装扩展后，打开 World「联机版我的世界」的「开始游戏」。新接入千灯纪可粘贴网站连接中心的专属邀请链接，准备账号后进入游戏；已有角色展开「已有服务器 / 手动连接」，沿用原账号。
模型沿用宿主配置。首次完整音频准备会显示进度并缓存。[简明说明](integrations/qiandengji/README.md) · [发布步骤](docs/release-quick-start.md)。

本次公测发行 `cortico-world-qiandengji@0.4.1-rc.22`，依赖核心 `^0.5.7-rc.84` 和服务器包 `^0.5.0-rc.21`；已通过官方 Cortico 0.2.6 / API 6 检查及公开归档全新安装。使用 `@next` 可跟随后续公测更新。此次未重载现役，标准宿主真实游戏效果另行验收。

本次公测增加[千灯纪网站接入](https://mc.kangqiang.site/agent-api.html)：身份与请求号先保存在本机，结果未知时查询原请求；只有 `state=ready` 且 `gameAccountCreated=true` 才连接 `micro.kangqiang.site:25702`（Java 1.21.1）。核心按服务器与账号作用域读取私有身份文件中的游戏密码，保留有限重登录和服务端认证确认机制。邀请不会迁移已有角色，模型、人设和记忆沿用宿主。本地归档包含原有观战资源，音频沿用首次准备与缓存机制。

**首要项目是通用核心包 `agent-mc-world`**，唯一源码位于 [minecraft-ai-friend/packages/agent-mc-world](https://github.com/jcs130/minecraft-ai-friend/tree/main/packages/agent-mc-world)。本仓库是核心的消费端，维护 Cortico API 6 薄 World 适配器和可选千灯纪服务器扩展；宿主兼容版本以公开子包的 `peerDependencies` 为准。

通用感知、动作、导航、背包与合成、脚本与技能库、游戏记忆、学习评估和快决策状态/候选契约，先在核心实现并公开导出，供不同大模型和宿主通过 SDK/MCP/公开接口复用。本仓库负责接口映射、配置和生命周期，以及显式选择的服务器协议；不单独维护可米专用的通用游戏能力。

## 包与依赖

| 包 | 职责 | 核心引用 |
| --- | --- | --- |
| `agent-mc-world` | 通用感知与身体、SDK/MCP、动作/合成、脚本与技能库、游戏记忆与学习证据、快决策契约、可视化接入 | 首要项目，在 MC AI Friend 维护 |
| `agent-mc-qiandengji` | 千灯纪协议、技能与魔力报文解析、服务器物品用法和玩法资料 | 版本见子包声明；本地归档来源见 `vendor/core-source.json` |
| `cortico-world-qiandengji` | 唯一公开 Cortico World，显示“联机版我的世界” | 核心 + 可选服务器资料包 |
| `dsh-minecraft-agent` | DSH 宿主适配器，独立仓库 | 同一个核心包 |

核心不依赖这些宿主或资料包。通用可视化仍由 `jcs130/mc-visual-console` 维护。
Cortico 内置示例世界保持独立，不在这里修改。

拍照、镜头和可选体素场景由 Minecraft 核心提供。图片、视频和歌曲制作统一由独立的 [AIGC 创作室](https://github.com/jcs130/cortico-world-aigc) 负责，双方不互相依赖或调用私有方法。Persona 从共享记忆选择人物参考，宿主传递实际素材句柄；生成完成后再交演出或聊天 World 展示。普通截图不需要配置生成模型，旧照片与历史任务仍可查询。

### 可选真实 Java 客户端身体

`worlds.mymc.provider: "java-client"` 使用核心的真实客户端桥；原主会话、人格和模型不变，也不会启动 Mineflayer 或额外模型循环。配置 `javaClient` 的实际 UUID、服务器、私有连接文件、账本目录、控制器 ID 和租期。SDK 的 `MymcAgentRuntime` 与 Cortico World 使用同一身体。只有明确启用 `javaHostControl.enabled` 才由宿主接管并续租；控制丢失后停下，不能自动重新夺取控制权。

操作以 `mymc_operations`、`mymc_capabilities` 和 `mymc_script api:compatibility` 的实际回执为准。两个身体复用 SDK、JavaScript 方法和动作身份；原生寻路、采矿、合成等能力按已安装桥与能力矩阵核对，不能从旧版限制或工具名称推断完整等价。默认保留队列，显式 append/now 可用。原记忆本和服务器消息继续查询；旧目标、公会和试炼资料通过 `mymc_history` 读取，不自动重放。

真实画面来自同一身体的帧缓冲。显式指定 `javaClient.viewerPageFile`（mc-visual-console 的 native-client 页面）和 `viewerPort` 才开启本机只读网页。未配置不扫描端点。旧部署的 Mineflayer 环境提示词覆盖需先备份，再换成 `ENV_PROMPT_JAVA.md`；不要混用两种身体的执行说明。

通用战场、战术程序、候选验证、能力状态、战斗回执与可选快决策服务已归入核心。
普通 Minecraft 接入可直接使用，无需开启千灯纪资料包。
本仓库 `engine/combat-*` 与 `host/*` 的历史入口仅转出核心公开接口；
千灯纪技能名、指令格式、试炼与自定义报文仍由显式服务器包适配。
详见核心的 [组件边界](https://github.com/jcs130/minecraft-ai-friend/blob/main/packages/agent-mc-world/docs/component-boundaries.md)。

## 构建本地候选

候选版本以 `integrations/qiandengji/package.json` 为准，源码候选与 npm 发布分别记录。先在 MC AI Friend 的核心包目录完成构建并打包，将
与根 `package.json` 和 `vendor/core-source.json` 版本、文件名、SHA 一致的核心归档放入本仓库忽略的 `vendor/` 目录；开发锁文件校验该安装包。
公开子包依赖仍使用版本号，发布后消费者正常安装 npm 包，无需克隆主项目或本仓库。
根工作区只安装开发入口，`vec3` 覆盖与锁文件保持一致；公开子包在构建和打包阶段单独处理。

```sh
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
pnpm test
cd packages/qiandengji && npm pack
# Cortico World 的发行目录为 integrations/qiandengji；仓库根目录 private，不发布。
```

不要在现役部署目录构建；使用独立源码副本。构建只编译服务器扩展和宿主适配器，不复制、抽取或修补核心源码。
`adapters/cortico` 是私有的通用装配示例，不额外发布第二个 World。
公开包使用 API 6 的 `webUi` 和离线 `describe.json`；自描述从实际工具声明生成，默认不连接游戏或模型。
旧 API 5 宿主仅使用单独准备的私有兼容包。发布次序、检查与回退见 [发布说明](docs/release-0.4.1-rc.2.md)。

## 连接与服务器能力

安装不会自动连接服务器。通用模式默认 `serverPack: none`；千灯纪需显式选择 `qiandengji`。
模型地址、快决策及演出端点均由宿主显式配置。服务器自动传送默认关闭；普通 `goto` 保留行走语义。
密码按服务器和账号作用域保存于本机私有配置。

历史使用文档在 `docs/`；其中迁移前目录描述以 [核心迁移说明](docs/core-repository-move.md) 为准。
MIT 许可和上游来源保留；核心来源记录随核心迁入主项目，Git 历史仍可追溯。
