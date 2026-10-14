# Native message index repair — 2026-10-15

The active Java body receives real chat and server notices. Its native events use `minecraft.client.message`; the retained server message index accepts `mymc.chat`. The native adapter previously passed the incompatible event type, silently leaving the index at pre-migration history. Its tool declaration also omitted search/review fields. A live `keyword` search therefore returned unrelated old messages.

## Repair

- Normalize native messages only for the retained observation index; deliver the original native event once with its original type, time, text and metadata.
- Preserve player/whisper sender metadata, exclude action-bar HUD and recognizable self/outgoing echoes from the received-message index, and respect suppressed delivery.
- Share the complete query/read/review schema between body implementations. Support `keyword` as a compatibility alias for `query`; reject conflicting or empty searches rather than accidentally returning the entire history.
- Catch index persistence failures and continue delivering the original native event. Retain historical records and their original observation times; do not replay them as new instructions or treat them as current facts.
- Current pre-attachment notices remain queryable through `mymc_notices`; they are not injected as new inbox events.

## Acceptance / deployment

Independent copy: full 29-file / 188-test suite, integration typecheck, build and Cortico API 5 package verification passed. Both neutral server pack and thin World adapter candidates were packed. A consumer with no Cortico installation and network/process calls denied loaded the packed neutral server package, received a native private message, filtered its keyword, read its original sender/time and verified exactly one original event delivery.

No host, client or World was restarted. This message-index repair is **source/build/package verified and pending World activation**; the active process still needs `mymc_notices` for current original messages. The existing helper installed by the independent core can be used immediately without a World restart. No npm publication was made.

The independent core's matching work adds version-correct script references and reduces repeated historical actions in receipts. Its measured reductions and live read-only result do not prove navigation, combat or goal completion. See the independent core's `docs/java-client-optimization-20261015.md`.
