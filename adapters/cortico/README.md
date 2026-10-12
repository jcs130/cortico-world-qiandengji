# 联机版我的世界 · cortico-world-minecraft-agent

现代 Web 可视化、丰富的游戏信息，并通过扩展适配服务器技能和模组内容。

Independent Minecraft Java World for Cortico API 5, powered by `agent-mc-world`.
World ID: `mc`; configuration: `worlds.mc`; tools: `agentmc_*`.
The tool prefix avoids Cortico's built-in Minecraft tools. Original execution
receipts retain their `mc_*` names; those names map to `agentmc_*` in this adapter.
The independent SDK/MCP continues to expose `mc_*`.

Install **cortico-world-minecraft-agent** from Cortico's Extensions page, or:

```sh
cd extensions
corepack pnpm add --ignore-workspace cortico-world-minecraft-agent
```

Restart Cortico to load the installed version. Configure your server address,
account and protocol version, then enable this World. Disable other Worlds using
the same Minecraft connection first. This package does not modify the framework's
built-in Minecraft example.

The core is a regular dependency and is installed automatically. Cortico is
provided by the host; its optional peer declaration does not install another host.
The default configuration performs no game connection, performance endpoint
discovery or separate model inference. The host owns goals, personality and memory.

Modern visualization follows the same bot. Server-specific gameplay and the
performance bridge require explicit configuration. Java sound assets are optional
local client assets and are not redistributed in this npm package.

See the repository's `DEPLOYMENT.md` for migration, source attribution and tests.
