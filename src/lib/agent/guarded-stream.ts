import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { contextualAgentReply, type AgentIdentity } from "./response-policy";
import { pelicanArtifactReply } from "./pelican-artifact";

/** Local replies use the real Agent event protocol, so persistence/SSE/stop remain shared. */
export function guardAgentStream(identity: AgentIdentity, upstream: StreamFn): StreamFn {
  return async (model, context, options) => {
    const reply = contextualAgentReply(context, identity);
    if (!reply) return upstream(model, context, options);
    const { createAssistantMessageEventStream } = await import("@earendil-works/pi-ai");
    const stream = createAssistantMessageEventStream();
    const text = reply.kind === "pelican" ? pelicanArtifactReply(reply.sourceRequested) : reply.text!;
    const message: AssistantMessage = { role: "assistant", api: model.api, provider: "naumi-local", model: "naumi-local-reply",
      content: [], stopReason: "stop", timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    };
    if (options?.signal?.aborted) {
      message.stopReason = "aborted"; message.errorMessage = "任务已停止";
      stream.push({ type: "error", reason: "aborted", error: message });
      return stream;
    }
    stream.push({ type: "start", partial: message });
    message.content.push({ type: "text", text: "" });
    stream.push({ type: "text_start", contentIndex: 0, partial: message });
    message.content[0] = { type: "text", text };
    stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: message });
    stream.push({ type: "text_end", contentIndex: 0, content: text, partial: message });
    stream.push({ type: "done", reason: "stop", message });
    return stream;
  };
}
