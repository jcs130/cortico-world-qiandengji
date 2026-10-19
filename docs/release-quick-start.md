# World 一键启动与发布

## 用户入口

安装 `cortico-world-qiandengji` → 按宿主提示加载扩展 → World「联机版我的世界」→「开始游戏」→ 地址、账号 →「保存并启动」→ 网页观战。
模型复用宿主；普通服默认 `serverPack:none`、协议 `auto`，不需要独立客户端、Python 或额外快模型。
首次完整音频准备有进度、校验和缓存；网络失败可续传。高级配置仍可用。

## 维护者准备候选

三个发行单元保持分离，源码、验证、打包、发布、现役加载分别记录。

| 顺序 | 包 | 本候选 | 来源 |
| --- | --- | --- | --- |
| 1 | agent-mc-world | 0.5.7-rc.47 | 核心 main c53f76cc 后的共享地址解析与资源准备 |
| 2 | agent-mc-qiandengji | 0.5.0-rc.3 | 中立服务器包 |
| 3 | cortico-world-qiandengji | 0.4.1-rc.3 | API 6 World 与快捷启动 |

1. 核对远程 main、npm 当前版本与依赖，先在核心执行完整测试、类型和 `npm run build:release`，验证 `npm pack` 真实产物。
2. 将该确切核心 tarball 及 SHA-256 放入本仓库的 `vendor/core-source.json`，同步开发锁文件；不要复制另一份核心源码。
3. `npm run test:release`、`npm run typecheck`、`npm run build`。
4. 使用官方 Cortico 0.2.3 执行 `pnpm describe:extension <本仓库/integrations/qiandengji>` 和 `pnpm check:extension <同目录>`。
5. `npm run release:pack`：核对核心归档 SHA、打包两个消费端，输出 `dist/release` 的安装包、哈希和发布计划；不上传。
6. 在独立空消费者安装三份确切包，校验 SDK/MCP、官方 API 6 和私有 API 5；以虚拟服务器验证连接和默认配置，完成浏览器按钮与授权流程验收。

`release:pack` 只是打包检查，不替代上面的测试与实际安装。生成物不进入源码仓库。

## 经确认后发布

npm 上核心与服务器包目前尚无公开版本；不能只发布 World 而留下缺失依赖。
维护者使用自己的 npm 发布身份，依次在 `dist/release` 的 `publish-plan.json` 中取得确切文件名：

```text
npm publish <核心.tgz> --access public --tag next
npm publish <服务器包.tgz> --access public --tag next
npm publish <World.tgz> --access public --tag next
```

预发布先给 `next`，按确切版本做一次全新安装。验收后再决定正式版本和 `latest`，不要把私有 API 5 包发布到 npm。
不要在发布脚本里保存 token、OTP、游戏账号或部署配置。当前步骤没有执行 npm 发布、变更 dist-tag 或通知市场。

## Cortico 市场

发行包具备 `cortico-world` 关键字、API 6、当前版本 CHANGELOG、全部适用标签与离线自描述。
市场索引来自 npm；发布后需要立即刷新时，在 [官方索引仓库](https://github.com/Pal-AI-Lab/cortico-extensions) 提交标题为
`[sync] cortico-world-qiandengji` 的 issue。认证是独立申请，不等于发布或同步。

## 尚不能由离线检查证明的事

首发 npm 下载、外网首次资源下载、不同家庭网络中的微软登录、市场正式安装及长期游戏表现需要发行候选环境验收。
模拟 HTTP、回环游戏服务器、按钮测试和官方 dry mount 不能替代这些事实。发布准备也不授权中断现役可米。
