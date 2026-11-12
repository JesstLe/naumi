/** The legacy chat adapter can serialize image content. Explicit overrides win;
 * model-name guesses are not a substitute for the provider's response. */
export function legacyAgentVision(_modelId: string, forced = process.env.AGENT_VISION || "") {
  if (forced.trim() === "1") return true;
  if (forced.trim() === "0") return false;
  return true;
}
