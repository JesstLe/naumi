import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agentOrbState, restoredOrbOutcome, orbBounds, orbPixels, orbFraction, readOrbPosition, orbPositionKey, clampOrb,
  type AgentOrbOutcome, type AgentOrbStep } from "../src/lib/canvas/agent-orb";

let checks = 0;
function check(test: boolean) { assert.ok(test); checks++; }
const step = (tool: string, status: AgentOrbStep["status"] = "running"): AgentOrbStep => ({ id: tool, tool, status, label: "不可用于推断状态" });
for (const outcome of ["idle", "running", "done", "error", "stopped"] as AgentOrbOutcome[]) {
  check(agentOrbState(true, outcome, []) === "thinking");
  check(agentOrbState(true, outcome, [step("search_templates")]) === "searching");
  check(agentOrbState(true, outcome, [step("generate_image")]) === "working");
  check(agentOrbState(true, outcome, [step("generate_image", "done")]) === "thinking");
  check(agentOrbState(true, outcome, [step("generate_image", "error")]) === "thinking");
  check(agentOrbState(false, outcome, [step("generate_image")]) === (outcome === "done" ? "done" : outcome === "error" ? "error" : "idle"));
}
check(agentOrbState(true, "running", [step("generate_image"), step("search_templates")]) === "searching");
check(restoredOrbOutcome({ running: true, status: "failed" }) === "running");
check(restoredOrbOutcome({ status: "completed" }) === "done");
check(restoredOrbOutcome({ status: "failed" }) === "error");
check(restoredOrbOutcome({ status: "completed", error: "interrupted" }) === "error");
check(restoredOrbOutcome({}) === "idle");
for (const [width, height] of [[1440, 900], [1024, 640], [390, 720], [320, 568], [100, 200], [0, 0]]) {
  const bounds = orbBounds(width, height);
  for (const point of [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: .4, y: .7 }]) {
    const pixel = orbPixels(point, bounds);
    check(pixel.x >= 0 && pixel.y >= 0 && pixel.x <= Math.max(0, width - 88) && pixel.y <= Math.max(0, height - 112));
    const roundTrip = orbPixels(orbFraction(pixel, bounds), bounds);
    check(Math.abs(roundTrip.x - pixel.x) < .001 && Math.abs(roundTrip.y - pixel.y) < .001);
  }
  check(JSON.stringify(clampOrb({ x: -1000, y: -1000 }, bounds)) === JSON.stringify({ x: bounds.left, y: bounds.top }));
  check(JSON.stringify(clampOrb({ x: 10000, y: 10000 }, bounds)) === JSON.stringify({ x: bounds.right, y: bounds.bottom }));
  if (width >= 104 && height >= 128) {
    check(bounds.left === 8 && bounds.top === 8);
    check(bounds.right === width - 88 - 8 && bounds.bottom === height - 112 - 8);
    const oldVertical = Math.max(0, height - 112 - Math.min(136, height * .25)) - 76;
    check(bounds.bottom - bounds.top > oldVertical + 100);
  }
}
for (const raw of [null, "broken", "null", "{}", '{"x":-1,"y":0}', '{"x":0,"y":2}', '{"x":"0.5","y":0.5}']) check(readOrbPosition(raw).x === 1);
check(readOrbPosition('{"x":0.3,"y":0.6}').y === .6);
check(orbPositionKey("A@B.com") === orbPositionKey("a@b.com"));
check(orbPositionKey("a@b.com") !== orbPositionKey("other@b.com"));
const canvas = readFileSync("src/components/canvas/canvas-client.tsx", "utf8");
check(canvas.includes('busy={assistantBusy} outcome={assistantOutcome} steps={assistantSteps}'));
check(canvas.includes('english={locale === "en"} onActivate={toggleAssistant}'));
check(canvas.indexOf('if (!completed) throw') < canvas.indexOf('setAssistantOutcome("done")'));
check(canvas.includes('if(type==="done" && data.ok===true)completed=true;'));
check(canvas.includes('setAssistantOutcome(controller.signal.aborted ? "stopped" : "error")'));
check(canvas.includes('setAssistantOutcome(restoredOrbOutcome(data.session))'));
check(canvas.includes('tool:String(data.tool || "")'));
const floating = readFileSync("src/components/canvas/canvas-agent-orb.tsx", "utf8");
for (const token of ['Math.hypot(dx, dy) < 6', 'setPointerCapture', 'onPointerCancel', 'onLostPointerCapture', 'ResizeObserver', 'orbPositionKey(email)', 'data-canvas-hotkeys-blocked="true"', 'event.detail !== 0', 'ArrowLeft', 'controls="canvas-agent-panel"']) check(floating.includes(token));
check(!floating.includes('requestAnimationFrame') && !floating.includes('fetch('));
const orb = readFileSync("src/components/naumi-orb/naumi-orb.tsx", "utf8");
check(orb.includes('onClick={onActivate || spin}'));
check(orb.includes('aria-expanded={expanded} aria-controls={controls}'));
console.log(`CANVAS_AGENT_ORB=PASS checks=${checks} REAL_SSE_TERMINAL=REQUIRED NEW_SCHEDULER=0`);
