/** Compatibility public API; byte I/O, metadata reads and registration have separate owners. */
export { storageDriver, storageEnabled, privateMedia, remoteMediaAccess, deferredNasDelivery, MEDIA_DIR, storageKeyFromManagedUrl, isManagedImageUrl, writeStoredObject, mirrorStoredObject, presignStoredObject, fetchStoredObject, readPendingStoredObject, managedObjectExists, deleteImageByUrl, dataUrlToBytes } from "./object-storage/runtime";
export {readManagedObject} from "./object-storage/managed-read";
export {uploadImage} from "./media-upload";
export {hasVerifiedStoredMirror} from "./object-storage/runtime";
export {writeImageJobResult,readImageJobResult} from "./image-jobs/result-storage";
