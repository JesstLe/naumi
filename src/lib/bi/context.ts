import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";

type Context = { email: string; operation: string; id?: string };

const context = new AsyncLocalStorage<Context>();

export const currentBiOperationId = () => context.getStore()?.id;

export const currentBiContext = () => context.getStore();

export function withBiModelContext<T>(
  email: string,
  operation: string,
  id: string,
  run: () => Promise<T>,
) {
  return context.run({ email, operation, id }, run);
}

/** Shares the same request-local actor scope with HTTP and in-process calls. */
export function withBiContext<T>(value: Context, run: () => Promise<T>) { return context.run(value, run); }
