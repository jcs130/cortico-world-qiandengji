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

