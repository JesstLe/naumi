import "server-only";
import {createHash} from "node:crypto";
import {fetchStoredObject} from "../object-storage/runtime";

/** Verify exactly the catalogued bytes without buffering or replacing the NAS object. */
export async function inspectRemoteMedia(key: string, digest: string, bytes: number): Promise<"verified"|"missing"|"unverified"> {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || !/^[a-f0-9]{64}$/.test(digest)) return "unverified";
  const controller = new AbortController();
  let response: Response | undefined;
  try {
    response = await fetchStoredObject(key, "", controller.signal);
    if (response.status === 404) return "missing";
    if (response.status !== 200 || !response.body) return "unverified";

    const hash = createHash("sha256");
    const reader = response.body.getReader();
    let received = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        received += chunk.value.byteLength;
        if (received > bytes) return "unverified";
        hash.update(chunk.value);
      }
      return received === bytes && hash.digest("hex") === digest ? "verified" : "unverified";
    } finally {
      reader.releaseLock();
    }
  } finally {
    // Abort our transport even if a middleware clone still owns its branch.
    // Waiting for cancellation of that other branch would stall the shared lane.
    controller.abort();
    void response?.body?.cancel().catch(() => {});
  }
}

export async function matchesRemoteMedia(key: string, digest: string, bytes: number) {
  return await inspectRemoteMedia(key,digest,bytes) === "verified";
}
