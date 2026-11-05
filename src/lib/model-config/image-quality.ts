import "server-only";
import { resolveImageQuality } from "../image-quality";
import { currentModelExecution } from "./context";
import {policyQuality} from "./quality-policy";
import {IMAGE_QUALITY_IDS,type ResolvedImageQuality,type ExecutedQuality} from "../image-quality";
export function resolveConfiguredImageQuality(requested: unknown) {
  const scope = currentModelExecution("image"), policy = scope?.parameterMap.qualityPolicy;
  if (policy) {
    const req = scope?.frozen.facts?.quality || (typeof requested === "string" && requested ? requested : "medium");
    const wire = policyQuality(policy, req, scope?.parameterMap.parameterContract);
    return {requested:req,executed:wire===undefined?"auto":(IMAGE_QUALITY_IDS as readonly string[]).includes(wire)||wire==="auto"?wire as ExecutedQuality:req as ExecutedQuality,upstreamValue:wire??null,fallbackReason:wire===undefined?"configured-omit":wire!==req?"configured-mapping":null} satisfies ResolvedImageQuality;
  }
  const preset = scope?.imagePreset;
  if (preset) {
    // The quote can normalize a feature-specific selection independently of a
    // stale global browser header. Keep its original semantic tier for billing,
    // including a high requested tier whose preset executes at medium.
    const frozen = scope?.frozen.requestedParameters?.quality || scope?.frozen.facts?.quality;
    const value = frozen || (typeof requested === "string" ? requested.trim().toLowerCase() : "medium");
    return {requested:value,executed:(value === "low" ? "low" : "medium") as "low" | "medium",fallbackReason:value === "low" || value === "medium" ? null : "preset-quality-cap" as const};
  }
  // Request admission already selected and validated this tier. Later helpers
  // must not replace it with a body/header default or the first supplier's tier.
  if (scope?.frozen.facts) return resolveImageQuality(scope.frozen.facts.quality, [scope.frozen.facts.quality]);
  return resolveImageQuality(requested, currentModelExecution("image")?.capabilities.qualities);
}
