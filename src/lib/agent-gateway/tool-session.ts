import "server-only";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { createNaumiTools, describeNaumiTools, type NaumiToolView } from "@/lib/agent/naumi-tools";
import { AgentHarness } from "@/lib/agent/harness";
import type { AgentBillingSession } from "@/lib/billing/agent";
import { AGENT_FEATURES } from "@/lib/billing/agent";
import { currentExecutionBundle } from "@/lib/model-config/context";
import { signAcceptedModelContext } from "@/lib/model-config/accepted-context";
import { signUserSession, USER_COOKIE } from "@/lib/native-auth";

// A headless agent session: the external agent takes the model's place and issues tool calls.
// It reuses the in-app agent's tool registry, harness and billing preparation unchanged.

/** Tools that only make sense inside the in-app conversation, not as a remote API. */
const HIDDEN_TOOLS = new Set(["list_agent_tools"]);

export type GatewayToolView = Omit<NaumiToolView, "parameters"> & { parameters: Record<string, unknown>; billed: boolean };

export type GatewayToolSession = {
  harness: AgentHarness;
  billing: AgentBillingSession;
  tools: AgentTool[];
  taskContext: { request: string; references: string[] } | undefined;
  bundle: ReturnType<typeof currentExecutionBundle>;
};

/** Server-minted session credential for in-process tool calls; never leaves this process. */
export function internalCookie(email: string): string {
  return `${USER_COOKIE}=${signUserSession(email, Date.now())}`;
}

export function createGatewayToolSession(input: { email: string; sessionId: string; internalOrigin: string; request?: string; references?: string[] }): GatewayToolSession {
  const email = input.email.trim().toLowerCase();
  const harness = new AgentHarness(email, input.sessionId);
  const cookie = internalCookie(email);
  harness.registerSecret(cookie);
  const taskContext = input.request ? { request: input.request.slice(0, 6000), references: input.references || [] } : undefined;
  const billing: AgentBillingSession = { email, id: input.sessionId, cred: { cookie, authorization: "", imageQuality: "medium", originalRequest: taskContext?.request } };
  const bundle = currentExecutionBundle();
  const tools = createNaumiTools(
    new Request(input.internalOrigin), email,
    () => ({ ...billing.cred, ...billing.preparedBilling, imagegenPlan: billing.preparedImagegen, videoWorkflow: billing.preparedVideoWorkflow, originalRequest: taskContext?.request }),
    bundle ? () => signAcceptedModelContext(email, bundle) : undefined,
    undefined, harness, () => taskContext,
  ).filter(tool => !HIDDEN_TOOLS.has(tool.name));
  harness.configure(describeNaumiTools(tools));
  return { harness, billing, tools, taskContext, bundle };
}

/** JSON-schema view for remote callers. `confirm` is omitted: the token budget authorizes quotes. */
export function gatewayToolViews(tools: AgentTool[]): GatewayToolView[] {
  return describeNaumiTools(tools).map(view => {
    const schema = JSON.parse(JSON.stringify(view.parameters)) as Record<string, any>;
    if (schema.properties?.confirm) {
      delete schema.properties.confirm;
      if (Array.isArray(schema.required)) schema.required = schema.required.filter((key: string) => key !== "confirm");
    }
    if (schema.type === "object") schema.additionalProperties = false;
    return { ...view, parameters: schema, billed: view.name!=="generate_aplus" && !!AGENT_FEATURES[view.name] };
  });
}
