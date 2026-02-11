import { initFirebaseAdmin } from './firebaseAdminService.js';

let storageBucket = null;

export const initStorage = async () => {
  if (storageBucket) return storageBucket;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) return null;
  const admin = await initFirebaseAdmin();
  if (!admin) return null;
  storageBucket = admin.storage().bucket(bucketName);
  return storageBucket;
};

export const isStorageEnabled = async () => {
  const bucket = await initStorage();
  return Boolean(bucket);
};

export const uploadRecordingBuffer = async (objectPath, buffer, contentType = 'audio/wav') => {
  const bucket = await initStorage();
  if (!bucket) return null;
  const file = bucket.file(objectPath);
  await file.save(buffer, {
    contentType,
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=3600',
    },
  });
  return { storageProvider: 'gcs', storagePath: objectPath, size: buffer.length };
};

export const downloadRecordingBuffer = async (objectPath) => {
  const bucket = await initStorage();
  if (!bucket) return null;
  const file = bucket.file(objectPath);
  const [data] = await file.download();
  return data;
};
