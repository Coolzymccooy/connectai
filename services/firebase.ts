
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  query,
  onSnapshot,
  orderBy,
  limit,
  addDoc,
  where,
  getDocs,
  deleteDoc,
  setLogLevel
} from "firebase/firestore";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, updateProfile, GoogleAuthProvider, signInWithPopup, connectAuthEmulator, signInAnonymously } from "firebase/auth";
import { connectFirestoreEmulator } from "firebase/firestore";

const FIREBASE_DISABLED = (import.meta.env as any).VITE_FIREBASE_DISABLED === 'true';
const FIREBASE_SILENT = (import.meta.env as any).VITE_FIREBASE_SILENT === 'true';
if (FIREBASE_DISABLED || FIREBASE_SILENT) {
  setLogLevel('silent');
}

const USE_EMULATOR = (import.meta.env as any).VITE_FIREBASE_USE_EMULATOR === 'true';
const EMULATOR_HOST = (import.meta.env as any).VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
const FIRESTORE_EMULATOR_PORT = Number((import.meta.env as any).VITE_FIREBASE_FIRESTORE_EMULATOR_PORT || 8080);
const AUTH_EMULATOR_PORT = Number((import.meta.env as any).VITE_FIREBASE_AUTH_EMULATOR_PORT || 9099);

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const requiredKeys = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missingKeys = requiredKeys.filter((k) => !(import.meta.env as any)[k]);
if (missingKeys.length > 0) {
  console.warn(`[firebase] Missing env vars: ${missingKeys.join(', ')}`);
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (USE_EMULATOR) {
  try {
    connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, { disableWarnings: true });
    console.info(`[firebase] Connected to emulators at ${EMULATOR_HOST} (firestore:${FIRESTORE_EMULATOR_PORT}, auth:${AUTH_EMULATOR_PORT})`);
  } catch (err) {
    console.warn('Failed to connect Firebase emulators:', err);
  }
}

export { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  query, 
  onSnapshot, 
  orderBy, 
  limit, 
  addDoc, 
  where, 
  getDocs, 
  deleteDoc,
  onAuthStateChanged, 
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously
};
