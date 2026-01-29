
import { db, collection, doc, setDoc, getDoc, updateDoc, addDoc, query, orderBy, limit, onSnapshot } from './firebase';
import { Call, Lead, AppSettings, Conversation, User } from '../types';

const CALLS_COLLECTION = 'calls';
const LEADS_COLLECTION = 'leads';
const SETTINGS_COLLECTION = 'settings';
const CONVERSATIONS_COLLECTION = 'conversations';
const USERS_COLLECTION = 'users';

export const saveCall = async (call: Call) => {
  try {
    const callRef = doc(db, CALLS_COLLECTION, call.id);
    await setDoc(callRef, {
      ...call,
      updatedAt: Date.now()
    }, { merge: true });
    return true;
  } catch (e) {
    console.error("Error saving call:", e);
    return false;
  }
};

export const fetchHistoricalCalls = (callback: (calls: Call[]) => void) => {
  const q = query(collection(db, CALLS_COLLECTION), orderBy('startTime', 'desc'), limit(100));
  return onSnapshot(q, (snapshot) => {
    const calls = snapshot.docs.map(doc => doc.data() as Call);
    callback(calls);
  });
};

export const saveSettings = async (settings: AppSettings) => {
  try {
    const settingsRef = doc(db, SETTINGS_COLLECTION, 'global_config');
    await setDoc(settingsRef, settings);
    return true;
  } catch (e) {
    return false;
  }
};

export const fetchSettings = async (): Promise<AppSettings | null> => {
  const docRef = doc(db, SETTINGS_COLLECTION, 'global_config');
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() as AppSettings : null;
};

export const syncLead = async (lead: Lead) => {
  const leadRef = doc(db, LEADS_COLLECTION, lead.id);
  await setDoc(leadRef, lead, { merge: true });
};

export const fetchLeads = (callback: (leads: Lead[]) => void) => {
  const q = query(collection(db, LEADS_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const leads = snapshot.docs.map(doc => doc.data() as Lead);
    callback(leads);
  });
};

export const saveUser = async (user: User) => {
  const userRef = doc(db, USERS_COLLECTION, user.id);
  await setDoc(userRef, user, { merge: true });
};
