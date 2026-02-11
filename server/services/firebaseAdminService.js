import admin from 'firebase-admin';
import { readFile } from 'fs/promises';

let initialized = false;

const getServiceAccount = async () => {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) return JSON.parse(json);
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64) return JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  }
  return null;
};

export const initFirebaseAdmin = async () => {
  if (initialized) return admin;
  const serviceAccount = await getServiceAccount();
  if (!serviceAccount) return null;
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }
  initialized = true;
  return admin;
};

export const getFirestore = async () => {
  const adm = await initFirebaseAdmin();
  return adm ? adm.firestore() : null;
};
