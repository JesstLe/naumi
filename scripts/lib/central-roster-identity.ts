/** Historical 202-member approval is frozen; a new catalog group is not a new grant. */
export const APPROVED_ROSTER_DESIGN_GROUPS = [
  'ecommerce-senior', 'ecommerce-production', 'packaging', 'ui',
] as const;

/** Approved aliases bind canonical login identities, not mutable display names.
 * Both independently read live records must agree on that exact identity/name. */
export function existingRosterIdentityMatches(
  approved: {email: string},
  central: {email: string; name: string} | undefined,
  eligibility: {email: string; name: string} | undefined,
) {
  return !!central && !!eligibility && central.email === approved.email &&
    eligibility.email === approved.email && central.name === eligibility.name;
}
