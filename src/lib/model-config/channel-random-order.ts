import { createHash } from "node:crypto";

/** Weighted random permutation, stable for the same operation and frozen
 * channel identity. Accepted operations are still owned by the durable pin;
 * this order never authorizes a second submission or overrides recovery. */
export function channelRandomScore(operation: string, channel: string, weight: number): number {
  const bits = createHash("sha256").update(JSON.stringify(["channel-random-v1", operation, channel])).digest().readUIntBE(0, 6);
  const uniform = (bits + 1) / (2 ** 48 + 1);
  return -Math.log(uniform) / weight;
}
