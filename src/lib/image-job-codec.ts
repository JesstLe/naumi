import "server-only";
import { createHash } from "node:crypto";
import {dataUrlToBytes} from "./object-storage/runtime";
import {uploadImage} from "./media-upload";
import {readManagedObject} from "./object-storage/managed-read";
import {writeImageJobResult,readImageJobResult} from "./image-jobs/result-storage";

const MAX_BYTES = 64 * 1024 * 1024;
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const uploadedInputs = new WeakMap<Buffer, string>();
type ObjectValue = Record<string, any>;
const object = (value: unknown): value is ObjectValue => !!value && typeof value === "object" && !Buffer.isBuffer(value);
const reference = (value: unknown) => object(value) && ["$imageJobBuffer", "$imageJobBase64", "$imageJobDataURL", "$imageJobInlineBuffer"].some(key => key in value);

/** Payload/input encoding is unchanged. Image strings are only interpreted in
 * paid results, never in prompts, arbitrary metadata or public final receipts. */
export async function encodeImageJobValue(value: unknown, id: string): Promise<unknown> {
  if (Buffer.isBuffer(value)) {
    const key = `image-job-inputs/${id}/${hash(value)}.bin`;
    let url = uploadedInputs.get(value);
    if (!url?.endsWith(`/${key}`)) {
      url = await uploadImage(value, "application/octet-stream", key);
      uploadedInputs.set(value, url);
    }
    return { $imageJobBuffer: url };
  }
  if (reference(value)) return value;
  if (Array.isArray(value)) return Promise.all(value.map(entry => encodeImageJobValue(entry, id)));
  if (object(value)) return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await encodeImageJobValue(entry, id)])));
  return value;
}

/** Internal decode only. Polling/CAS must continue to use get(id, false). Old
 * inline strings and all three historical reference shapes remain readable. */
export async function decodeImageJobValue(value: unknown, resultJobId?: string): Promise<any> {
  if (Buffer.isBuffer(value)) return value;
  if (object(value)) {
    if ("$imageJobBase64" in value) return (await decodeImageJobValue(value.$imageJobBase64, resultJobId)).toString("base64");
    if ("$imageJobDataURL" in value) return value.$imageJobDataURL + (await decodeImageJobValue(value.bytes, resultJobId)).toString("base64");
    if ("$imageJobBuffer" in value || "$imageJobInlineBuffer" in value) {
      // Payload metadata is untrusted, including historically saved payloads.
      // Only a caller holding the actual result job identity may read this store.
      if ("$imageJobStorage" in value && (!resultJobId || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)
        || !Number.isSafeInteger(value.size) || value.size < 0 || value.size > MAX_BYTES)) throw new Error("图片任务结果引用缺少有效身份或校验信息");
      const bytes = "$imageJobInlineBuffer" in value ? Buffer.from(value.$imageJobInlineBuffer, "base64")
        : value.$imageJobStorage ? await readImageJobResult(value.$imageJobBuffer, value.$imageJobStorage, MAX_BYTES, resultJobId)
        : (await readManagedObject(String(value.$imageJobBuffer), MAX_BYTES)).bytes;
      if (value.sha256 && (bytes.length !== value.size || hash(bytes) !== value.sha256)) throw new Error("图片任务结果校验失败");
      if (!value.$imageJobStorage && typeof value.$imageJobBuffer === "string") uploadedInputs.set(bytes, value.$imageJobBuffer);
      return bytes;
    }
    // Historical JSON Buffer snapshots from pre-codec writers.
    if (value.type === "Buffer" && Array.isArray(value.data) && value.data.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 255)) return Buffer.from(value.data);
  }
  if (Array.isArray(value)) return Promise.all(value.map(entry => decodeImageJobValue(entry, resultJobId)));
  if (object(value)) return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, entry]) => [key, await decodeImageJobValue(entry, resultJobId)])));
  return value;
}

/** Each result encode deduplicates its identical representations by hash.
 * A failed upload retains the paid bytes in the authoritative checkpoint, with
 * bounded failure evidence, rather than publishing a dangling object reference. */
export async function encodeImageJobResult(value: unknown, id: string): Promise<unknown> {
  const writes = new Map<string, Promise<unknown>>();
  const bytesRef = (bytes: Buffer): Promise<unknown> => {
    const sha256 = hash(bytes);
    let pending = writes.get(sha256);
    if (!pending) {
      pending = (async () => {
        const key = `image-job-results/${hash(Buffer.from(id))}/${sha256}.bin`;
        try {
          if (bytes.length > MAX_BYTES) throw new Error("checkpoint-size");
          const storage = await writeImageJobResult(bytes, key);
          return { $imageJobBuffer: `/media/${key}`, $imageJobStorage: storage, sha256, size: bytes.length };
        } catch {
          return { $imageJobInlineBuffer: bytes.toString("base64"), sha256, size: bytes.length, storageFailure: "CHECKPOINT_UPLOAD_FAILED" };
        }
      })();
      writes.set(sha256, pending);
    }
    return pending;
  };
  const visit = async (entry: unknown, field?: string): Promise<unknown> => {
    if (Buffer.isBuffer(entry)) return bytesRef(entry);
    if (reference(entry)) return entry;
    if (typeof entry === "string") {
      if ((field === "url" || field === undefined) && entry.startsWith("data:image/")) {
        const decoded = dataUrlToBytes(entry);
        if (decoded) return { $imageJobDataURL: entry.slice(0, entry.indexOf(",") + 1), bytes: await bytesRef(Buffer.from(decoded.bytes)) };
      } else if (field === "b64_json") {
        const decoded = dataUrlToBytes(`data:application/octet-stream;base64,${entry}`);
        if (decoded) return { $imageJobBase64: await bytesRef(Buffer.from(decoded.bytes)) };
      }
      // Do not silently decode malformed input with Buffer.from's permissive parser.
      return entry;
    }
    if (Array.isArray(entry)) return Promise.all(entry.map(item => visit(item)));
    if (object(entry)) {
      if (entry.type === "Buffer" && Array.isArray(entry.data) && entry.data.every((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 255)) return bytesRef(Buffer.from(entry.data));
      return Object.fromEntries(await Promise.all(Object.entries(entry).map(async ([key, item]) => [key, await visit(item, key)])));
    }
    return entry;
  };
  return visit(value);
}

/** Only paidOperations own this representation. Re-saving an internally hydrated
 * snapshot must not put its data URLs back in jsonb. Identity/CAS fields are copied. */
export async function encodeImageJobSnapshot(value: unknown, id: string): Promise<unknown> {
  if (!object(value) || !object(value.paidOperations)) return encodeImageJobValue(value, id);
  const attempts = async (items: ObjectValue): Promise<ObjectValue> => Object.fromEntries(await Promise.all(Object.entries(items).map(async ([key, attempt]) => {
    if (!object(attempt)) return [key, attempt];
    return [key, { ...attempt,
      ...("result" in attempt ? { result: await encodeImageJobResult(attempt.result, id) } : {}),
      ...(object(attempt.children) ? { children: await attempts(attempt.children) } : {}),
    }];
  })));
  return encodeImageJobValue({ ...value, paidOperations: await attempts(value.paidOperations) }, id);
}
