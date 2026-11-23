/** Supplier model names are claims, not proof of the underlying executing model.
 * Bounded metadata only: no prompt, answer, reasoning text, credential or URL. */
export function textResponseEvidence(requestedModel: string, response: unknown, requestedTokens?: number) {
  const v=response as {model?:unknown;choices?:{finish_reason?:unknown}[];usage?:{prompt_tokens?:unknown;completion_tokens?:unknown;completion_tokens_details?:{reasoning_tokens?:unknown}}}|null;
  const count=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0?Number(n):null;
  const responseModel=typeof v?.model==="string"?v.model.slice(0,200):"";
  const reason=v?.choices?.find(c=>typeof c.finish_reason==="string")?.finish_reason;
  return {requestedModel:requestedModel.slice(0,200),responseModel,identity:!responseModel?"unreported":responseModel===requestedModel?"matching-label":"different-label-unverified",
    finishReason:typeof reason==="string"?reason.slice(0,40):null,requestedTokens:count(requestedTokens),inputTokens:count(v?.usage?.prompt_tokens),outputTokens:count(v?.usage?.completion_tokens),reasoningTokens:count(v?.usage?.completion_tokens_details?.reasoning_tokens)};
}
