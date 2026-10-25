## 0.4.1-rc.30

- Consume core rc.93 verified opening-spell choices and server-message provenance. Keep gameplay implementation in the public core.
- This is a loading candidate; game participation, damage, escape and speech effects require fresh live validation.

## 0.4.1-rc.29

- Consume core rc.92 verified opening-spell choices and server-message provenance. Keep gameplay implementation in the public core.
- This is a loading candidate; game participation, damage, escape and speech effects require fresh live validation.

## 0.4.1-rc.28

- Consume core rc.91 message batch reads, precise selector correction and scoped query-result revisions. No duplicated inbox implementation or autonomous retry loop.

## 0.4.1-rc.27

- Consume the rc.90 core candidate combining current task-progress facts and PR #10 control-pattern statistics.
- Preserve unknown motion for swimming, flying, directional movement and view changes; no movement or goal policy is added by this adapter.
- This is a local loading candidate; package publication and natural game effects remain separate.

## 0.4.1-rc.26

- Consume shared core rc.89 and its self-contained current task progress facts; original history and terminal receipts remain independently retrievable.
- Provide concrete defaults for the optional local MineDojo index and retrieval mode, and regenerate the tool self-description from the actual current core contracts.
- This local candidate is not published or loaded; provider token, cache and latency effects require a separately authorized live trial.

## 0.4.1-rc.25

- Consume the verified public core rc.86 archive and align development checks with official Cortico 0.2.7 / World API 6.
- Retain base-viewer readiness, cancellable background audio preparation and reviewed storage migration from rc.24.
- Preserve legacy notebook scope unless a stable owner ID is explicitly configured. Mineral queries and external memory services remain opt-in.
- Adapt optional core settings to Cortico's concrete WebUI defaults: an empty notebook ID retains the old scope, and the default skin toggle retains automatic stored-skin behavior.
- This source candidate has not been published or loaded into a production deployment.

## 0.4.1-rc.24

- Consume shared core rc.85: a verified base-viewer handoff lets the body start while full audio preparation continues; reviewed ledger copies use bounded parallel I/O without removing integrity checks.
- Own, cancel and settle background audio preparation; show incomplete/error state and allow audio-only retry without reconnecting or replaying game work.
- Return unverified preparation state before the engine is mounted instead of calling the absent child process.
- This is an unpublished source candidate; production loading and final rendered/audio behavior require separate validation.

## 0.4.1-rc.23

- Consume server pack rc.22, which requires the host's shared Agent MC World core through a peer dependency instead of independently resolving another engine version.
- Keep the rc.84 core and existing API 6 runtime behavior. This packaging update does not reload a deployed World.

## 0.4.1-rc.22

- Pin shared core rc.84, including upstream AuthMe login-receipt compatibility and phase-specific timeout diagnostics.
- Use the current public Cortico World API 6, public cognition fields and explicit optional decision-service configuration. No private provider registry or debug WebSocket dependency.
- Isolate data under the World namespace; offer reviewed, hash-verified copy-only migration and retain originals. Hold gameplay while legacy adoption is pending.
- Normalize event ownership, pending views, returned event envelopes and UI storage keys without rewriting player text, dimensions or evidence identities.
- Preserve dynamic host capabilities across observation wrappers. Local practice cancellation discards late replies without claiming remote cancellation.

## 0.4.1-rc.21

- Pin shared core rc.82: reconcile an already received complete server correction when a click does not match prediction, fail that operation without replay and restore later inventory access. Missing/partial and unsent receipts remain fenced.
- Native Mineflayer 1.20.6/1.21.1 denial regression and detached packed runtime validation.

## 0.4.1-rc.20

- Pin shared MC core rc.81: preserve received item instance names in player gestures and detached script equipment snapshots; unknown names remain unknown.
- Site observations distinguish occluded/unloaded targets from air, retain current self-contact separately and cache unknown geometry reads within the call.
- Public observations entry and native staircase/slab descent, optical glass and physical collision acceptance. No server rules or model configuration changes.

## 0.4.1-rc.19

- Pin shared MC core rc.80: matched quality/SDK-work evaluation, Pareto recommendations and explicit optimization usage.
- Practice compare/stage reuse the scoped original method library, validate exact source and preserve parent/selected versions. Unknown save results are reconciled rather than replayed.
- Expose a bounded practice continuation index in request facts; isolated results remain separate from actual-world execution and adoption.
- Optional reflection errors retain safe stage diagnostics and continue independent evaluation without replaying trials or inventing lessons.
- Includes prior compatible combat choices, proactive engagement and optional journey detours.

## 0.4.1-rc.18

- Pin shared MC core rc.79: one categorical fast request can select an explicit step-plus-ability combination, with fresh checks and separate component receipts.
- Observed journey discoveries wake the host with the original task/destination and optional safe-checkpoint detours. No forced stops, fixed village routine or hidden model loop.
- Reuse existing perception and bounded recent notification indexes; current context retains a short attributed reading.
- Decision details retain the original distribution, per-component application results and later observations.

## 0.4.1-rc.17

- Pin shared MC core rc.78: proactive combat uses the actual pursuit pool before injury, pauses resumable work and restores its checkpoint; enemy watching is reserved for explicit authored programs.
- Namespaced entity rules match native vanilla IDs; default choices retain ongoing attacks and expose available spells.
- Decision activity joins request/result identity and uses the public core display contract to distinguish candidates, refusal, keep and accepted dispatch; target relations remain attributed to request samples.
- Includes upstream bounded voxel continuation, paged observations and trustworthy MCP receipts. No model ownership or credential changes.
- Declare the newly visible view-distance default as Mineflayer's existing 12 chunks so API 5/6 configuration validation remains complete.

## 0.4.1-rc.16

- Pin Agent MC World rc.75 with bounded original failure details and the engine-free execution reading SDK. Existing World tools, server rules and model ownership stay with their current owners.
- Terminal evidence retains task identity, recovery conditions, truncation and client-visible changes. No implicit action, model call or goal completion is added.
- Keep generation-directory annotations in full help while omitting them from compact request declarations; validation fields and the original generation contract remain available.

## 0.4.1-rc.15

- Pin Agent MC World rc.72 with the shared engine-free context reading SDK; preserve existing World tool, event and server contracts. The private Bot consumes the same packed core.
- Inherit upstream partial-stow reserve and offline-validation disconnect fixes. Source/packaging acceptance is separate from live gameplay results.
- Preserve the official portal helper's pinned LF bytes on Windows checkout; retain exact viewer resource byte rules.

# integrations/qiandengji：薄适配与资料包变更

## 0.4.1-rc.14

- 开始页面接入千灯纪官网邀请：准备账号、查询建号结果、续用身份文件及明确开始连接。
- 邀请流程复用官网 SHA-256 锁定的注册工具；先持久化身份和请求号，pending/unknown 查询原请求，连接前重新核验 ready 与 gameAccountCreated。
- 游戏入口使用官网确认的 micro.kangqiang.site:25702 / Java 1.21.1；旧账号与已连接身体不会因网站接入准备而切换。
- 中立服务器包公开网站接入客户端；核心 rc.69 支持直接读取私有 JSON 凭据字段，避免复制游戏密码。

## 0.4.1-rc.13

- Consume shared core rc.68: a scoped login can renew on the existing connection after trusted authorization revocation.
- Require fresh server confirmation before game operations resume; stop duplicate submissions, immediate revoke/confirm loops, password rejection and two-factor challenges.
- Keep the recovery in the shared SDK/MCP engine. Host session, goals and personal memory remain with the host.

## 0.4.1-rc.11

- Consume shared core rc.67: all vanilla shulker boxes participate in container discovery, historical records, interaction and navigation protection.
- Keep upstream compiled child processes independent of the development TypeScript loader and stop retries after an exact-cell placement denial.
- Distinguish a satisfied travel destination from an actually dispatched server command.
- Verify public API 6 consumers with Cortico 0.2.5 and retain the private API 5 compatibility check.

## 0.4.1-rc.10

- Consume core rc.63, including the upstream method terminal wake correction and explicit Harness² practice service.
- Add background method practice through host-owned task cognition and shared source-version, physics, evidence and game-memory contracts.
- Keep isolated eligibility separate from source library validation, real execution, review and adoption.

## 0.4.1-rc.9

- Consume independent core rc.60 through the same public SDK/MCP and World contracts.
- Expose the shared ten-item work/mobility routine catalogue, bounded underwater routing and real vehicle/gliding input capabilities without copying them into this adapter.
- Preserve recorded-goal revision evidence and native terrain readiness checks from upstream.
- Keep complete API 6 declarations and validate the actual core resolved from each packed consumer.
- This source candidate is not published or loaded; models, voices, character assets and game connections are unchanged.


## 0.4.1-rc.8

- Pin the independent Minecraft core rc.54, including public capture/archive helpers; no AIGC or performance code copied into the World.

# Changelog

## 0.4.1-rc.12

- Put ordinary Minecraft and the optional 千灯纪 RPG pack in the first connection step; keep protocol and viewer port optional.
- Reopen an already connected, unchanged account without restarting the World or cancelling its current body task. Changed settings and disconnected sessions remain reconnectable.
- Explain installation, independent World state, shared host models and on-demand game guides using the same API 6 extension contract.

## 0.4.1-rc.7

- Add the passive presentation export declaration using the independent core public types.
- Cover every World and neutral package export in the official-host consumer check.

## 0.4.1-rc.6

- Publish complete public declarations for the API 6 World, neutral server configuration, host decisions and server manifest.
- Check the live World definition against the official Cortico type; core runtime and original archives are unchanged.

## 0.4.1-rc.5

- Consume core rc.53: retain ordinary captures, camera/game evidence and optional voxel exports; move image/video/music creation to the independent AIGC World.
- Preserve original photo archives and return explicit migration receipts for legacy create/enhance requests; no implicit cross-World call or image-provider scan.
- Keep Persona-owned appearance references outside the game adapter and exchange media through host-resolved blob handles.
- Build and validate against Cortico 0.2.4 / API 6, with the private API 5 wrapper checked separately.
- This source candidate is not published or loaded into the running host.

## 0.4.1-rc.4

- Consume core rc.49 with shared wake classification, compact facts, event condensation and movement/observation repetition diagnostics.
- Keep exact MCP tool validation and on-demand full schemas when its compact catalogue is explicitly enabled.
- Protect player/private chat, unknown chat, task and goal evidence from built-in tutorial text filters.
- Retain the unlimited-by-default viewer audience fix and the same locked viewer/audio inputs from rc.3.
- These SDK helpers require explicit host adoption; this dependency update does not silently change wake policy, model settings or journal retention.
- This candidate is prepared locally, not published or loaded into a running host.

## 0.4.1-rc.3

- Add an operator quick-start panel: server address and account, save/start/stop and actual viewer links, through Cortico WorldContext only.
- Preserve host models, memory and unrelated settings; keep Microsoft authorization visible and server-specific rules opt-in.
- Consume core rc.47 shared address parsing and resumable, hash-verified full audio setup in a deployment cache; no missing-file success claims.
- Restore the account/connection panel when the optional server pack is enabled; keep request acceptance separate from game readiness.
- Include viewer archive identity in cache selection and keep prepared paths out of saved operator settings, so later renderer updates take effect.
- Follow Cortico 0.2.3 / API 6 self-description, tags and isolated package verification; retain a separate private API 5 build.

## 0.4.1-dev.20261019.7

- Consume shared core rc.45 ranked-choice validation and candidate-specific combat intents through the existing host decision port.
- Recheck relevant actor changes while tolerating unrelated bystander visibility; retain ownership, identity, target and geometry validation.
- Distinguish abstention, kept control and accepted dispatch in receipts; dispatch alone does not certify game progress.
- Restore the existing single delayed fresh-sample retry for cold-start scheduling timeouts in authored combat programs, without raising budgets.

## 0.4.1-dev.20261019.6

- Consume core rc.44 inventory organization through the shared action, help and script contracts.
- Merge/sort carried or open storage and apply explicit surplus retention rules; do not install an automatic discard policy.
- Preserve server-confirmed slots, exact custom item components and unresolved cursors on interruption.

## 0.4.1-dev.20261019.5

- Consume core rc.42 authored-action composition, persisted execution/review evidence and explicit reusable-version selection.
- Expose the core's bounded method index and progressive authoring help without copying game logic into the adapter.
- Preserve candidate versus selected versions and failed trials; saved code and completed programs do not certify learning.

## 0.4.1-dev.20261019.4

- Consume independent core rc.41 with codec-correct acknowledgements for first and subsequent End exits.
- Lock shared viewer 1cbd5574 with generated crossbow direction, native enchantment glint, compact skill panels and reconnect repairs.
- Check the public API 6 extension against Cortico 0.2.3; retain the separate private API 5 compatibility package.

## 0.4.1-dev.20261019.3

- Offer on-demand parameter descriptions through the shared core while retaining full tool help and validation constraints.
- Retain trusted work-acceptance rejections with their timestamp until a newer accepted, delivered or empty work state.

## 0.4.1-dev.20261018.10

- Consume shared core rc.31 feet-cell coordinates consistently in task queues, progress and observations.
- Preserve successful spatial checks, their named coordinates and unknown cells instead of hiding confirmed support among failed assertions.
- Keep Minecraft logic in the shared core; no framework, model, voice or server changes.

## 0.4.1-dev.20261018.9

- Retain exploration requirements, phase and next step from acceptance and stage hand-off replies; an unrelated server notice still ends response correlation.
- Consume shared core rc.30 current HUD readings and semantic title/progress updates through SDK and text-only observation.
- Retain multiline guild status phase, checklist, missing requirements and next step, correlated with the same fresh response.
- Retain current-task MC_MARKET_SURVEY/CHECK phase and nextAction without promoting ready to completed or mixing task IDs.
- Update observations before event admission and include the guild state once in request facts; historical acceptance remains explicitly dated.

## 0.4.1-dev.20261018.8

- Consume shared core rc.29: finish offhand replacement once the requested equipment and empty cursor are server-confirmed.
- Remove the unnecessary post-goal layout restoration that failed during live acceptance; retain all items and the selected hotbar.
- Keep rejection and unknown-outcome evidence intact; do not rewrite the original failed task as success.

## 0.4.1-dev.20261018.7

- Consume shared core rc.28 offhand equipment exchanges that preserve an empty cursor and original hotbar contents.
- Retain authoritative server confirmation, refusal evidence and unknown-outcome recovery.
- Distinguish missing inventory snapshots from received snapshots whose slots or cursor disagree; no framework, model or voice changes.

## 0.4.1-dev.20261017.4

- Reuse shared received-message search, retention and provenance logic while preserving legacy files.
- Provide effective namespaced tool-schema discovery in generic, server and native adapters.
- Pin the shared core information-capability update; keep server protocols optional and host code unchanged.

## 0.4.1-dev.20261017.2

- Default block protection checks run after an operation fails; explicit preflight remains configurable.
- Include the latest generic viewer, held-map preview, complete Java sounds and original music assets.
- Use Cortico API 6 WebUI names and export tool/event self-description for offline inspection.
## 0.4.1-rc.31

- Add a small, on-demand discovery guide for client/server photos, books, flight, blink, learning, professions and respec. Keep game eligibility and terminal evidence separate from historical documentation.
- Consume server pack rc.30 with the same core rc.93. Avoid binding the discovery heading to an obsolete CLI version. This documentation candidate does not change a character build or claim that every skill was executed live.
