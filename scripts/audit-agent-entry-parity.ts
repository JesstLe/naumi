import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Audit of known drift, not a passing feature-parity regression. No tool execution.
async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    assert.ok(args[index + 1], `${name} needs a value`);
    return args[index + 1];
  };
  const ref = option("--ref");
  const output = option("--output");
  const revision = execFileSync("git", ["rev-parse", ref || "HEAD"], { encoding: "utf8" }).trim();
  assert.match(revision, /^[0-9a-f]{40}$/);
  const files: Record<string, { sha256: string; source: string }> = {};
  const read = (path: string) => {
    const source = ref ? execFileSync("git", ["show", `${revision}:${path}`], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }) : readFileSync(path, "utf8");
    files[path] = { source, sha256: createHash("sha256").update(source).digest("hex") };
    return source;
  };
  const wbPath = "src/components/home/workbench-client.tsx";
  const cvPath = "src/components/canvas/canvas-client.tsx";
  const wb = read(wbPath), cv = read(cvPath);
  const panelPath = "src/components/canvas/canvas-assistant-panel.tsx";
  const panel = read(panelPath);
  const richPath = "src/components/canvas/assistant-richtext.tsx";
  const rich = read(richPath);
  const selectorPath = "src/components/ui/text-model-select.tsx";
  const selector = read(selectorPath);
  const routePath = "src/app/api/agent/route.ts";
  const route = read(routePath);
  const runtimePath = "src/lib/agent/runtime.ts";
  const runtime = read(runtimePath);
  const canvasServerPath = "src/lib/agent/canvas.ts";
  const canvasServer = read(canvasServerPath);
  const orbPath = "src/components/canvas/canvas-agent-orb.tsx";
  const orb = read(orbPath);
  const modelPath = "src/lib/model-config/requests.ts";
  const model = read(modelPath);
  const line = (path: string, needle: string) => {
    const index = files[path].source.indexOf(needle);
    assert.ok(index >= 0, `missing evidence: ${path} ${needle}`);
    return { path, line: files[path].source.slice(0, index).split("\n").length, needle };
  };
  assert.ok(route.includes("getOrCreateSession(") && canvasServer.includes("getOrCreateSession("));
  assert.equal((runtime.match(/(?:tools: |const tools = )createNaumiTools\(/g) || []).length, 1);
  assert.ok(!/\bfetch\s*\(|\/api\//.test(orb));
  assert.ok(cv.includes("busy={assistantBusy} outcome={assistantOutcome} steps={assistantSteps}"));
  assert.ok(cv.includes('mode: "agent"'));

  const findings = [
    {
      id: "richtext_streaming", severity: "feature-drift",
      observed: wb.includes('content.split("\\n")') && rich.includes('import Markdown from "react-markdown"') && !wb.includes("AssistantRichText"),
      evidence: [line(wbPath, "function renderContent("), line(richPath, 'import Markdown from "react-markdown"'), line(wbPath, "{m.pending ? (")],
    },
    {
      id: "steering", severity: "feature-drift",
      observed: wb.includes("async function sendInterject()") && !panel.includes("onSteer") && panel.includes("value={input} disabled={busy}"),
      evidence: [line(wbPath, "async function sendInterject()"), line(panelPath, "value={input} disabled={busy}")],
    },
    {
      id: "terminal_contract", severity: "lifecycle-drift",
      observed: cv.includes("if (!completed) throw new Error(") && !wb.includes("if (!completed)") && wb.includes('content: "(执行失败)"') && route.includes("const doneCheck = setInterval("),
      evidence: [line(cvPath, "if (!completed) throw new Error("), line(wbPath, 'content: "(执行失败)"'), line(routePath, "const doneCheck = setInterval(")],
    },
    {
      id: "model_contract", severity: "configuration-drift",
      observed: wb.includes("<TextModelSelect compact />") && selector.includes('feature = "canvas.text-generate"') && model.includes('text: "agent.text", vision: "agent.vision"') && cv.includes('<TextModelSelect feature="canvas.assistant"'),
      evidence: [line(wbPath, "<TextModelSelect compact />"), line(selectorPath, 'feature = "canvas.text-generate"'), line(modelPath, 'text: "agent.text", vision: "agent.vision"')],
    },
    {
      id: "tool_labels", severity: "metadata-drift",
      observed: cv.includes('generate_image:"生成图片"') && cv.includes('|| "执行工具"'),
      evidence: [line(cvPath, 'generate_image:"生成图片"')],
    },
    {
      id: "duplicated_controller", severity: "maintenance-drift",
      observed: wb.includes("async function pollRecoveredRun(") && cv.includes("async function restoreAssistantConversation(") && wb.includes('buf.split("\\n\\n")') && cv.includes('buf.split("\\n\\n")'),
      evidence: [line(wbPath, "async function pollRecoveredRun("), line(cvPath, "async function restoreAssistantConversation(")],
    },
  ];
  assert.ok(findings.every(finding => finding.observed), "known-drift audit changed: review findings rather than claim parity");
  let totalTools: number | null = null;
  let executableCreativeEntries: number | null = null;
  if (!ref) {
    const { createNaumiTools } = await import("../src/lib/agent/naumi-tools");
    const { CREATIVE_AGENT_TOOLS } = await import("../src/lib/agent/creative-tool-catalog");
    const request = new Request("http://127.0.0.1:3012/");
    const workbench = createNaumiTools(request, "fixture@example.test");
    const canvas = createNaumiTools(request, "fixture@example.test", undefined, undefined, { anchorId: "", imageUrls: [], ratio: "1:1", resolution: "1K", quality: "medium" });
    const names = workbench.map(tool => tool.name);
    assert.deepEqual(names, canvas.map(tool => tool.name));
    assert.equal(new Set(names).size, names.length);
    for (const [entry, tools] of Object.entries(CREATIVE_AGENT_TOOLS)) {
      if (entry !== "agent") assert.ok(tools.length, entry);
      for (const tool of tools) assert.ok(names.includes(tool), `${entry}:${tool}`);
    }
    totalTools = names.length;
    executableCreativeEntries = Object.keys(CREATIVE_AGENT_TOOLS).filter(entry => entry !== "agent").length;
    console.log(`SHARED_AGENT_TOOLSET=PASS WORKBENCH=${totalTools} CANVAS=${totalTools} CREATIVE_EXECUTABLE=${executableCreativeEntries} ORB=SAME_CANVAS_RUNTIME EXECUTED_TOOLS=0`);
  }
  const report = {
    revision, ref: ref || "working-tree", management_status: "shared_core_split_clients", findings,
    totalTools, executableCreativeEntries, executedTools: 0, providerRequests: 0,
    limitation: "source contract audit plus local factory construction; not browser, persistence race, provider or deployed-version acceptance",
    files: Object.fromEntries(Object.entries(files).map(([path, value]) => [path, { sha256: value.sha256 }])),
  };
  if (output) { mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + "\n"); }
  console.log(`AGENT_ENTRY_AUDIT=PASS FINDINGS=${findings.length} UNIFIED_MANAGEMENT=PARTIAL SHARED_CORE=YES CLIENT_PARITY=NO MODE=${ref ? "REFERENCE_SOURCE" : "SOURCE_AND_FACTORY"} PROVIDER_REQUESTS=0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
