# cortico-world-qiandengji

「千灯纪」服务器的 Cortico World 扩展。World ID 保持 `mymc`，工具名为 `mymc_*`，避免已部署配置和笔记改名。游戏连接和动作执行复用 Cortico 的 Minecraft 引擎；扩展负责服务器规则、技能目录观察、快捷抵达与入塔装备检查。

现代网页画面源码位于独立仓库 [mc-visual-console](https://github.com/jcs130/mc-visual-console)，不是本 World 的一部分。区块、实体、物品栏、交易窗口、生命与天气等来自普通 Mineflayer 连接；千灯纪额外的魔力/冷却、施法成功事件和命名 NPC 美术使用独立协议或预设。普通 Minecraft World 可以只用前者。

这是供贡献审查的源码。当前 Cortico 公开版 `0.1.4` 尚未包含 `agentFriendProtect` 路径保护预检、`mc_cast` 和 `mc_combat_tactic`，因此本包目前需要包含这些能力的 Cortico 构建。启动前会检查所需工具和保护模块，发现缺失时明确报错。该能力进入上游并发布后，再确定本包的最低兼容版本。

## 契约

- npm 包名：`cortico-world-qiandengji`
- `cortico.kind: world`，`cortico.api: 5`
- `WorldDefinition.id: mymc`，配置段：`worlds.mymc`
- `host`、`username` 默认空；测试与构造不连接服务器
- 不包含服务器 IP、登录凭证、运行账本或 Minecraft 资源

## 开发检查

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

使用含保护预检能力的 Cortico 源码时，再从 Cortico 仓库运行 `pnpm check:extension <本目录>`。构造检查不会启动游戏连接。

## 部署

将本包作为 World 扩展安装，在部署配置中启用 `worlds.mymc`，填写服务器地址、端口、协议版本与普通玩家账号。先停用 `worlds.minecraft`，避免同一账号双开。环境提示词通过本包的 `src/ENV_PROMPT.md` 提供，服务端新增技能由游戏内 `/mycli` 回执观察、核验后使用。

在 Cortico 的 `extensions/package.json` 中加入本包的 `link:` 路径后，于 `extensions/` 运行 `pnpm --ignore-workspace install`，再运行 `pnpm check:extension <本目录>`。构建后的网页目录由 `worlds.mymc.viewerAssetsDir` 指定；它来自 `mc-visual-console` 的源码和本地 1.20.6 客户端资源。
