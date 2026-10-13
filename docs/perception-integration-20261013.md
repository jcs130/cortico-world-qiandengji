# Perception and host integration — 2026-10-13

## Boundaries

- `agent-mc-world` owns visible geometry, spatial sites, compact attention, coarse server-packet hearing and the host-neutral detection evidence contract. It does not resolve providers, credentials, personality or memory.
- `mc-visual-console` owns the rendered minimap, Chinese labels, observed terrain history and current entity visibility. The renderer was merged with upstream `aaba46e7`; perception changes are in `6d171211`.
- This repository supplies the explicit 千灯纪 server pack and Cortico API 5 adapter. Server detection requires a real, fresh receipt; a successful spell command alone supplies no hidden positions.
- Cortico owns saved provider connections and per-purpose reasoning settings. Its upstream `e21a524` was merged with existing host changes in `b9e1e56`. MC defaults to host model settings, with an explicit MC override available.
- VTuber voice and performance remain a separate extension.

## Checks

Full validation passed: 340 independent core tests; 201 server/adapter tests; Cortico 7504 tests (4 skipped), host and web type checks; shared viewer tests and build. Packed MCP, Cortico and DSH consumers resolved one core and ran under network denial without starting Minecraft or a model loop. Cortico API 5 construction and tool discovery passed.

The candidate core archive is prepared explicitly in `vendor/agent-mc-world-0.4.0-sight-20261013.tgz`; its integrity is pinned in the lockfile. Local unpublished archives alone are excluded from registry release-age lookup. Runtime assets are built from the locked viewer source; generated monitor captures, Python bytecode and packaging-ignored dotfiles are excluded from the verified build manifest. Derived archives and private runtime data are not source commits.

## Runtime evidence

Deployment and actual gameplay are recorded separately in `scratch/agent-comparison/integration-20261013/` in the operator workspace. Source tests do not establish that an observation reached the model, that a threat estimate was accurate, or that gameplay improved. Missing ranges and probabilities remain unknown. Hearing returns approximate bearing and distance, never exact sound coordinates. No npm publication is included.

The legacy battlefield also uses the core entity visibility check. Hidden enemies are omitted; confirmed party telemetry keeps unknown geometry, without hidden ally coordinates. A wall and rear-facing regression exercise this boundary.

The authorized local integration was loaded on October 13 at 18:06 (Asia/Shanghai), and Cormy resumed at 18:07 with the same main conversation and preserved files. Naruto remains operator-paused. Jev System One served real foreground selection requests through the host provider; DeepSeek still has thinking enabled and used `low` in the sampled main calls. The new attention and coarse-hearing tools were invoked by Cormy. These are runtime observations, not claims of a general intelligence improvement.

Live review found an underground minimap limitation and a clipped risk button. Shared viewer `f0698643` adds a visibility-masked local height slice and fixes the button layout; 22 targeted geometry/camera/history tests passed. Matching 1.20.6/qiandengji browser assets were hot-updated in the explicit viewer directory, without another Agent restart. The installed core's embedded fallback assets still correspond to its locked `6d171211` baseline; this deployment uses the explicit newer viewer override.

In gameplay, LittleFish0510 helped Cormy reach a natural mineshaft. Cormy then completed the exploration and received the server's 10/10 and successful delivery receipts at 18:19:46. Rewards were reported stored in the personal reward chest; retrieval was not tested. Main requests still have large contexts and occasional long reasoning, so the short runtime sample does not establish a lasting latency or decision-quality improvement.
