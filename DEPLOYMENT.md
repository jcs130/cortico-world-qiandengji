<!-- Owner: package.json, references/server-technical/index.json, src/ENV_PROMPT.md -->

# 在另一台机器部署

这套功能分布在四个仓库，使用下列分支。主框架和演出扩展是个人 fork。

| 仓库 | 分支 | 用途 |
| --- | --- | --- |
| [Cortico](https://github.com/jcs130/Cortico/tree/feat/cortiv-runtime-20261006) | `feat/cortiv-runtime-20261006` | 主框架、上下文、记忆、规划、Minecraft 执行器 |
| [cortico-world-vtuber](https://github.com/jcs130/cortico-world-vtuber/tree/feat/live-music-20261006) | `feat/live-music-20261006` | 演出、托管 IndexTTS 适配器、歌曲生成与播放 |
| [cortico-world-qiandengji](https://github.com/jcs130/cortico-world-qiandengji/tree/main) | `main` | 千灯纪技能、公会、试炼和按需玩法说明 |
| [mc-visual-console](https://github.com/jcs130/mc-visual-console/tree/feat/modern-viewer-source-1206) | `feat/modern-viewer-source-1206` | 网页渲染、背包、钓鱼、音效和遮挡显示 |

## 安装代码

准备 Node.js 24、pnpm 11.5 和 Python。Windows 上将四个仓库放在同一父目录，主框架目录命名为 `BOT`，满足演出扩展开发检查的相对路径：

```powershell
git clone --branch feat/cortiv-runtime-20261006 https://github.com/jcs130/Cortico.git BOT
git clone --branch feat/live-music-20261006 https://github.com/jcs130/cortico-world-vtuber.git
git clone https://github.com/jcs130/cortico-world-qiandengji.git
git clone --branch feat/modern-viewer-source-1206 https://github.com/jcs130/mc-visual-console.git
```

在 `BOT` 中执行 `pnpm install --frozen-lockfile`。在两个 World 扩展中分别执行 `pnpm install --frozen-lockfile`、`pnpm test`、`pnpm typecheck` 和 `pnpm build`。

在 `BOT/extensions/package.json` 声明两个扩展，路径改为新机器上的绝对路径：

```json
{
  "name": "cortico-extensions",
  "private": true,
  "type": "module",
  "dependencies": {
    "cortico-world-vtuber": "link:C:/your-root/cortico-world-vtuber",
    "cortico-world-qiandengji": "link:C:/your-root/cortico-world-qiandengji"
  }
}
```

在 `BOT/extensions` 执行 `pnpm --ignore-workspace install`。回到 `BOT`，用 `pnpm check:extension <扩展绝对路径>` 分别检查两个扩展，再执行 `pnpm start --new`，选择 `cortiv` 创建部署。模型服务、凭证和 World 开关在网页控制台配置。启用 `worlds.mymc`，停用 `worlds.minecraft`，填写服务器和玩家账号。

网页游戏画面按 [渲染器说明](https://github.com/jcs130/mc-visual-console/blob/feat/modern-viewer-source-1206/packages/modern-viewer/renderer-src/README.md) 用本地合法持有的 Java 1.20.6 客户端 JAR 导出资源；千灯纪画面选择 `--preset=qiandengji`。将 `worlds.mymc.viewerAssetsDir` 指向生成目录。

## 导入技术资料

`references/server-technical/` 包含服务器加入说明和项目问答，带来源、适用范围与更新时间。它使用已有的 `read_file` / `grep_files`，无需检索服务。这些 JSON 不是玩法 `reference_guide` 的活动索引，不填入 `references.indexFiles`。

从本扩展目录将整个 `references/server-technical/` 复制到 `<部署>/workspace/references/server-technical/`。已有同名资料时先比较更新时间和内容，保留已订正的版本。然后在控制台 Persona 页的存在方式提示末尾加入这一段并重载前缀：

```text
服务器和项目技术资料入口是 references/server-technical/index.json。观众问到时用 read_file 读目录、grep_files 定位并分段读取相关原文，再用白话简短回答。保留来源与适用时间，技术正文按需查阅。
```

模型和音色问答记录的是 2026-10-07 的部署快照；迁移后核对新机器实际配置再修改。服务器公开地址、基岩端口和精确版本范围尚未确认，不从旧客户端配置推断。

## 迁移当前个体与媒体

要保留同一位主播的记忆，私下复制原 `<部署>/workspace/`、`prompts/`、`worlds/`、`deployment.json`、`config.json` 与 `.env`；这些文件不在 Git。修改配置中的旧盘符、服务地址和资源路径，核对提示词覆盖文件是否需要订正。`data/` 包含运行账本和恢复状态，迁移时先停止源端的对应进程再复制，避免正在写入的文件不完整。

IndexTTS 模型服务、发音资源、参考音频、Live2D 资源、音乐模型、歌曲文件与目录配置分别迁移或重新安装。适配器代码随演出扩展发布，安装和控制台设置见其 [IndexTTS 说明](https://github.com/jcs130/cortico-world-vtuber/blob/feat/live-music-20261006/adapters/indextts/README.md)；制歌流程和所需模型见 [音乐说明](https://github.com/jcs130/cortico-world-vtuber/blob/feat/live-music-20261006/src/MUSIC_VOICE.md)。服务端点中的 `127.0.0.1` 指向新机器本身。

迁移完成后核验：主循环与 Minecraft 连接、现役目标和技能入口、一次实际任务的终态、一次语音、一次已有歌曲播放、网页人物和背包，以及观众档案检索。启用后台规划和快判断前，先确认各自模型服务可达。同一 Minecraft 账号由一台机器保持连接，切换时关闭源端连接。
