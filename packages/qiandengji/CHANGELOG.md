## 0.5.0-rc.50-preview.44

- Pin the shared entity display-name repair in core 0.5.7-rc.160-preview.56. Keep the received name and raw protocol type separate across observation and fast decisions; no server-specific remapping or behavior override.

## 0.5.0-rc.50-preview.43

- Return the configured trial travel step when a native status directs the player to the entrance. Keep eligibility and participation in the native reply.

## 0.5.0-rc.50-preview.41

- Preserve native follow policy and observation age in companion summaries; document independent safe following and teleport conditions.

## 0.5.0-rc.50-preview.40

- Consume shared core preview.43; server protocol behavior is unchanged.

## 0.5.0-rc.50-preview.38

- Pin merged core preview.41; preserve server protocol behavior.

## 0.5.0-rc.50-preview.37

- Update the pinned shared core contract to preview.40; server protocol behavior is unchanged.

## 0.5.0-rc.50-preview.34

- Keep dated companion geometry out of current decision fields after expiry, retaining UUID/ownership and lifecycle evidence. Pin shared core preview.37 including explicit cooldown refusal facts.

## 0.5.0-rc.50-preview.33

- Pin shared core preview.36: unify scaffold eligibility and expose effective movement policy in current journey facts. Preserve upstream native task and companion receipt integration.

## 0.5.0-rc.50-preview.30

- Integrate verified nearby companion replies, late recovery receipt linkage and shared core preview.33. Original-client evidence remains unverified until collected on the original host.
- Protect new evidence directories with a current-user/SYSTEM ACL on Windows before writing private records; preserve POSIX permissions elsewhere.

## 0.5.0-rc.50-preview.26

- Deliver authenticated public companion dialogue as attributed, replyable chat, preserving native speaker UUID, operation ID, nearby scope and deduplication. Keep private owner dialogue and unknown outcomes in their original observation path.
- Do not infer companion identity from an ordinary system line or register a companion as a player encounter.

## 0.5.0-rc.50-preview.24

- Declare optional fact capabilities independently of current observations, preserving missing values as unknown.
- Require core preview.30 for stable worker fact scopes and explicit absolute short-step orientation.

## 0.5.0-rc.50-preview.23

- Preserve server-attested role and ownership beside personal names in full, nearby and quiet perception.
- Require core preview.29: distinguish current failed replies from normal RPG snapshots and historical skill restrictions.

## 0.5.0-rc.50-preview.22

- Use server-confirmed personal names directly in perception while retaining structured NPC identity and ownership.
- Require core preview.28: pair nearby game speech with authored text, retain separate durable receipts and remove fixed per-packet upload waits.

## 0.5.0-rc.50-preview.21

- Bind server-confirmed maid UUIDs to the shared semantic identity port. Snapshot, proximity, attention and SDK observations consistently name the companion while preserving the raw protocol type. Release identity mappings on reconnect, without overriding players or unrelated entities.
- Preserve equipment names from the native maid inventory response in compact observations.

## 0.5.0-rc.50-preview.20

- Correlate visible companion UUIDs with the current server-owned maid identity using the shared core observation note. Keep raw entity types, visibility and targeting unchanged; distinguish native maid identity from a compatibility appearance.
- Retain native identity and item display names in compact companion observations so a custom weapon is not mistaken for a different registry item.

## 0.5.0-rc.50-preview.19

- Consume the deployed 0.1.8-life maid contract: retain server-observed survival, persisted recovery and historical deaths in bounded companion summaries, keeping unloaded state unknown.
- Accept original native death events before the tombstone arrives, preserving episode identity and ownership checks. Update on-demand guidance without new autonomous actions.

## 0.5.0-rc.50-preview.18

- Declare maid query branches for read-only workers; writes retain the existing body queue and receipt checks.
- Keep life, equipment and operation timestamps separate. Deliver actual life-state changes once; old tombstone episodes cannot override later survival of the same UUID.
- Include compact sitting, movement and equipment observations in companion summaries; full inventory and task catalog remain on demand.

## 0.5.0-rc.50-preview.17

- Add bounded read-only queries for all ten personal storage pages, inventory slots, shop/recycling catalogues and player market. Preserve page/stream identity, names, enchantments, durability and currency; omit serialized item bytes from model context.
- Preserve explicit open-store commands instead of rewriting them as pending-reward queries. Replace obsolete storage restrictions with current remote transfer and trade contracts.
- Consume core multipart query completion and exact failed-action documentation. Mutations still use the single body queue; no automatic transfers or purchases.
