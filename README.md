<!-- Owner: patches/minecraft-method-await.patch, src/adapters/cortico.ts, src/agent/runtime.ts, src/mcp/server.ts, scripts/build-host-runtime.ts, src/railway.ts, src/guides/railway.md, patches/minecraft-railway-observation.patch, src/mounted-look.ts, patches/minecraft-mounted-look.patch, src/chat-provenance.ts, patches/minecraft-chat-provenance.patch, patches/minecraft-procedures.patch, scripts/verify-release.mjs, package.json, scripts/build-release.ts, release-sources.json, patches/minecraft-idle-context.patch, patches/minecraft-combat-decision.patch, patches/minecraft-storage-correction.patch, src/world.ts, src/config.ts -->

# cortico-world-qiandengji

「千灯纪」的独立 Cortico World 扩展。填写 Minecraft Java 服务器地址、端口和账号即可连接，内置现代网页画面、技能目录观察、公会进度与试炼装备检查。World ID 为 `mymc`，工具名为 `mymc_*`，保留已部署配置和笔记的命名。

安装包包含游戏引擎、第一人称／第三人称／地下城 2.5D 画面及 Java 1.20.6 素材，无需安装者另行构建可视化。共享渲染源码由 [mc-visual-console](https://github.com/jcs130/mc-visual-console) 维护，发布包按 `release-sources.json` 中的提交构建。区块、实体、装备、背包、交易、生命与天气来自 Mineflayer；魔力、冷却和施法事件需要服务器提供相应协议。玩家外观依实际皮肤与服务端数据渲染，不把预设当作真实外观。

宿主使用 Cortico World API 5；开发检查使用官方 `cortico@0.1.8` SDK。改进后的 Minecraft 引擎随包分发，不要求宿主使用个人 fork。完整状态快照、按结果结束模型轮次及认知任务类别属于可选宿主扩展：支持它们的框架可使用这些信息，官方 0.1.8 仍使用原有事件和认知接口。World 不替换宿主的记忆、Persona 或模型调度实现。

自主程序可用 `mymc_script {api:"index"}` 按需发现 Mineflayer 原生接口，并用 `bot` 与 `Vec3` 编排方块属性读取、当前手持物交互、挖掘、放置和短步。接口保留原生名称与坐标语义，共用身体队列、保护、材料及库存确认；程序终态不等于世界目标完成。完整约定见 `mymc_guide {topic:"control"}`。只有首次出生后才向动作层交付游戏连接，避免把登录等待阶段的临时实体当作真实现场。

Mineflayer 4.37.1 乘坐状态下会暂停步行物理刻，也暂停原生转头等待。兼容修复使乘坐时的原生 `look` 立即同步朝向，再继续方块或实体交互；保持站立时的转头插值，不发送乘客位置或改变矿车运行规则。

铁路用 `mymc_guide {topic:"railway"}` 按需查询选线、路基、站台、轨形和试乘知识。`mymc_railway {bounds:[xmin,ymin,zmin,xmax,ymax,zmax],start:[x,y,z],end:[x,y,z]}` 直接只读已加载方块，按端口朝向和接合高度给出连通分量、路径、开口和动力轨供电读数，不占身体队列。默认返回有省略计数的示例摘要，保留完整计数与指定路径，回执最多 7500 字符；检查接头时缩小范围，可加 `detail:true`。超大的明细会要求分段重查，不截断路径或冒充完整列表。它不自动设计、施工或给美感评分；样本内连接、发车成功、载人往返与画面观感分别核验。读数可供角色自己的可编辑方法使用，不宣称角色已自主学会。

自主方法可保存为 `cortico.procedure/v1` 工件，用 `mymc_script {procedure:{handle,revision},params,validate?}` 按固定版本组合执行。World 只读取选中的工件和依赖，保留既有调用、身体租约与取消约束，终态通过持久化附件交回真实调用链。检索、评价、采用与回退由支持该协议的宿主 Persona 提供；官方 0.1.8 宿主仍可使用内联 `code` 程序。完整程序化记忆不会全量加入模型上下文，测试通过也不代表部署中的角色已学会方法。 SDK 调用返回 Promise；未 await 就读取结果字段会明确报错，指出接口名称与缺少的等待。

## 其他 Agent 接入

本项目也可作为 **Minecraft 具身 Agent Harness** 使用，覆盖执行、反馈、方法制品、现代化画面、OBS 和技术分析。系统 1 游戏快战术在 World；系统 2 和记忆由接入 Agent 提供。[能力边界与指标接入](docs/harness.md) 列出可用部分和待验证项。

当前独立试用包为 **v0.2.0-next.3**，含新版网页与 OBS 游戏层、MCP 元数据入口，以及聚焦阶段、反应速度和失败摘要的紧凑运行概览。[安装与验收指南](docs/agent-mcp.md) 给出完整步骤。

本包从 **v0.2.0-next.1 试用版**起提供独立游戏运行时与 MCP stdio 入口，复用同一套 `mymc_*` 工具、脚本、快战术和执行回执。接入说明见 [Agent MCP](docs/agent-mcp.md)，包括安装包、离线检查、账号与密码登录、MCP 配置和首次验收；各层归属见 [架构边界](docs/architecture.md)。v0.1.2 安装包不含此独立入口。

## 安装与配置

npm 发布版可在 Cortico 控制台的扩展页填写 `cortico-world-qiandengji` 安装。扩展页不接受网页或 `.tgz` 地址；使用 [GitHub Releases](https://github.com/jcs130/cortico-world-qiandengji/releases) 的安装包时，通过 pnpm 安装到宿主的扩展目录：

```powershell
pnpm --dir 'C:\Cortico\extensions' add 'https://github.com/jcs130/cortico-world-qiandengji/releases/download/v0.1.2/cortico-world-qiandengji-0.1.2.tgz' --ignore-workspace
```

将示例目录替换为自己的 Cortico `extensions` 目录；若设置了 `CORTICO_EXTENSIONS_DIR`，使用该目录。目录尚不存在时先创建。安装后重启 Cortico，扩展页会列出千灯纪。Git 仓库源码尚未包含生成的引擎和画面，源码安装前须按下方步骤构建。

在「千灯纪 · 连接」填写服务器地址、端口和账号，并启用本 World。默认不自动连接。已有 Minecraft World 时先停用它，避免重复连接。对应配置示例：

```json
{
  "worlds": {
    "minecraft": { "enabled": false },
    "mymc": {
      "enabled": true,
      "host": "mc.example.com",
      "port": 25565,
      "username": "ag_YourAgent",
      "version": "1.20.6",
      "viewerPort": 7793
    }
  }
}
```

Agent 登录名自动补 `ag_` 前缀：填 `Alice` 或 `ag_Alice` 都以 `ag_Alice` 登录。完整名字最多 16 位，仅用英文字母、数字和下划线；不带前缀的部分最多 13 位。本 World 不包含主播演出、TTS、写歌或放歌服务，这些由独立演出扩展提供。

画面随游戏连接启动，可从控制台打开，也可访问运行机器的 `http://127.0.0.1:7793/`，第三人称为 `/third/`，2.5D 为 `/dungeon/`。多实例应分配不同 `viewerPort`。`viewerAssetsDir` 默认指向包内素材；只有使用自定义素材时才需要修改。内置渲染素材匹配 Java 1.20.6；连接其他版本时需另外验证协议并提供匹配素材，不能据连接成功宣称画面完全一致。推荐 Node.js 24。

Java 1.20.6 画面支持当前玩家连接实际收到的玩家／NPC 头顶文字气泡、服务器粒子和地图照片，安装包带匹配的原版中文字体。私人气泡沿用服务器受众，销毁或切换世界后清理，网页重连不回放已到期对白。其他版本与未支持的文字格式见[共享渲染器说明](https://github.com/jcs130/mc-visual-console/blob/main/packages/modern-viewer/renderer-src/docs/text-display-bubbles.md)。

控制台「千灯纪 → 挂载」提供观察者客户端和玩家客户端的状态与独立启停。观察者需配置本机游戏目录与匹配版本；正常关窗后可从此处重新启动。完整 Java 客户端与模组由使用者自行安装。

## 模型配置与回退

主 LLM 在 Cortico 的模型供应商页配置地址、密钥和模型，再设为当前模型；World 不绑定模型或供应商。没有主 LLM 时仍有底层战斗／生存反射，但不会自动获得完整的目标规划与对话能力。

- **快速决策模型可选**：在「千灯纪 · 节奏与反射」配置 `decision.endpoint`（受阻建议）和 `idle.endpoint`（空闲小动作）。该地址对应的服务决定模型，须接受 `{state, questions}` 并返回 `{answers}` 的选择题／评分协议，不能直接填写普通聊天补全地址。默认未启用、地址为空。
- **小动作的现场依据**：空闲选择只读当前可见目标、最多两项目标摘要、近期任务终态及 20 秒内的最多三条玩家聊天／姿态观察；目标与回执分别标明意图和过去结果。可看向实际可见的近期交流者，远处私聊不会凭空产生视线目标，摄像机账号不作社交对象。正常身体任务、战斗、使用物品和真实容器仍优先；迟到结果或已换人的观察目标作废。选择日志记录请求长度与往返耗时，不写入长期记忆。
- **没有快速决策服务**：受阻的原始执行回执照常投递，主 LLM 继续规划，战斗和生存规则照常运行。已启用的小动作在服务缺失、超时或响应无效时，从当前允许的候选中轮换；忙碌或场景变化时取消，不打断正常任务。
- **视觉能力可选**：当前 LLM 在供应商配置中声明支持图片时，`mymc_visual` 将真实截图直接返回该模型；纯文本模型、能力未声明或 `visual.mode:"structured"` 时，返回带原采样时间的游戏结构化读数。截图失败也回退到可用读数。没有现场读数则明确报告未知，不假装看见。网页可视化继续运行，无需单独部署视觉模型。
- **向量模型**：本次不增加向量模型或数据库依赖，记忆仍由宿主 Persona 管理。

配置图片能力后应按实际模型验证；配置声明与模型实际能力不一致时，需要订正供应商配置。视觉回退无法代替图像审美判断，精确方块与碰撞用 `mymc_scout` 的原生体素／射线查询。

## 契约

存取请求因窗口关闭或访问条件不符而首次拒收时，失败回执允许主模型在同轮修正步骤；原队列保留。同一现场下原样重复已否定请求时，仍沿用已有重复拒收机制结束该轮。该调度提示需要支持按结果结束轮次的宿主，官方宿主仍接收原始失败回执。

`combat` 与环境提示声明 `queue:"now"` 的即时补给和撤离用法，默认提交继续等待战斗并替换旧待办。引擎须支持首步 eat/flee/surface 的低血控制权交接及进食主手保护；消费结果仍以实际库存、生命与效果回执为准。

`combat` 说明按世界持久化的战术设置、按需读取的战斗观察与方法验证；`skills` 说明本人熟练度、实际学习或加点入口及调整后的回读。观察账本不自动成为亲历学习结论。

`combatDecision` 从游戏时钟直接读取血量、敌我关系、怪物类型、目标、位置、视线、当前攻击目标、无命中时长、魔力和技能冷却，异步请求快模型。主模型推理期间已有攻击和导航继续。默认关闭；启用后的 `shadow` 仅记录建议，`act` 可执行有已知成本、冷却与 `intent` 说明的现有法术规则。`allowEngage` 允许空闲时接敌，`party` 范围须有服务端队伍与攻击目标证据；`allowMovement` 允许近战久未命中时选择有落脚和净空的短步或撤退，仍让出进食、逃生、出手相位和脚本的控制权。低血自保保持即时执行。

原版无法提供的队友血量、RPG 队伍关系和怪物攻击目标标为未知；记分板同队不自动算作队友。服务端可按 [战场补充协议](references/battlefield-protocol.md) 单播实际读数。`mymc_combat_tactic {"battlefield":true}` 读取这条有界输入；连接变化、读数或可用动作改变时丢弃旧选择，发送命令仍须核对服务端终态。

`flight` 指南说明施法前的整段只读路线试算、累计耗时与许可时长预算，以及施法、分段飞行和落地的同单编排。

`control` 指南说明通用引擎提供的短时方向、跳跃、相对视角及许可内斜飞，按实际回执修订动作组合。现役引擎必须在 `mymc_help` 中声明该技能；扩展不伪造飞行许可，不把工作区方法写权限解释为源码修改权限。
立即施法仍用 `mymc_cast`；需要保持执行顺序的限时移动使用 `mymc_do` 的完整命令和依赖步骤。
动作可用性以当前 `mymc_help` 为准，发送命令不证明服务端已授予许可。

完整当前读数沿用通用引擎的快照采样。`requestFacts()` 同步读取带时间的缓存，并映射对应的
状态事件类型；代理不支持该能力或尚无有效读数时返回 `null`。Persona 可用该完整读数替代旧增量链。
引擎提供完整分段 `parts` 时，扩展保留稳定键并逐段映射工具名，技能索引另成一段；位置或采样时刻变化不会要求重放整份目录。
千灯纪在完整读数中附加 `/mycli` 技能入口、分类索引与分页查询进度；完整说明由
`mymc_skills {"id":"..."}` 按需展开。目录按服务器持久化，只有收齐所有页和声明的项目数
才标为完整并移除旧项；命令元数据改变后，旧详细说明失效。目录不证明本人已学会或当前可施放。
目录保留服务端声明的各类 `/mycli` 命令，包括队友传送、支援传送与传送点；不能因命令不是 `cast` 而漏掉项目。
`mymc_cast` 只按同 ID 的 `cast` 命令校验必填和可选占位符；无参数命令拒绝多余坐标。
其他命令通过 `mymc_do` 的 `chat` 步骤按原语法发送；不会自动改写成不存在的施法别名。
未知、可变参数或无法解析的语法交给服务端裁决，目录更新后使用新参数约束。
`src/guild-progress.ts` 保留服务端接单与验收原文及其观察时间，同一委托的进度更新继续携带该证据。
进度同时读取状态查询和交付时的“还需完成”回执，按观察时间更新，允许实测数下降；进度不是累计捐赠量或完成证明。
在办看板按同一委托名称补充精确 ID；切换、交付或确认无在办委托时清除旧要求，重载按服务器与账号恢复。
看板描述、台词和请求次数不能替代验收回执。

`mymc_messages` 按频道和关键词查询收到的聊天、公告、登录说明与私信，按最近收到时间排序。`list/search` 默认列出未标记考虑的短条目，`read` 按 id 展开原文，`review` 明确标记已考虑的 ids；该标记不代表已回应、执行、学会或完成。完整当前读数只附加简短消息索引，正文按需读取。观察按服务器与账号隔离，最多保留 256 条，系统消息相同原文合并收取次数；超出范围在查询结果中明确说明，更早原文仍须查宿主事件账本。动作栏 HUD 和自己的发言回显不进入索引。
系统聊天按正常批次计时投递，单独收到公告也能进入下一次决策；它不会取消当前模型调用或身体任务。私信保留现有投递方式，发言人名字不证明管理员权限。登录阶段的技能目录同样进入技能观察缓存。

Mineflayer 的聊天正则可能把方括号公告识别为玩家。聊天身份因此保留原包频道与识别依据：有发送者 UUID 时须与玩家表中的名字一致；无 UUID 的格式化聊天须匹配已列出的玩家，并标为 `player-list-format`。未知名字保留系统原文或私信原文，不建立玩家身份；发出的私信确认不把收件人当作发言人。插件直接派发、没有关联原包的 `chat/whisper` 事件标为 `explicit-chat-event`。这些来源都不证明队友、管理员权限或消息内容真实。

常驻环境提示提供权限、保护和事实核验边界；试炼、收纳、飞行、社交等细则通过
`mymc_guide {"topic":"..."}` 按需读取。省略 `topic` 返回主题索引。原版动作参数由
通用引擎的 `mymc_help` 提供；技能最新说明仍以服务端目录、本人状态和回执为准。
地点与箱子归属按服务端名称和坐标核对；试炼入口实体箱、个人奖励窗口与公会公共箱分别说明，新人装备交付由社交指南按实际库存和接收证据核验。
战斗指南按实际穿着、主手、副手与随身装备比较防护、附魔和耐久，换装后复核装备栏；持有护甲不代表已经穿戴。

- npm 包名：`cortico-world-qiandengji`
- `cortico.kind: world`，`cortico.api: 5`
- `WorldDefinition.id: mymc`，配置段：`worlds.mymc`
- `host`、`username` 默认空；测试与构造不连接服务器
- 包含版本化渲染素材；不包含私人服务器地址、登录凭证、运行账本、角色记忆或完整客户端 JAR

## 开发检查

构建来源固定在 `release-sources.json`。准备 Node.js 24、pnpm 11.5 和两个固定提交的源码目录：

```bash
git clone https://github.com/jcs130/Cortico .sources/cortico
git -C .sources/cortico checkout <release-sources.json 中的 cortico.commit>
git clone https://github.com/jcs130/mc-visual-console .sources/viewer
git -C .sources/viewer checkout <release-sources.json 中的 viewer.commit>
pnpm -C .sources/cortico install --frozen-lockfile
npm ci --prefix .sources/viewer/packages/modern-viewer/renderer-src
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm typecheck
npm pack
```

也可用 `CORTICO_SOURCE_DIR`、`MC_VISUAL_CONSOLE_DIR` 指向已有的固定提交检出。构建会拒绝来源提交不符或受跟踪源码有未提交修改。`engine/` 和 `dist/` 是生成产物，不重复提交源码；它们包含在发布安装包里。`verify:release` 核对来源、必要文件和浏览器包哈希，`prepack` 会阻止不完整发布。

从完整 Cortico 仓库运行 `pnpm check:extension <构建后的本目录>` 可再检查扩展契约。构造检查不会启动游戏连接。

`examples/github-release.yml` 提供自动构建和上传安装包的工作流模板。需要自动发布时，由具备工作流写权限的维护者将它放入 `.github/workflows/`；手动发布同样先完成上述构建与检查，再上传 `.tgz` 和 SHA-256 校验和。

## 部署

迁移、资料导入和画面更新见 [DEPLOYMENT.md](DEPLOYMENT.md)。服务端新增技能从游戏内 `/mycli` 回执观察、核验后使用。`references/server-technical/` 随包分发，由部署者导入文件工作区；World 不写入 Persona Memory。

引擎构建会重建生成目录 `engine/`。现役进程使用源码目录时，在独立构建目录完成构建和验证，再按获授权的重载安排更新现役文件。
