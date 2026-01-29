
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
  deleteDoc
} from "firebase/firestore";
import { getAuth, onAuthStateChanged, signInAnonymously, signOut } from "firebase/auth";

/**
 * REPLACING PLACEHOLDER CONFIG:
 * To make this app work for real colleagues:
 * 1. Go to Firebase Console -> Project Settings
 * 2. Add a Web App and copy the config here.
 */
const firebaseConfig = {
  apiKey: "SIMULATED_KEY", // Replace with your Firebase API Key
  authDomain: "connect-ai-demo.firebaseapp.com",
  projectId: "connect-ai-demo",
  storageBucket: "connect-ai-demo.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

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
  signInAnonymously, 
  signOut 
};
