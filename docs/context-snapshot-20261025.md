# Current task facts and core rc.90

The development workspace pins the independently packed `agent-mc-world@0.5.7-rc.90`
candidate by SHA-256 in `vendor/core-source.json`. The neutral server candidate is
`0.5.0-rc.26`; the public API 6 World candidate is `0.4.1-rc.27`.

The core supplies current task progress alongside queue/world facts and declares
the represented snapshot stream. Each periodic sample retains its original
observation time, task and step identity, displacement and uncertainty. Hosts may
replace historical state snapshots in requests while retaining the raw journal,
retrieval index and independent task terminal evidence. This adapter forwards the
shared fact contract without implementing a second history or game controller.

The new core's optional MineDojo settings require concrete owning defaults in the
Cortico WebUI. The local index path defaults to empty and retrieval to `hybrid`;
an empty path does not configure a source or make a network request. The tool
self-description is regenerated from the current shared implementation.

The candidate includes reviewed core PR #10. Modifier-key repetition remains a
request-pattern hint, with unknown motion preserved for water, flight, directional
control and view changes. It does not automatically cancel work or prove absent
world progress. Cormy's private Bot does not currently consume that helper.

Validation: 2,092 core tests passed with one optional integration test skipped;
285 World/server tests passed. Public declarations and source/web types passed.
An isolated packed consumer exercised SDK, full/compact MCP and actual stdio,
official Cortico 0.2.7 / API 6 self-description, and the separate private API 5
compatibility package. No game connection or real model request was made by these
checks. Another 22 installed-package regressions passed. Source, local packages, publishing, live loading and natural game effects
remain separate; this record does not establish provider-token or latency savings.
