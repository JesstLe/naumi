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
