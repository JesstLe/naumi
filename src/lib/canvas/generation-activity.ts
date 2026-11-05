/** Canvas presentation lifecycle only. The existing image/detail/edit/workflow
 * task still owns its request, accepted job, results and receipt recovery.
 * All creation paths share the same visible busy-key set; no second task store,
 * network retry policy or billing identity lives here. */
type GenerationActivity<T> = {
  operations: Set<string>;
  operationKey: string;
  canRetry: () => boolean;
  execute: (attempt: {
    retry: () => Promise<T | undefined>;
    retain: () => void;
  }) => Promise<T>;
  clear?: () => void;
  changed?: () => void;
};

/** Construct after synchronous view preparation, before the first asynchronous
 * execution. A setup exception therefore cannot leave a claimed busy key.
 * Explicit retries re-enter this same activity and the same retained task. */
export function createCanvasGenerationActivity<T>(input: GenerationActivity<T>) {
  const retry = () => input.canRetry() ? run() : Promise.resolve(undefined);
  const run = async (): Promise<T | undefined> => {
    if (input.operations.has(input.operationKey)) return;
    input.operations.add(input.operationKey);
    let retained = false;
    try {
      input.changed?.();
      return await input.execute({ retry, retain: () => { retained = true; } });
    } finally {
      input.operations.delete(input.operationKey);
      try { if (!retained) input.clear?.(); }
      finally { input.changed?.(); }
    }
  };
  return { run };
}
