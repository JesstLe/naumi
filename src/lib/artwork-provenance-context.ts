import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
type Context = { path: string; operationId?: string; entry?: string };
const storage = new AsyncLocalStorage<Context>();
export const currentArtworkCreation = () => storage.getStore();
export function withArtworkCreation<T>(value: Context, run: () => Promise<T>) {
  return storage.run(value, run);
}
