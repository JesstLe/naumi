/** One ordered outcome per input. A failed response is never a successful blank prompt. */
export type ReversePromptOutcome<T> = { input: T; index: number } & (
  { status: "completed"; text: string } | { status: "failed"; error: string }
);

export async function runReversePromptBatch<T>(inputs: readonly T[], options: {
  canStart: () => boolean;
  request: (input: T, index: number) => Promise<unknown>;
  settle: (outcome: ReversePromptOutcome<T>) => Promise<boolean>;
  failureMessage: string;
  cancelledMessage: string;
}) {
  const outcomes: ReversePromptOutcome<T>[] = new Array(inputs.length);
  let next = 0, saved = 0;
  await Promise.all(Array.from({ length: Math.min(2, inputs.length) }, async () => {
    while (next < inputs.length) {
      const index = next++, input = inputs[index];
      let outcome: ReversePromptOutcome<T>;
      try {
        if (!options.canStart()) throw new Error(options.cancelledMessage);
        const text = await options.request(input, index);
        if (typeof text !== "string" || !text.trim()) throw new Error(options.failureMessage);
        outcome = { input, index, status: "completed", text: text.trim() };
      } catch (error) {
        outcome = { input, index, status: "failed", error: error instanceof Error ? error.message : options.failureMessage };
      }
      outcomes[index] = outcome;
      if (await options.settle(outcome)) saved++;
    }
  }));
  const succeeded = outcomes.filter(item => item.status === "completed").length;
  return { outcomes, total: inputs.length, succeeded, failed: inputs.length - succeeded, saved };
}
