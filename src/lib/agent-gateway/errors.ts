// Stable, machine-readable gateway failures. `submitted` tells the caller whether work may have started.
export type GatewayCode =
  | "UNAUTHORIZED" | "TOKEN_REVOKED" | "TOKEN_EXPIRED" | "SCOPE_DENIED" | "FEATURE_DENIED" | "SITE_DISABLED"
  | "TOOL_NOT_FOUND" | "ARGUMENT_INVALID" | "BUDGET_EXCEEDED" | "INSUFFICIENT_CREDITS" | "QUOTE_UNAVAILABLE"
  | "OPERATION_CONFLICT" | "OPERATION_NOT_FOUND" | "RATE_LIMITED" | "MEDIA_NOT_FOUND" | "MEDIA_INVALID"
  | "TOOL_FAILED" | "UNAVAILABLE" | "INTERNAL";

export class GatewayError extends Error {
  constructor(readonly code: GatewayCode, message: string, readonly status = 400, readonly submitted: false | "unknown" = false) {
    super(message);
    this.name = "GatewayError";
  }
  toJSON() { return { code: this.code, message: this.message, submitted: this.submitted }; }
}
