# Canvas video fusion sources

Naumi license: AGPL-3.0. This feature is being adapted to the existing Naumi task, model, account, media and billing implementation.

- infinite-canvas, tigerowo and its credited upstream contributors: https://github.com/tigerowo/infinite-canvas/tree/68b37db04b9083c3ff0af67ffe362f85d04d1f9f — AGPL-3.0, full license in Infinite-Canvas-AGPL-3.0.txt.
- Toonflow-app, HBAI-Ltd, Copyright (c) 2026 HBAI-Ltd: https://github.com/HBAI-Ltd/Toonflow-app/tree/ae9e5f1ac4f37713b902fed7fa5ca87819b324ae — MIT, full license and copyright in Toonflow-MIT.txt.

The current capability schema, request validation and fixture code are written for Naumi. Mode semantics and reference behavior are informed by the pinned source files listed below; no complete upstream UI or account/storage implementation has been copied.

| Behavior reference | Pinned source file |
|---|---|
| First/last optional roles, legal duration-resolution combinations | Toonflow packages/nodes/videoGenerationNode/src/index.vue, src/components/generationSettings.vue, packages/providers/types.d.ts |
| Full reference sequence and template numbering | Toonflow packages/nodeShared/src/useNodeReferences.ts |
| Separate image/video/audio numbering and actual-ready inputs | infinite-canvas web/src/app/(user)/canvas/agent/skills/video.ts |
| First/last, structured shot and element context | infinite-canvas web/src/app/(user)/canvas/components/canvas-node-generation.ts |

Actual later source/Skill adaptations must add their paths and attribution here when implemented. This record does not claim that those later modules have already been copied or verified.
