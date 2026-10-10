# Vendored SVG engine

- Source: https://github.com/tycoding/grok-ball
- Revision: `de368ce3acdc5a70e871ee46ebbe8f60b11d3d6a`
- Upstream file: `src/grok-ball.js`; copied without modifications.
- SHA256 (canonical Git blob / LF): `d03f37f261da2e22e55e9b0fa40dcdab62f0a6c6dd419632a088a7c4c9bb79fa`
- SHA256 (Windows checkout / CRLF): `72960b6398032d45c8e4ca4386dfb2a9b6f286d67af0d3c2692dcffeab273fbb`
- License: MIT, Copyright (c) 2026 tycoding; full notice in `LICENSE`.

Load only from a client effect through `loadOrbEngine()`; never import this
runtime from a server component. The declaration file describes a side-effect
module without changing the upstream JavaScript. The runtime creates browser
globals; it is lazily bundled only for the orb consumer, not every app page.
