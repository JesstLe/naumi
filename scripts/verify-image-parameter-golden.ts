/** Zero-network golden output for image parameter decisions on an exported real config.
 * Merge gate for parameter-contract changes (docs/design/image-parameter-conventional-contract-20261105.md §5):
 * run once on the baseline checkout and once on the change, then compare.
 *   npx tsx --conditions react-server scripts/verify-image-parameter-golden.ts <repoRoot> <model.json> <billing.json> <out.json>
 *   npx tsx scripts/verify-image-parameter-golden.ts --compare <baseline.json> <after.json>
 * model.json = GET /api/admin/bi/model-config/versions?version=N; billing.json = GET /api/admin/billing.
 * Exported configs stay outside the repository (ignored output/ or a scratch directory). */
import { writeFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const args = process.argv.slice(2);
if (args[0] === "--compare") {
  const [a, b] = args.slice(1).map(p => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])], diff = keys.filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  for (const k of diff.slice(0, 10)) console.log("DIFF", k, JSON.stringify(a[k])?.slice(0, 200), "=>", JSON.stringify(b[k])?.slice(0, 200));
  console.log(`IMAGE_PARAMETER_GOLDEN_COMPARE keys=${keys.length} differences=${diff.length}`);
  process.exit(diff.length ? 1 : 0);
}
const [root, modelPath, billingPath, outPath] = args;
const load = (p: string) => import(pathToFileURL(`${root}/src/lib/${p}.ts`).href);
async function main() {
  const { simulateModel } = await load("model-config/simulation");
  const { resolveImageResolution, upstreamAcceptsResolution, upstreamResolutionTiers } = await load("model-config/resolution-fallback");
  const { compileImageParameterPlan } = await load("model-config/image-parameter-plan");
  const { policyQuality } = await load("model-config/quality-policy");
  const { publicUpstreamIds } = await load("model-config/channel-policy");
  const model = JSON.parse(readFileSync(modelPath, "utf8")), billing = JSON.parse(readFileSync(billingPath, "utf8")).snapshot;
  const snapshot = { version: model.version, digest: model.digest, config: model.config };
  const config = model.config;
  // Production trusts its internal endpoints via MODEL_CONFIG_TRUSTED_ORIGINS; mirror that for every configured provider.
  const options = { trustedOrigins: [...new Set(config.providers.map((p: any) => { try { return new URL(p.baseUrl).origin; } catch { return ""; } }).filter(Boolean))] as string[] };
  const qualities = ["low", "medium", "high", "xhigh", "max"], resolutions = ["1K", "2K", "4K"];
  const ratios = ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9", "auto"];
  const attempt = (f: () => unknown) => { try { return { ok: f() }; } catch (e: any) { return { error: `${e?.code || e?.name || "Error"}:${e?.message || e}` }; } };
  const out: Record<string, unknown> = {};
  const models = config.publicModels.filter((m: any) => m.enabled && m.modality === "image");
  for (const m of models) {
    const ids: string[] = publicUpstreamIds(config, m);
    for (const quality of qualities) for (const resolution of resolutions) for (const ratio of ratios) {
      for (const edit of [false, true]) {
        const facts = { task: "product", quality, resolution, requestedResolution: resolution, ratio, needsEdit: edit, preserveIdentity: false, needsText: false, nativeResolution: false, references: edit ? 1 : 0, quantity: 1 };
        out[`sim|${m.id}|${quality}|${resolution}|${ratio}|${edit ? "edit" : "gen"}`] = attempt(() => { const r = simulateModel(snapshot, billing, m.id, facts, options); return { eligible: r.eligible, excluded: r.excluded }; });
      }
      out[`res|${m.id}|${resolution}|${ratio}`] = attempt(() => resolveImageResolution(config, m.id, resolution, undefined, ratio));
      for (const id of ids) {
        const u = config.upstreamModels.find((x: any) => x.id === id), p = u && config.providers.find((x: any) => x.id === u.providerId);
        if (!u || !p) continue;
        out[`plan|${m.id}|${id}|${quality}|${resolution}|${ratio}`] = attempt(() => compileImageParameterPlan(u, { quality, resolution, ratio }, { publicModelId: m.id, protocol: p.protocol, modelVersion: model.version, adapter: p.options?.imageAdapter }));
        out[`tiers|${id}|${ratio}`] = attempt(() => upstreamResolutionTiers(u, ratio));
        out[`accepts|${id}|${resolution}|${ratio}`] = attempt(() => upstreamAcceptsResolution(u, resolution, ratio));
        if (u.parameterMap.qualityPolicy) out[`quality|${id}|${quality}`] = attempt(() => policyQuality(u.parameterMap.qualityPolicy, quality) ?? null);
      }
    }
  }
  writeFileSync(outPath, JSON.stringify(Object.fromEntries(Object.entries(out).sort(([a], [b]) => a < b ? -1 : 1))));
  console.log(`GOLDEN keys=${Object.keys(out).length} models=${models.length}`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
