import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const client = readFileSync(
  process.env.CANVAS_MEDIA_CLIENT_FILE
    ? path.resolve(process.env.CANVAS_MEDIA_CLIENT_FILE)
    : new URL("../src/components/canvas/canvas-client.tsx", import.meta.url),
  "utf8"
);

const videoSurface = client.match(
  /function VideoNodeSurface[\s\S]*?\r?\n}\r?\n\r?\nfunction ArtNode/
)?.[0];

assert.ok(videoSurface, "VideoNodeSurface implementation must exist");

assert.match(
  videoSurface,
  /<audio[\s\S]*?className="[^"]*nodrag[^"]*nowheel[^"]*nokey[^"]*"/,
  "native audio controls must not start node drag, canvas wheel handling, or canvas hotkeys"
);
assert.match(
  videoSurface,
  /data-testid="canvas-video-extract-controls"[\s\S]*?className="[^"]*nodrag[^"]*nowheel[^"]*nokey[^"]*"/,
  "video extraction controls must be isolated from React Flow gestures"
);
assert.match(
  videoSurface,
  /data-testid="canvas-video-timeline"[\s\S]*?className="[^"]*nodrag[^"]*nowheel[^"]*nokey[^"]*"/,
  "video timeline must be isolated from React Flow gestures"
);
assert.match(
  videoSurface,
  /data-testid="canvas-media-playback"[\s\S]*?className="[^"]*nodrag[^"]*nowheel[^"]*nokey[^"]*"/,
  "playback button must be isolated from React Flow gestures"
);
assert.match(
  videoSurface,
  /data-testid="canvas-media-preview"[\s\S]*?className="[^"]*nodrag[^"]*nowheel[^"]*nokey[^"]*"/,
  "preview button must be isolated from React Flow gestures"
);
assert.match(
  videoSurface,
  /tabIndex=\{selected \? 0 : -1\}[\s\S]*?className="nodrag nowheel nokey[^"]*"[\s\S]*?event\.code === "Space"[\s\S]*?togglePlayback\(\)/,
  "the focusable video surface must isolate drag, wheel, and Space playback from React Flow"
);
assert.doesNotMatch(
  videoSurface,
  /<video[\s\S]{0,180}?tabIndex=\{-1\}/,
  "video playback must not remain permanently unreachable from the keyboard"
);

console.log(
  "PASS canvas media controls: nodrag nowheel nokey isolation and focused Space playback"
);
