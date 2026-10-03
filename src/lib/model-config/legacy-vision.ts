/** Preserves the pre-registry Agent capability heuristic; imported facts remain unverified. */
export function legacyAgentVision(modelId: string, forced = process.env.AGENT_VISION || "") {
  if (forced.trim() === "1") return true;
  if (forced.trim() === "0") return false;
  return /(gpt-(4o|4\.1|4\.5|4-turbo|5)|chatgpt-4o|\bo[134]($|-)|claude|gemini|qwen.{0,8}vl|qvq|glm-\d(\.\d+)?v|doubao.{0,10}vision|grok-[45]|pixtral|deepseek-vl|llava|-vision|moonshot.{0,6}vision|kimi.{0,6}vision)/i.test(modelId);
}
