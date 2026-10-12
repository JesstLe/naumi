import type { AgentBridge, AgentSession } from "../bridge-types";
import { HarnessError } from "../harness";

/** Unused legacy adapter: no shell, inherited env, or unauthenticated callback. */
export class CodexBridge implements AgentBridge {
  readonly name = "codex";
  async createSession(_opts: Parameters<AgentBridge["createSession"]>[0]): Promise<AgentSession> {
    throw new HarnessError("BACKEND_DISABLED", 503);
  }
}
