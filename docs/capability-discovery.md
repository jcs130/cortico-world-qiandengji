# Outcome-oriented ability discovery

The optional server pack appends historically observed ability effects to the core
`minecraft-options/v1` contract. It owns only the server catalogue parser, timestamps,
cost descriptions and tool namespace mapping. General food, boat, travel, inventory,
information and method discovery remains in `agent-mc-world`.

`mymc_options {"intent":"food"}` returns a small combination of ordinary actions,
server observations and method lookup entries. For example, a received creation
spell detail mentioning `bread×4` is relevant to portable food even when its category
is `creation`. Matching uses observed name/effect/target/tip, not an assumed spell-ID
effect. No detail means no invented recipe.

Static cost is distinct from current mana, eligibility or remaining cooldown.
Every server candidate retains its observation time, original command shape and
unknown support/eligibility. Read `mymc_skills {"id":"..."}` for the stored original;
read the CLI guide and query `/mycli capabilities info <ID>` / `/mycli skills status`
when current rules or prerequisites need confirmation. Candidate discovery sends
no game commands, so it does not repeatedly query the server each model turn.

The core's bounded current-fact index is refreshed by key and located near the
sample header. The full catalogue, complete guides and method source do not become
permanent context. This makes capabilities discoverable; actual model adoption,
successful execution, measured improvement and later reuse still need live evidence.

No Cortico framework or Bot source is changed. These source and package changes do
not reload a running stream or consume a previous reload authorization.
