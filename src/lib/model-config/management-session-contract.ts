import type { ModelManagementState } from "./management";
import type { CatalogEntry } from "./catalog-store";

/** Browser application contracts; no React, storage or transport implementation. */
export type ManagementState = ModelManagementState & { catalogs: CatalogEntry[] };
export type ManagementOperation = Record<string, unknown> & { action: string; id: string; expectedVersion: number };
export type ManagementRequest = { current(): boolean; signal?: AbortSignal };
export type ManagementPublication = { publication: { phase: string } };
export type ManagementProjection<T> = (change: T | ((previous: T) => T)) => void;
export type ManagementStorage = { read(): string | null; write(value: string): void; remove(): void };

/** Old valid receipts keep their full body, including original model/billing
 * versions. A corrupt storage value is not evidence of an accepted operation. */
export function readManagementOperation(value: string | null): ManagementOperation | null {
  if (!value) return null;
  try {
    const operation = JSON.parse(value);
    return operation && typeof operation === "object" && !Array.isArray(operation) &&
      typeof operation.id === "string" && operation.id.trim() &&
      typeof operation.action === "string" && operation.action.trim() &&
      Number.isInteger(operation.expectedVersion) && operation.expectedVersion >= 0 ? operation : null;
  } catch { return null; }
}
