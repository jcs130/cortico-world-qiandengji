# Changelog

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
