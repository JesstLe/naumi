#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const editor = readFileSync(
  path.join(root, "src/components/canvas/annotate-editor.tsx"),
  "utf8"
);
const client = readFileSync(
  path.join(root, "src/components/canvas/canvas-client.tsx"),
  "utf8"
);

const closeIndex = editor.indexOf("onClose();\n      void onSubmitted(formData)");
assert.ok(closeIndex >= 0, "annotation modal must close before the remote generation promise is awaited");
assert.ok(
  client.includes("landEditResult(") && client.includes("setPendNodes"),
  "background annotation generation must keep using a visible canvas placeholder"
);
assert.ok(
  client.includes("提交即关闭，landEditResult 在画布占位节点中后台继续落地"),
  "the integration boundary must remain documented next to the modal"
);

console.log("CANVAS_NONBLOCKING_EDIT_RESULT=PASS close=immediate placeholder=retained");
