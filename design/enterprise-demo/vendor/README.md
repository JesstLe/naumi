# Browser-only Excel preview dependencies

- SheetJS Community Edition 0.20.3: `xlsx-0.20.3.min.js`, Apache-2.0, downloaded 2026-10-19 from `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`; SHA-256 `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`. License in SheetJS-LICENSE.txt.
- JSZip 3.10.1: `jszip-3.10.1.min.js`, MIT/GPLv3 dual license, copied byte-for-byte from the existing installed project package `jszip/dist/jszip.min.js`; license in JSZip-LICENSE.md. Exact build hash is pinned in bundle-spec.json.

The complete vendor bytes are embedded as an escaped worker source string by assemble.mjs. No CDN/runtime imports, external preview upload, dependency install or root package/lockfile change. Build rejects hash drift. Vendor legal URLs are not application network targets. Worker application code has no fetch/importScripts/XMLHttpRequest/WebSocket. The enclosing app fetches only the existing authenticated attachment endpoint and passes ArrayBuffer by transfer.
