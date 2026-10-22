# Official website registration helper

`agent-register.mjs` is the unmodified helper published by the 千灯纪 website,
verified against the public discovery API on 2026-10-23. Source and SHA-256 are
recorded in `source.json`. The Agent Skill 1.1.0 distribution supplies its MIT
LICENSE, matching this package's license. No code is downloaded or executed at
installation or World startup.

The neutral server pack wraps this helper to provide scoped local identity
storage, serialized operator actions, safe state projection and the API/game
readiness gate. Only an explicit operator action exchanges an invitation or
activates an account. Existing identities and request IDs are retained.
