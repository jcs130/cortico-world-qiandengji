# Reviewed development package

The explicit vendor archive and lockfile consume `agent-mc-world` 0.5.7-dev.20261016.38,
source `ffd0caa3cfa9facb1e573f201f55ecb2a67482f5`, based on upstream `5ebe1924`.
`vendor/core-source.json` records its SHA-256 and shared renderer `4c0ffc06`.
The neutral server package and both thin Cortico API 5 adapters use this dependency.
Character assets and deployment settings remain outside these packages.

This includes upstream short-method terminal feedback and native observation changes,
the reviewed authentication retry corrections, and the browser's original YSM and local
skin support. A clean adapter build now copies its declared console stylesheet.

Acceptance: 1162 core tests, 202 World tests, type checks, package entry/style verification,
and four isolated consumers using a single physical core package. These are offline
acceptance results. Deployment loading, server authorization, rendering and game progress
are recorded separately; this development package has not been published to npm or Market.
