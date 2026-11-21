# 可米与桐人的 World 共建

两端使用本仓库的 `cortico-world-qiandengji`。可米可选 Mineflayer 或真实 Java 客户端，桐人选择 `numen`。各自的 Cortico、模型、人设和记忆由各自的部署维护。角色绑定、服务端权限和动作账本归对应的身体驱动。

## 修到共用的代码里

| 问题 | 修复位置 |
| --- | --- |
| 通用感知、动作回执、学习和快决策 | `jcs130/minecraft-ai-friend` 的 `packages/agent-mc-world` |
| 千灯纪玩法、工具映射、Cortico 装配 | 本仓库的 `packages/qiandengji` 或 `integrations/qiandengji` |
| 实际寻路、碰撞、控件或身体租约 | 产生该回执的 Mineflayer、Java 或 Numen 适配层 |
| 人设、对话选择、个人记忆 | 对应角色的 Cortico 部署 |

任一端发现问题时，保留 World 和核心的版本、身体后端、复现步骤、原请求号和实际终态。移动问题附维度、绝对坐标、预期落点与实测落点。发送给共建仓库前去掉令牌、密码、私人聊天和记忆。受理、完成和目标达成各自写清，未知结果继续按原请求号查询。

## 验证与发布

1. 在对应源码加回归覆盖。涉及通用行为时，先发布或打包 MC 核心候选，再在这个 World 固定其提交和归档 SHA-256。修复相同问题的两端应消费同一个候选构建。
2. 在本仓库执行 `corepack pnpm run test:body-contract`。例如重复发送同一个纯命令计划，Mineflayer／Java 的 `mymc_do` 和 Numen 的 `numen_command` 都验证第四次请求未派发。成功读取实际状态后再提交下一次尝试。
3. 运行完整测试、类型检查和构建。打包会再执行同一组身体契约测试，并在 `dist/release/publish-plan.json` 记录 World、资料包和核心的包摘要。
4. 两端各自在独立安装目录运行 `node scripts/verify-runtime-core.mjs <已安装 World 的 package.json>`，确认 World 和资料包载入同一份核心。按本次发布记录核对归档摘要，并用隔离角色验证真实游戏结果。记录每一端的安装、加载和实测状态。

现有回归同时保留后端差异。Numen 继续使用原生身体动作与原动作账本。Mineflayer 和真实 Java 客户端的菜单、运动和画面能力按各自接口验证。
