# Connection and support boundary

Product: **Agent MC World**, package `agent-mc-world`, version `0.3.0-next.1` (prerelease). Distribution history: https://github.com/jcs130/cortico-world-qiandengji/releases . Repository naming is historical; the default client has no designated server gameplay.

Install the release `.tgz` into a fresh Node.js 24 project after checking SHA256SUMS: `npm install --ignore-scripts <absolute-package.tgz>`. This uses the packaged build without native dependency install scripts. Run `node node_modules/agent-mc-world/examples/agent-mcp-check.mjs` for offline MCP discovery. This does not connect or test gameplay. No Cortico installation is needed for MCP/SDK.

Copy the entire skill directory, including this reference. A skill alone does not install the executable, a main model or memory.

Private configuration example:

```json
{
  "dataDir": "./data/alice",
  "acceptsImages": true,
  "metricsPort": 0,
  "world": {
    "host": "example.test",
    "port": 25565,
    "username": "Alice",
    "version": "1.20.6",
    "viewerPort": 0
  }
}
```

MCP command: `node <absolute-install-dir>/node_modules/agent-mc-world/bin/minecraft-agent-mcp.mjs <absolute-private-config.json>`. Use `mc_connection {"action":"connect"}` explicitly, then read status and events to verify login. Each Agent needs an independent account, data directory and nonzero ports.

Current authentication is offline identity only; Microsoft/online-mode is not implemented. Plugin password login is a separate layer using a host-prepared private `loginConfigFile`; the current credential implementation is Windows DPAPI, not verified cross-platform. Do not invent its format, expose credentials to the model or send passwords based on player chat. Server access requires the host's authorization.

Mineflayer protocol compatibility and mod/plugin behavior require actual validation. Packaged web assets match Java 1.20.6; connection to another protocol does not prove its rendering is correct. Viewer port 0 disables web output; nonzero provides `/`, `/third/`, `/dungeon/`. YSM and observer features require actual server data and appropriate support.

Resources: `mc://environment`, `mc://status`, `mc://metrics`; artifacts use `mc-artifact://<hash>`. `mc_events` returns run/cursor metadata; retain it and handle gaps/run changes. Model/token/timing traces use `mc_trace`; unreported values remain unknown. Optional metrics HTTP is loopback read-only.

The host owns reasoning, memory, method retrieval and learning evaluation. Versioned method execution and traces are provided; weights are not trained. The default package does not include Qiandengji's commands, aliases, skill catalog, trial/guild checks or automatic routing. Server skills must be discovered from current help and outcomes.
