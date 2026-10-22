import type { ModelExecutionScope } from "../model-config/context";

/** A keep-mask is an optimization, not a requirement: server compositing owns
 * original-pixel protection. Choose the transport once before any paid POST.
 * With fallback routing it must be valid on every frozen candidate. */
export function expansionUsesMask(scope: ModelExecutionScope | null): boolean {
  if (!scope) return true; // Existing unmanaged OpenAI edit contract.
  const scopes = scope.supplierRouting ? scope.supplierRouting.targets.map(target => target.scope)
    : scope.routing ? Object.values(scope.routing.targets) : [scope];
  return scopes.length > 0 && scopes.every(candidate =>
    candidate.connection.protocol !== "new-api-flow" &&
    candidate.capabilities.imagegen?.mask?.state === "supported" &&
    (!scope.businessOption?.parameters?.inputTypes || scope.businessOption.parameters.inputTypes.includes("mask")));
}
