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

