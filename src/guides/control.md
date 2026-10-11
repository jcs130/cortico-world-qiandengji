## 选择移动控制的层次

普通地面通路用 `goto`，已核对的短段飞行用 `flight`。需要直接试验方向、跳跃、斜飞或相对转头时，先读 `mymc_help {"skill":"control"}`，再使用 `mymc_do` 中的 `control`。是否可用以现役帮助为准；没有该技能时不要提交未声明的参数。

`control` 一步按 50–2000 毫秒的键，然后自动松键。`keys` 为 `forward/back/left/right/jump/sneak/sprint` 数组；相反方向不能同按。`yawDeg` 正数左转、`pitchDeg` 正数抬头，单位为度，均相对本步开始的朝向。它不计算路线，不挖方块，也不自动搭桥。飞行、寻路、战斗共享同一身体队列，不能同时接管方向。

`mode:"ground"` 使用普通物理，可以前进同时跳跃；服务器跃空产生的实际速度由游戏物理继续处理。施法方式和时长先查本人当次技能说明及回执，不把按 jump 当成已经释放跃空。持续悬停时先落地或选飞行模式。

`mode:"flight"` 要求服务端授予飞行许可，最多等 2 秒；`jump` 上升、`sneak` 下降，方向键按视角的水平朝向，所以可以向前同时上升。速度取服务端能力读数，不支持 `sprint`。每帧检查已加载的身体空间，碰撞、未知区块、权限撤回或服务端纠正位置时停止。控制结束仍可能悬停，落地需选安全支撑面并执行 `land`。

## 同单组合与反馈

在本人技能和周边空间已核实的前提下，这个例子展示施法后立即斜飞一小段，再落地；500 毫秒只用于说明按键时长，不承诺落到任何指定坐标：

```json
{"steps":[
  {"skill":"chat","text":"/mycli cast flight"},
  {"skill":"control","mode":"flight","keys":["forward","jump"],"durationMs":500,"needs":[1]},
  {"skill":"land","needs":[2]}
]}
```

闪现先用 `look` 面向已确认的安全落点，再发送当前说明中的施法命令；不猜额外坐标参数。空中闪现后以服务端新位置为准，后续动作从新起点执行。新观察才能决定的分支留到观察之后；已知连续动作一次排队，不每按一次键都重新等模型。需要验证目的地时给 `expect.near` 绝对坐标及 `within` 范围，不能拿按键已结束代替抵达。

回执报告实际起终点、位移、最远偏移、耗时和飞行状态。没有位移只证明这次输入未挪动，可能有碰撞、身体状态或操作前提问题，须结合现场读数判断。被中断的按键不会自动重放；先观察当前状态再改下一组。

## 自己改进方法

可以自主设计短动作序列，按当前工具契约提交，再根据真实终态修改。工作区有读写工具时，将方法、前提、版本、观察时间和来源回执存入 `methods/`，在 `methods/index.md` 留入口；失败记录保留具体失败条件，成功只注明已经验证的范围。下次先查索引、读相关方法，再用当前坐标、权限和状态改入参。源码修改与服务重启是否可用须看实际工具，方法文件的写权限不等于拥有这些接口。

### 带反馈的 JavaScript 方法

`mymc_script {name,code,params?,durationMs?}` 运行你编写的异步函数体，立即返回运行编号。先用 `validate:true` 检查语法；它不执行动作。`{runId}` 查终态与调用摘要，`{runId,call}` 展开一次完整 SDK 回执。直接在代码中使用 `params` 和 `mc`，无需导入。

- `await mc.state()` 读取 `{sampledAt,connectionGeneration,snapshot,flight,queue,combatActive,combat,method}`。位置、维度、生命、食物、背包与装备在 `snapshot` 下，快照可能为空。它不扫描方块；空间不明时通过 `mc.do` 的 `probe` 或 `observe` 步骤取得新的几何回执。
- `await mc.do(steps)` 通过同一执行器提交动作并等待该任务的真实终态，返回 `{accepted,taskId,kind,done,receipt,steps,state}`。先检查受理和各步结果，再用新 `state` 核对目标变化；`done` 不证明服务端委托完成。`needs` 只引用本组前面的步骤。
- `await mc.flightPlan(args)` 只读试算飞行路线，不能代替移动；参数沿用 `mymc_flight_plan`。

用条件、计算和有界循环根据回执选择后续步骤。已确定的连招或移动放在一次 `mc.do` 中；只有新回执才能决定的分支才拆开 await。未知地形、断线代际变化、维度改变、失败或未达目标时，返回已取得的证据供修订，不能在循环里原样重试。方法不提供导入、文件、网络或原始连接对象，源码与验证记录由工作区工具保存。

### 直接编排 Mineflayer 公共接口

先用 `mymc_script {api:"index"}` 读取现役入口，再用 `{api:"方法名"}` 按需查签名。可用 `bot` 与 `Vec3`，无需再设计一套挖掘、放置或按键 DSL。接口来自 Mineflayer 4.37.1；Worker 传输使所有 `bot` 方法都须逐个 `await`。只开放索引列出的接口，不能访问原始 bot、私有连接或任意属性。

- `await bot.blockAt(new Vec3(x,y,z))` 返回方块或未加载的 `null`。随后同步调用 `block.getProperties()` 查看真实状态；属性值保留上游类型，例如水源核对 `block.name === 'water' && String(block.getProperties().level) === '0'`，流水不能算水源。`block.position.offset(...)` 和 `plus(...)` 可计算相邻格。
- `await bot.inventory.items()`、`await bot.read('heldItem')`、`await bot.read('entity')` 读取当前物品实例和身体；注册表单项可读 `bot.read('registry.itemsByName.water_bucket')`。`bot.equip(itemOrNumericType,'hand')` 使用当前实例或数字物品 ID；旧槽位失效时重读库存。
- `bot.lookAt(point)` 后 `bot.activateItem()` 使用当前手中物品；`bot.activateBlock(block,face,cursor)` 点击参照方块的指定面和位置，保持当前手持物。返回只证明调用发出，须重读目标格、手持物和库存核验效果。
- `bot.dig(block)` 和 `bot.placeBlock(reference,faceVector)` 直接使用原生接口，不自动导航、选工具或补支承；放置目标为 `reference.position.plus(faceVector)`。保护、材料与服务端确认仍适用。
- `bot.setControlState(key,true)`、`bot.waitForTicks(n)`、`bot.setControlState(key,false)` 可组合短步、跳跃与观察；普通物理和碰撞继续生效，不证明已到目标。飞行沿用现有 `flight/control` 契约。

首次身体调用排入现有身体队列，程序持续持有身体直到结束。此后不要调用 `mc.do`，否则会等待自己的队列；需要混用时先完成 `mc.do`，或结束原生程序后另起方法。只读调用不占身体。完成、取消或救生/战斗接管时松开按键；死亡、断线、强制位置纠正、超时会撤销程序，不自动重放。调用回执保留采样时间、原生方法名和身体任务编号，展开 `{runId,call}` 可核对。按真实终态、世界变化和下一次检索复用评价方法，源码存在不代表学会。

一次最多 32 次串行 SDK 调用、16 组动作，默认含排队 60 秒、最多 120 秒。新的已受理身体任务、明确取消、死亡、断线或超时会撤销方法及它自己的未完成任务。方法运行中可交谈或做不接管身体的事情；需要换身体任务时先决定是否取消，避免打断自己写好的后续分支。已有单次动作足够解决问题时，直接使用普通工具。
