import "server-only";
import {privateMedia,storageDriver,writeStoredObject,MEDIA_URL_PREFIX,safeKey,backend,publicBaseForDriver,CACHE_CONTROL} from "./object-storage/runtime";
export async function uploadImage(
  bytes: Uint8Array,
  contentType: string,
  key: string,
  cacheControl: string = CACHE_CONTROL,
  owner?: string
): Promise<string> {
  if (privateMedia) {
    const result = await writeStoredObject(bytes, contentType, key);
    const { registerMediaAsset } = await import("./media-assets");
    // Registration/preview failure must not discard the mirrored original.
    await registerMediaAsset(key, bytes, contentType, result.remoteReady, owner).catch(() => {});
    return `${MEDIA_URL_PREFIX}/${safeKey(key)}`;
  }
  const normalized = safeKey(key);
  if (storageDriver === "local") {
    await backend.put(normalized, bytes, contentType, cacheControl);
    return `${MEDIA_URL_PREFIX}/${normalized}`;
  }
  await backend.put(normalized, bytes, contentType, cacheControl);
  const publicBase = publicBaseForDriver();
  return publicBase ? `${publicBase}/${normalized}` : `${MEDIA_URL_PREFIX}/${normalized}`;
}
