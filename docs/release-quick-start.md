# World 一键启动与发布

## 用户入口

在 Cortico 的扩展安装框输入 `cortico-world-qiandengji@next` → 按宿主提示加载扩展 → World「联机版我的世界」→「开始游戏」。新接入千灯纪粘贴网站连接中心生成的专属邀请，准备账号并确认就绪后进入游戏；已有角色或普通服务器展开手动连接，沿用原账号。真实进服与认证后打开网页观战。
当前公测要求 Cortico `>=0.2.2 <0.3.0` / World API 6，使用官方 0.2.7 验收。已经发布的版本见下表；候选改动不等于已发布。
模型复用宿主；普通服默认 `serverPack:none`、协议 `auto`，不需要独立客户端、Python 或额外快模型。
首次完整音频准备有进度、校验和缓存；网络失败可续传。高级配置仍可用。

### 独立 World 的接入方式

参考苔灯镇的 `cortico-world-dungeon@0.2.0` 及[生态箱 0.8.7-bugfix.2](https://github.com/zhiyuHD/cortico-world-terrarium/tree/52e69f87007c2a73cf7005bf27ed94bb7f75738a)：它们都通过 API 6 的定义、配置段、工具/事件自描述与 WebUI 面板接入宿主。苔灯镇在首次注册后保存长期凭据；生态箱明确认领后才建立独立地箱或水箱。安装不等于注册、认领或完成游戏目标。

| 接入环节 | 联机版我的世界 / 千灯纪 |
| --- | --- |
| 安装和入口 | 一个公开 World 包，一个「开始游戏」面板；无需单独部署模型或克隆源码 |
| 最少设置 | 明确选择普通服或千灯纪资料包，填写服务器与账号；不内置私人服务器地址、密码或角色 |
| 继续游戏 | 配置相同且已连接时复用当前账号和身体任务；连接失败仍可重试 |
| 状态 | 连接、服务器认证、可操作和目标完成分别核验；用实际观战链接进入画面 |
| 资料 | 按需读取 `mymc_help`、服务器指南与方法索引，不把全部规则永久附在每轮上下文 |
| 身份和数据 | `World=mymc` 的账号、位置、物品与回执归本世界；苔灯镇为 `dungeon`，生态箱为 `terrarium` |
| 记忆与媒体 | 宿主管人格和个人记忆；游戏经验由核心提供。跨 World 使用宿主存储的媒体句柄，并保留来源，不能把另一世界的道具或经历当成自己的当前状态 |

千灯纪继续消费共享 MC 核心；此接入页不再实现一份导航、背包或游戏 AI。默认不另开模型调用、自动启用试验功能或注册远程账号。

## 2026-10-25 当前公共 API 6 公测

| 包 | `next` 版本 | 本批状态 |
| --- | --- | --- |
| [agent-mc-world](https://www.npmjs.com/package/agent-mc-world/v/0.5.7-rc.86) | 0.5.7-rc.86 | 复用已公开归档，未重复上传 |
| [agent-mc-qiandengji](https://www.npmjs.com/package/agent-mc-qiandengji/v/0.5.0-rc.24) | 0.5.0-rc.24 | 本批发布 |
| [cortico-world-qiandengji](https://www.npmjs.com/package/cortico-world-qiandengji/v/0.4.1-rc.25) | 0.4.1-rc.25 | 本批发布 |

三个 npm 归档均实际下载并与测试候选核对 SHA256 和 npm integrity。全新消费者仅直接依赖公开 World，以版本号从官方 registry 安装，实际解析核心 rc.86 与服务器包 rc.24，共享同一核心实例；没有本地源码链接或 override。官方 Cortico 0.2.7 先生成自描述再检查扩展通过，自描述哈希保持不变；严格声明、SDK、离线笔记及真实内存/stdio MCP 协议通过。核心、框架、World 与可视化候选回归共 8,821 项通过、42 项可选跳过。

本版采用核心基础画面就绪通知、后台音频准备及取消机制；空白可选记忆身份在适配边界保留旧作用域，皮肤开关默认值保持核心原行为。核心的本地笔记是可选公开能力；宿主仍决定是否检索和采用。归档中的可视化固定于其来源版本，未包含之后的原生/Paper 运动帧与地形差量改动。

现役已加载 World rc.25 / 核心 rc.86，保留原 Persona 和私有框架；官方 0.2.7 的完整实例迁移尚有私有接口兼容工作。重载验收时原主循环暂停、Minecraft 停用，未进行真实游戏操作或长期表现比较。公测发布不表示这些效果已验证。私有 API 5 包没有发布，`latest` 保持原版本。

市场检查通过，保留官方索引对标签的覆盖提示；本批没有向维护者提交标签或认证申请。

## 2026-10-24 已发布的公共 API 6 公测

| 包 | `next` 版本 |
| --- | --- |
| [agent-mc-world](https://www.npmjs.com/package/agent-mc-world/v/0.5.7-rc.84) | 0.5.7-rc.84 |
| [agent-mc-qiandengji](https://www.npmjs.com/package/agent-mc-qiandengji/v/0.5.0-rc.21) | 0.5.0-rc.21 |
| [cortico-world-qiandengji](https://www.npmjs.com/package/cortico-world-qiandengji/v/0.4.1-rc.22) | 0.4.1-rc.22 |

三份公开归档均实际下载并核对 SHA256 和 npm integrity，与已测试候选一致；无本地文件依赖或 override 的独立消费者安装后，通过官方 API 6、自描述、公共声明、SDK 及真实 MCP 协议检查。发布前核心 2046 项、World 276 项测试通过，另有 1 项可选跳过。`latest` 保留原版本。

补验普通用户只安装 World、没有显式固定核心或服务器包时，实际解析服务器包 0.5.0-rc.22、核心 0.5.7-rc.84，官方 API 6、SDK/MCP 检查通过，并共享同一核心模块。该后续依赖由另一批发布，本记录不把它记为本批上传。

此版隔离 World 数据和事件归属，使用公共宿主接口；可选快决策明确配置服务地址及密钥变量。核心合入 AuthMe 登录提示/回执兼容与分阶段超时诊断。旧游戏数据需在“旧数据迁移”面板审核复制，原文件保留，详情见[API 6 接入说明](cortico-api6.md)。

用户在知悉标准宿主真实游戏验收尚未完成后明确授权发布 `next`。本次没有重载现役或执行游戏动作；安装检查不代表真实游戏效果和长期收益已验证。私有 API 5 兼容包没有上传 npm。

## 2026-10-23 已发布的公测版本

| 包 | `next` 版本 |
| --- | --- |
| [agent-mc-world](https://www.npmjs.com/package/agent-mc-world/v/0.5.7-rc.69) | 0.5.7-rc.69 |
| [agent-mc-qiandengji](https://www.npmjs.com/package/agent-mc-qiandengji/v/0.5.0-rc.13) | 0.5.0-rc.13 |
| [cortico-world-qiandengji](https://www.npmjs.com/package/cortico-world-qiandengji/v/0.4.1-rc.14) | 0.4.1-rc.14 |

三个公开归档的实际下载均与测试候选的 SHA-256 一致。发布前 2,155 项测试通过、1 项可选集成测试跳过；独立 SDK/MCP、官方 API 6 与私有 API 5 包验证通过。现役使用原账号完成重载、认证、自然游戏操作及局域网 Q5 播放验收。真实邀请建号只做了模拟 API 测试，没有替已有角色新建账号；这不代表任何游戏委托或自主学习目标已经完成。

本次提供网站邀请、私有身份续用和严格的建号就绪检查；核心提供通用 JSON 凭据字段读取与同连接登录恢复。新增入口不更换宿主模型、人设或记忆。`latest` 保持原版本；安装这次公测请明确填写 `@next` 或 `@0.4.1-rc.14`。npm 接受上传后可能仍需等待扫描和文件分发，版本号可见不能替代归档下载与全新安装验收。

## 2026-10-21 先前发布的公测版本

| 包 | `next` 版本 |
| --- | --- |
| [agent-mc-world](https://www.npmjs.com/package/agent-mc-world/v/0.5.7-rc.63) | 0.5.7-rc.63 |
| [agent-mc-qiandengji](https://www.npmjs.com/package/agent-mc-qiandengji/v/0.5.0-rc.10) | 0.5.0-rc.10 |
| [cortico-world-qiandengji](https://www.npmjs.com/package/cortico-world-qiandengji/v/0.4.1-rc.10) | 0.4.1-rc.10 |

三个包的实际 npm 下载均已与批准的归档校验一致，独立空消费者按公开版本安装后通过官方 API 6、自描述、SDK 与真实 MCP 调用检查。
World 的 `latest` 保持 0.1.2，核心和服务器包的 `latest` 分别保持 0.5.7-rc.47、0.5.0-rc.3；安装这次公测请明确填写 `@next` 或 `@0.4.1-rc.10`。
发布与现役加载分别记录，这次 npm 发布未重载正在运行的可米。

核心提供 10 个可读源码的工作例程，以及隔离练习、回执评价和采用的公开契约。模型和宿主自主选择是否使用；例程可调用、测试通过或练习结束均不能单独证明游戏目标完成或自主学习收益。当前仍按公测收集长时间游戏表现。

### 首次安装遇到下载超时

核心归档约 59 MB，2026-10-19 的本机完整下载实测约 70 秒。pnpm 11.5.0 默认的整次请求上限为 60 秒，当次独立安装因此超时；仅将安装请求上限改为 180 秒后，约 71 秒安装完成。不同网络和缓存条件下耗时会变化。
若扩展安装出现同样的 `The operation was aborted due to timeout`，在启动 Cortico 的同一用户下执行一次，然后回扩展页重试：

```text
pnpm config set --global fetchTimeout 180000
```

这个设置影响该用户的 pnpm 安装请求等待时间。本次验收只通过命令参数调整独立测试，没有修改现役或全局配置。
新版本 pnpm 已将该设置改为无进度超时，具体语义参见 [pnpm 请求设置](https://pnpm.io/settings/network#fetchtimeout)。

## 维护者准备候选

三个发行单元保持分离，源码、验证、打包、发布、现役加载分别记录。

| 顺序 | 包 | 本候选 | 来源 |
| --- | --- | --- | --- |
| 1 | agent-mc-world | 0.5.7-rc.86 | 复用已公开的通用核心归档 |
| 2 | agent-mc-qiandengji | 0.5.0-rc.24 | 通过 peer 复用宿主核心，公开中立配置入口 |
| 3 | cortico-world-qiandengji | 0.4.1-rc.25 | 官方 0.2.7 / API 6 验证，采用上述核心与服务器包 |

表中为当前源码版本；发行状态按上方发布记录及 npm 标签核对，不能只看源码版本号。本批发布与后续更新分别记录。

1. 核对远程 main、npm 当前版本与依赖，先在核心执行完整测试、类型和 `npm run build:release`，验证 `npm pack` 真实产物。
2. 将该确切核心 tarball 及 SHA-256 放入本仓库的 `vendor/core-source.json`，同步开发锁文件；不要复制另一份核心源码。
3. `npm run test:release`、`npm run typecheck`、`npm run build`。
4. 使用官方 Cortico 0.2.7 执行 `pnpm describe:extension <本仓库/integrations/qiandengji>` 和 `pnpm check:extension <同目录>`。
5. `npm run release:pack`：核对核心归档 SHA、打包两个消费端，输出 `dist/release` 的安装包、哈希和发布计划；不上传。
6. 在独立空消费者安装三份确切包，校验 SDK/MCP、官方 API 6 和私有 API 5；以虚拟服务器验证连接和默认配置，完成浏览器按钮与授权流程验收。

`release:pack` 只是打包检查，不替代上面的测试与实际安装。生成物不进入源码仓库。

## 经确认后发布

核心、服务器包与 World 均已有上述公开公测版本；后续更新仍需保持依赖齐全。
维护者使用自己的 npm 发布身份，依次在 `dist/release` 的 `publish-plan.json` 中取得确切文件名：

```text
npm publish <核心.tgz> --access public --tag next
npm publish <服务器包.tgz> --access public --tag next
npm publish <World.tgz> --access public --tag next
```

预发布先给 `next`，三个版本都能下载后按确切版本做一次全新安装。验收后再决定正式版本和 `latest`，不要把私有 API 5 包发布到 npm。
发布命令成功返回与实际可安装之间可能有 [npm 发布扫描](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/) 等待；核对真实版本、标签和归档校验值后再确认交付，不重复上传同一版本。
不要在发布脚本里保存 token、OTP、游戏账号或部署配置。`release:pack` 不执行 npm 发布、变更 dist-tag 或通知市场。

## Cortico 市场

发行包具备 `cortico-world` 关键字、API 6、当前版本 CHANGELOG、全部适用标签与离线自描述。
市场索引来自 npm；发布后需要立即刷新时，在 [官方索引仓库](https://github.com/Pal-AI-Lab/cortico-extensions) 提交标题为
`[sync] cortico-world-qiandengji` 的 issue。认证是独立申请，不等于发布或同步。

## 尚不能由离线检查证明的事

本次已验证 npm 实际下载、独立安装、外网完整音频准备与缓存复用。不同家庭网络中的微软登录、市场正式安装及长期游戏表现仍需要对应环境验收。
模拟 HTTP、回环游戏服务器、按钮测试和官方 dry mount 不能替代这些事实。发布准备也不授权中断现役可米。
