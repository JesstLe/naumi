/**
 * Per-upstream image parameter contract (docs/design/image-parameter-conventional-contract-20261105.md).
 *
 * Absent (the default): the published mapping must be complete and supplier
 * capability data still gates routing, exactly as before.
 *
 * "conventional": the protocol's own request is the default and the published
 * mapping only lists exceptions. Capability/metadata lists never exclude the
 * channel; an empty quality cell sends the selected tier unchanged and an
 * empty resolution cell leaves the protocol's own size fields untouched.
 * Structural constraints (edit, mask, reference limits, adapter ratio
 * contracts, field conflicts) and billing are unaffected.
 */
export const PARAMETER_CONTRACTS = ["conventional"] as const;
export type ParameterContract = typeof PARAMETER_CONTRACTS[number];

export function conventionalContract(map: { parameterContract?: ParameterContract } | undefined | null): boolean {
  return map?.parameterContract === "conventional";
}
