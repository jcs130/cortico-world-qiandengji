# Shared protocol and World integration

The mainline now retains the native chat audiences, proximity voice, memory-service identity binding, profession learning facts and skill invocation routes from the validated World rc.60 line, alongside the retained-body casting port from `0cf7d53`. The public candidates are `agent-mc-qiandengji@0.5.0-rc.43` and `cortico-world-qiandengji@0.4.1-rc.61`.

## Public entry points

Both `agent-mc-qiandengji` and `agent-mc-qiandengji/engine` export `ChatPolicyState`, `NativeRpgState`, `createQiandengjiCastTool`, `CombatSpells` and the validated native state parsers. Other hosts can keep their original connection, movement owner, model and identity.

```ts
import { createQiandengjiCastTool, NativeRpgState } from 'agent-mc-qiandengji';

const nativeRpg = new NativeRpgState();
// Only feed authenticated server-system observations, never ordinary player claims.
// Reset on connection replacement; native profile changes invalidate class-bound entries.
const cast = createQiandengjiCastTool({
  connection: () => currentAuthenticatedCommandPort(),
  blockedReason: () => currentAuthenticationOrDownedReason(),
  abilities: currentCombatObservationLedger,
  commands: currentObservedCommandCatalog,
  skillDetail: id => nativeRpg.skillDetail(id),
});
```

The optional `skillDetail` port preserves the advertised distinction between `/mycli cast` and other namespaces. A menu or waypoint invocation returns its current command and a failed/not-dispatched receipt; the port neither appends rejected cast arguments nor performs the alternative action. The normal engine delegates to this same implementation.

Sending, server acceptance, effects and goal completion remain different evidence. A local exception after a send is reported as an unknown outcome, with no automatic replay. Current chat range comes from `ChatPolicyState`; reconnecting clears it rather than borrowing the previous connection's policy.

## Dependency boundary

The neutral protocol package takes `agent-mc-world` as a peer. It does not install a second core. The World and the local development lock select the validated core rc.139 archive, SHA-256 `323860be2ad93c1fbeb911e695724743c3e9e17a3082510e5ea1dc3a0c7a4d0e`. A fresh consumer must resolve its own core and the neutral package's peer to the same physical package. This archive is a local candidate, not an npm publication.

The release guard validates the actual protocol and World manifests against the pinned archive, in addition to unit fixtures. Native server facts stay in the optional protocol package; generic execution remains in the independent core.

## Verification boundary

Run the complete World tests, both TypeScript projects, public API 6 and private API 5 builds, release guards and an independently installed SDK/MCP consumer. The packed consumer checks both export surfaces, command-route refusal, policy reset, query argument discovery, retained nearby voice and a disconnected MCP round trip. These checks do not create a game connection, invoke a model or prove live tactical improvement.

Source integration, packaging, publication and deployment are separate. Integrating this branch must not replace an existing runtime link, replay a previous request or imply permission for another reload.
