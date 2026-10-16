import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
const calls = new AsyncLocalStorage<string>();
/** Correlates an SDK observation to each real HTTP attempt without modifying paid requests. */
export const currentObservedCallId = () => calls.getStore();
export const withObservedCallId = <T>(id: string, run: () => T): T => calls.run(id, run);
