import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ORB_STATES, ORB_THEMES, gazeFromPoint, orbCanAnimate } from "../src/components/naumi-orb/orb-model";

let checks = 0;
function check(test: boolean) { assert.ok(test); checks++; }
const rect = { left: 100, top: 50, width: 400, height: 400 };
check(JSON.stringify(gazeFromPoint(300, 250, rect)) === '{"x":0,"y":0}');
check(gazeFromPoint(10000, -10000, rect).x === 1);
check(gazeFromPoint(10000, -10000, rect).y === -1);
check(gazeFromPoint(0, 0, rect).x < 0 && gazeFromPoint(0, 0, rect).y < 0);
check(gazeFromPoint(600, 600, rect).x > 0 && gazeFromPoint(600, 600, rect).y > 0);
check(Number.isFinite(gazeFromPoint(NaN, Infinity, { left: 0, top: 0, width: 0, height: 0 }).x));
check(gazeFromPoint(50, 32, { left: 0, top: 0, width: 64, height: 64 }).x < .1);
check(ORB_STATES.length === 32 && new Set(ORB_STATES.map(x => x.id)).size === 32);
check(ORB_THEMES.naumi.body === "#181b23" && ORB_THEMES.naumi.eyes === "#f5f5f7");
check(ORB_THEMES.naumi.accent === "#d9dce5");
const luminance = (hex: string) => {
  const linear = hex.slice(1).match(/../g)!.map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
};
for (const palette of Object.values(ORB_THEMES)) {
  const eye = luminance(palette.eyes), body = luminance(palette.body);
  check((Math.max(eye, body) + .05) / (Math.min(eye, body) + .05) >= 4.5);
}
for (let mask = 0; mask < 32; mask++) {
  const b = [0, 1, 2, 3, 4].map(bit => !!(mask & (1 << bit)));
  check(orbCanAnimate(b[0], b[1], b[2], b[3], b[4]) === (mask === 13));
}

// Execute the real vendored runtime against a minimal SVG DOM, not a browser.
class SvgNode {
  attrs = new Map<string, string>();
  children: SvgNode[] = [];
  parentNode: SvgNode | null = null;
  style: Record<string, string> = {};
  textContent = "";
  constructor(public tag: string) {}
  setAttribute(key: string, value: unknown) { this.attrs.set(key, String(value)); }
  getAttribute(key: string) { return this.attrs.get(key); }
  appendChild(child: SvgNode) { child.remove(); child.parentNode = this; this.children.push(child); return child; }
  removeChild(child: SvgNode) { this.children = this.children.filter(item => item !== child); child.parentNode = null; }
  remove() { this.parentNode?.removeChild(this); }
}
let now = 0, nextId = 0;
const raf = new Map<number, (time: number) => void>();
const context: any = {
  document: { createElementNS: (_ns: string, tag: string) => new SvgNode(tag) },
  performance: { now: () => now }, console, Set, Math, JSON,
  requestAnimationFrame: (callback: (time: number) => void) => { raf.set(++nextId, callback); return nextId; },
  cancelAnimationFrame: (id: number) => raf.delete(id),
  setInterval: () => 1, clearInterval: () => {},
};
context.window = context;
vm.runInNewContext(readFileSync("src/components/naumi-orb/vendor/grok-ball.js", "utf8"), context);
const advance = (frames: number) => {
  for (let i = 0; i < frames; i++) {
    now += 16; const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach(callback => callback(now));
  }
};
const hosts = [new SvgNode("div"), new SvgNode("div")];
const options = { color: ORB_THEMES.naumi.body, eyeColor: ORB_THEMES.naumi.eyes, autostart: false, lite: false, idle: false };
const engines = hosts.map(host => context.GrokBall.create(host, options));
check(hosts.every(host => host.children.length === 1));
check(raf.size === 0);
for (const state of ORB_STATES) {
  check(engines[0].setEmotion(state.id) === true);
  check(engines[0].emotionId === state.id);
}
check(engines[0].setEmotion("unknown") === true && engines[0].emotionId === "02");
engines.forEach(engine => engine.setEmotion("03"));
engines.forEach(engine => engine.setActive(true));
check(raf.size === 1); // shared ticker, not one RAF per instance
engines[0].setGaze(1, -1); advance(90);
check(engines[0]._gaze.x > 20 && engines[0]._gaze.y < -12);
const eye = hosts[0].children[0].children[2].children[1];
check(eye.getAttribute("fill") === ORB_THEMES.naumi.eyes);
check(!eye.getAttribute("d")?.includes("NaN"));
engines[0].clearGaze(); advance(90);
check(Math.abs(engines[0]._gaze.x) < .01 && Math.abs(engines[0]._gaze.y) < .01);
engines[0].spin(1); advance(240);
check(engines[0]._spin === null);
engines.forEach(engine => engine.setActive(false)); advance(2);
check(raf.size === 0);
engines.forEach(engine => engine.destroy());
check(hosts.every(host => host.children.length === 0));
check(raf.size === 0);

// All three palettes retain their eye color in all 32 actual SVG expressions.
for (const palette of Object.values(ORB_THEMES)) {
  const host = new SvgNode("div");
  const instance = context.GrokBall.create(host, { ...options, color: palette.body, eyeColor: palette.eyes, lite: true });
  for (const state of ORB_STATES) {
    instance.setEmotion(state.id);
    instance.renderStatic();
    check(host.children[0].children[2].children[1].getAttribute("fill") === palette.eyes &&
      host.children[0].children[2].children[2].getAttribute("fill") === palette.eyes);
  }
  instance.destroy();
}

const wrapper = readFileSync("src/components/naumi-orb/naumi-orb.tsx", "utf8");
check(wrapper.includes('event.pointerType === "touch"'));
check(wrapper.includes("observer.disconnect()") && wrapper.includes("instance?.destroy()"));
check(wrapper.includes('removeEventListener("visibilitychange", update)') && wrapper.includes('removeEventListener("pointermove", point)'));
check(!wrapper.includes("requestAnimationFrame"));
const loader = readFileSync("src/components/naumi-orb/orb-engine.ts", "utf8");
check(loader.includes('import("./vendor/grok-ball.js")'));
console.log(`NAUMI_ORB=PASS checks=${checks}`);
