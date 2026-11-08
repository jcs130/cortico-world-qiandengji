# 原可米客户端只读取证与14项验收回读

台账基准日：2026-11-08。本轮仅准备源码修复、取证工具和离线验证；**未访问原可米宿主、未加载候选，14项真实验收没有因此关闭**。

## 核对基线

| 层次 | 本轮核对结果 | 证据边界 |
|---|---|---|
| 客户端主干 / PR19 | `ad7cd5fb117299f296c3b18501f99c39f9653697`；北京时间11月8日11:21:35合并 | 原PR明确仅本地候选，没有发布或重新加载记录 |
| 主干声明的 World | `0.4.1-rc.71-preview.29` | 声明不等于进程实际加载 |
| 主干固定 core | `0.5.7-rc.160-preview.30`；归档 SHA256 `6c24a31ce4685d9a3c7833e44392be5335fcf9d62acf75a148bd36a05019247a` | 只核对消费端锁定输入，没有更新核心依赖 |
| 主干 server pack | `0.5.0-rc.50-preview.25`；女仆端口固定服务端提交 `29e2e6a9f6e68a8ee0e1a4d591fdf17770e1e8cf` | 本轮不改固定端口源码或它的校验摘要 |
| 服务端 PR117 | 核查时 open / 未合并；台账基线提交 `050eff173efcdb004cb22112c78139f75ff66138` | 不能把PR分支文档说成主干或正式运行状态 |
| 服务端最新 main | `49d0a081d7a5da3e07d8036386fa7a19b0078a70` | 后续考试交卷回读不代替女仆收件、主人格理解证据 |
| 原可米实际 World/core/server pack | **全部未知** | 当前是独立Linux工作区；没有原宿主进程、挂载、已配置远程执行端口或原游戏连接句柄 |

来源：[客户端PR19](https://github.com/jcs130/cortico-world-qiandengji/pull/19)、[服务端PR117](https://github.com/jcs130/minecraft-ai-friend/pull/117)、[原14项台账](https://github.com/jcs130/minecraft-ai-friend/blob/docs/acceptance-evidence-20261108/paper/docs/ACCEPTANCE_EVIDENCE_20261108.md)。npm `latest` 标签核对为World `0.1.2` / core `0.5.7-rc.47`，不据此推断全部预发布标签，也不据此覆盖原宿主安装。

## 复用路径及最小修复

`engine/maid-port.mjs` 已在认证过的原连接上关联 `requestId`、action、recipientUuid 和 maidId；支持 list/context/inventory/tasks。`engine/world.ts` 把原服务端 packet/system 回执交给 `MaidState.observe`，通知经现有 `emit → host.pushEvent` 投递；`requestFacts` 把角色摘要附入 companions 分区和 `decision.state.companionObservations`。这只是源码路径，不是原主人格收件证明。

本候选只修正服务器角色事实的关联：

1. `list` 已确认 alive 后，`context` 才返回恢复见证时，旧实现因 lifeState 不变漏发通知。现在该恢复 eventId 仍会在当前连接通知一次，保留原事件时间和“观察不等于实际复活时间”的语义；未加载仍为 unknown。
2. 角色摘要、死亡通知及生命状态通知保留 `sourceReceipt`：protocol/recipientUuid/action/requestId/sampledAt；恢复通知另带原 recovery eventId 与证据。查询ID与生命周期事件ID分开，不能互相替代。

没有新增模型循环、个人记忆或第二个游戏控制器。`MaidState.notices` 仍是有界的当前连接内存去重；**不能称为跨重启持久去重**。是否由原宿主更上层持久去重，以及是否实际进入主模型输入，仍须原始收件/持久游标/发送记录证明。本轮没有擅自给宿主加持久确认协议。

当前固定核心的 `mc_observe` 是空间查询，readout 的 selection/revision 是内容摘要，并不是 supervisor observationId。不能将摘要或 observed_at 改名填成同轮ID。若原宿主保存了自己的同ID观察，按原字段取证；否则C06继续缺证，需要核心与宿主采样契约一起核对，不能只改消费端伪造关联。

## 在原宿主执行

工具为 [original-client-evidence.mjs](../scripts/original-client-evidence.mjs)，仅使用 Node 标准库，无需安装候选包。Node 22+；在单独目录保存脚本，不覆盖现役World。原角色、记忆、装备、任务和连接保持原样。

**方式一：直接读取已存在的本机证据。** 复制[索引示例](original-client-evidence-index.example.json)，从原连接和原日志填写真实UUID、精确路径；未知字段留空，不按角色名字猜UUID。命令中的目录由现场选定，输出目录必须尚不存在：

```powershell
node original-client-evidence.mjs --index "D:/private-audit/evidence-index.json" --out "D:/private-audit/cormy-readback-r1"
```

可附加 `--host http://127.0.0.1:实际端口/` 读取已存在的原Cortico控制台；不扫描端口。仅GET status/extensions/runs/events/log/sessions六类既有接口，不调用panel RPC、工具、登录、模型、连接或任何动作。需要现有认证时，将值仅放在 `CORTICO_EVIDENCE_AUTH` 环境变量，使用原 `x-cortico-auth` 头；不写入索引或输出。401/404明确记录为 unavailable，不修改鉴权。

HTTP结果只作为 `private-host-history.json` 的有界尾部线索。它**不会自动证明原连接绑定、执行新查询或提供主模型实际请求**。需要时把既有原查询回执用索引 `queries.list/context/inventory/tasks` 的 `{file,line?,pointer}` 指向原记录。source可以是JSON，也可以是JSONL的明确1-based行；每个输入上限32MiB，超过时使用宿主已有的定向导出，不截掉半条记录充数。

**方式二：原进程已有可信调试/运维接缝时，复用它持有的原端口。** 导入脚本的 `sampleOriginalConnection`，传入已经存在的 `connection()`、原 `MaidPort.request`、原 `mc_observe` 读入口和 supervisor overview 读入口。实际句柄名由原宿主决定，本仓库没有证明一个可跨进程调用这些私有句柄的管理API。不要在另一个Node进程构造World或创建新MaidPort来冒充接上原连接，也不要为执行取证重启或热重载宿主。

```js
// 仅在能访问现有原对象的原进程执行；下列参数是能力契约，不是实际部署的变量名。
const {sampleOriginalConnection} = await import('file:///D:/private-audit/original-client-evidence.mjs');
const evidence = await sampleOriginalConnection({
  connection: existingConnectionReading,
  requestMaid: existingMaidPort.request.bind(existingMaidPort),
  readObserve: existingObserveRead,
  readOverview: existingSupervisorOverviewRead,
  maidId: exactOriginalMaidUuid,
});
// 通过该运维接缝原有的私有文件导出能力保存 evidence 为 original-probe.json。
```

`connection()` 必须返回原 recipientUuid、原连接generation/connectionId、原宿主runId；不能现造ID。probe仅顺序发一次list第一页、context、inventory、tasks；不翻页、不重试、不chat/brain选择/ack，不接管身体。原连接变化后停止后续派发，保留已取得的部分回执。observe/overview回调只能绑定原只读入口。查询产生的事实仍走原本的观察路径；probe不主动调用模型，也不暂停或唤醒角色来制造理解证据。没有原进程接缝时只用方式一，缺少的现场查询继续列缺口。

probe会保存两个原观察输出，但不修改其ID。不同轮次、缺ID、没有原UUID/名字/生命摘要、生命读数矛盾都不能通过配对检查。把同一自然观察轮的两份原记录分别用 `observe` / `overview` 索引选出；`fields` 可把原记录字段用JSON pointer映射成 observationId/runId/connectionId/recipientUuid/maidId/name/lifeState/health/maxHealth，不能填写替代值。

## 需要现场提供的字段

| 证据 | 现场回读要求 |
|---|---|
| loaded-components | 三组件实际加载路径、version、PID、启动时间、加载日志定位、制品SHA256；commit不能映射就null。索引manifest是磁盘证据；artifact必须是与加载回执摘要对应的原制品，工具另读原字节核对。目录版本相同不证明加载相同。 |
| maid-queries | 原完整响应和 requestId/recipientUuid/sampledAt/action/maidId。原协议查询ID叫requestId，不造queryId字段。inventory/tasks原生不带ownerId，工具保留该缺失，只可关联同一probe内原context的精确所有权；不填造ownerId。六槽与原背包slotCount/slot索引分别核对；截断、超时、未加载不解释成空。 |
| observe-pair | 两个原输出、相同原observationId/runId/connectionId、原UUID/名字/生命摘要。不用时间接近替代。 |
| lifecycle-chain | 每个既有death/recovery eventId分别选择 received、dedup、observation、modelInput、decision原记录；保留来源文件/行/JSON pointer及原字节摘要。 |
| main-input / decision | modelInput必须是已派发给main的真实input数组，含相同eventId与observationId，带原providerRequestId/decisionId；decision必须指回同一原请求、角色、连接、观察和事件。主会话存储、工具发出成功、run phase、outputTap或最终文本相似均不能替代请求输入。 |
| task / delivery | 原operationId/状态/goalCompleted、incoming类型/账号元数据、requestId/收件投递定位；仅既有记录，不重试未知操作或发新私聊制造证据。 |

`lifecycle` 每个entry以原eventId为索引，五个阶段均为 `{file,line?,pointer,fields?}`。`fields` 仅指定原记录的JSON pointer；规范化字段为 eventId/maidId/ownerId/runId/connectionId，以及 dedup.persisted/disposition、observation.observationId、modelInput.role/dispatched/input/observationId/decisionId/providerRequestId、decision.role/terminal/output/observationId/decisionId/providerRequestId。字段不存在就missing；本工具不替宿主补写记录。`linked`仅表示本地所选字节的结构关联成立，**从不自动判真实验收通过或语义理解正确**。C08仍须审查同一原自然回应。

输出为新私有目录：report.json、private-records.json、可选private-host-history.json、SHA256SUMS。每个源记录保留采集时间、来源和摘要；公开只放report中必要摘要。源文件不改，输出目录拒绝覆盖。Linux目录/文件为0700/0600，Windows应使用原私有审计父目录的ACL。已知密钥字段和模型思考正文被移除、保留摘要；未结构化的私聊仍可能存在，不能整包上传Git。原文件留在宿主，私有内容由现场按必要范围审查。制品摘要按完整文件流式读取，支持大于32MiB的旧完整包，最大2GiB；文件在读取期间变化则不通过稳定性检查。

## 14项回读结论

| 编号 | 本轮已验证的范围 | 仍缺的原客户端证据 / 另需授权 |
|---|---|---|
| C01 | 主干、PR状态及固定依赖已核；取证区分磁盘和加载回执 | 三组件加载路径/摘要/PID/启动日志均未回读 |
| C02 | 原连接四个只读入口存在；有限probe与错误/身份检查已离线验证 | 原list实际完整回执、原recipientUuid/查询ID/采样时间 |
| C03 | 当前/历史死亡/恢复/未加载语义已有回归；补恢复ID晚到通知 | 原context与原生生命账本对照；不能以当前查询制造旧恢复事件 |
| C04 | 取证保留完整inventory，检查六槽和原slot索引；没有物品转移 | 原装备和完整背包响应；空/截断/未加载要分开 |
| C05 | tasks只读复用；不将applied视为目标完成 | 原请求终态、当前任务和旧任务待复核关联；未知原ID只查不重放 |
| C06 | 配对校验拒绝不同ID/连接/生命摘要及缺失ID | 同一原observationId的mc_observe与supervisor overview，当前尚未取得 |
| C07 | 通知/摘要补sourceReceipt与恢复eventId；离线链校验拒绝拼轮、session冒充主请求 | 原始收件→持久去重→observationId→实际main input→decisionId全链；内存去重不算持久 |
| C08 | 工具保留自然输出定位；不自动判断“理解” | 同一原主人格自然回应的人工语义审查；新模型测试、移动跟随实测另需授权 |
| C10 | 沿用原私聊身份/公开消息边界；未改权限 | 原incoming类型/账号元数据及收件/投递关联 |
| C11 | 服务端台账的部分自然会话证据保持，不提升结论 | 原客户端requestId与接收证据；时间相近/发送成功不足 |
| C12 | 只读工具不切托管或驾驶权 | 原客户端离线→托管→暂停保存下线→原客户端恢复，须独立授权和方案 |
| C13 | 本轮模型调用0；未使用本人Key或真实设备 | 本人BYOK、手机、麦克风及耳听分别另需授权 |
| C14 | 未重放、取消或重启任何原操作 | 原待定请求/取消/重启暂停关联；主动取消或重启实测另需授权 |
| C15 | 候选源码/测试/工具可审查，原服务端87份归档结论保持 | 全部历史组件与官网/客户端的逐件前像/摘要未现场复验；不回灌角色、库存、墓碑或账本 |

沿用原编号，无C09。所有真实回读结论保持未完成；上述“已验证”仅限明确列出的源码、工具和离线回归范围。

## 本地验证

- World：61个文件 / 498项测试通过，其中新增3项MaidState回归、21项取证工具回归。首次未提供外置viewer资源时7项失败；提供仓库保留的真实1.21.1资源后完整重跑通过，没有跳过或改写资源检查。
- integration/web两项类型检查、完整构建通过；固定core归档保持原摘要。
- 独立安装三个固定候选归档，禁网并拒绝Cortico运行导入：SDK 37工具 / MCP 44工具真实内存传输目录读取、maid只读声明与packed sourceReceipt检查通过，phase保持disconnected。
- 官方Cortico0.2.7 / API6 dry mount：5项、0警告、0失败；独立API5兼容包构造33工具通过；独立WebUI四种provider/serverPack组合检查通过。均没有start，不代表原宿主13扩展实际加载。
- 独立core/server pack声明在无Cortico环境通过；API6 World声明提供真实官方宿主peer类型后通过，均未用skipLibCheck隐藏错误。API6 World的类型peer不是独立核心的运行依赖。
- 所有测试角色/事件/连接均为隔离fixture；本轮模型调用0、正式游戏连接0、发布/重载0。没有将模拟事件、源码存在或本地linked状态计入真实验收。

候选包只用于隔离验证，仍沿用主干声明版本；本次是源码审查，不发布同版本新包，也不覆盖既有归档或现役安装。发行版本与现场加载另行处理。
