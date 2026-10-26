/** Compatibility public API; byte I/O, metadata reads and registration have separate owners. */
export { storageDriver, storageEnabled, privateMedia, remoteMediaAccess, MEDIA_DIR, storageKeyFromManagedUrl, isManagedImageUrl, writeStoredObject, presignStoredObject, fetchStoredObject, readPendingStoredObject, managedObjectExists, deleteImageByUrl, dataUrlToBytes } from "./object-storage/runtime";
export {readManagedObject} from "./object-storage/managed-read";
export {uploadImage} from "./media-upload";
