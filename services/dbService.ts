
import { db, collection, doc, setDoc, getDoc, updateDoc, addDoc, query, orderBy, limit, onSnapshot, where, deleteDoc, getDocs } from './firebase';
import { Call, Lead, AppSettings, Conversation, User, Message, MeetingMessage } from '../types';

const CALLS_COLLECTION = 'calls';
const LEADS_COLLECTION = 'leads';
const SETTINGS_COLLECTION = 'settings';
const CONVERSATIONS_COLLECTION = 'conversations';
const USERS_COLLECTION = 'users';
const MESSAGES_COLLECTION = 'messages';
const MEETING_MESSAGES_COLLECTION = 'meetingMessages';

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

export const fetchHistoricalCalls = (callback: (calls: Call[]) => void, onError?: (error: Error) => void) => {
  const q = query(collection(db, CALLS_COLLECTION), orderBy('startTime', 'desc'), limit(100));
  return onSnapshot(q, (snapshot) => {
    const calls = snapshot.docs.map(doc => doc.data() as Call);
    callback(calls);
  }, (error) => {
    if (onError) onError(error as Error);
    else console.warn('fetchHistoricalCalls snapshot error:', error);
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

export const fetchLeads = (callback: (leads: Lead[]) => void, onError?: (error: Error) => void) => {
  const q = query(collection(db, LEADS_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const leads = snapshot.docs.map(doc => doc.data() as Lead);
    callback(leads);
  }, (error) => {
    if (onError) onError(error as Error);
    else console.warn('fetchLeads snapshot error:', error);
  });
};

export const saveUser = async (user: User) => {
  const userRef = doc(db, USERS_COLLECTION, user.id);
  await setDoc(userRef, user, { merge: true });
};

export const fetchUsers = (callback: (users: User[]) => void, onError?: (error: Error) => void) => {
  const q = query(collection(db, USERS_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const users = snapshot.docs.map((doc) => doc.data() as User);
    callback(users);
  }, (error) => {
    if (onError) onError(error as Error);
    else console.warn('fetchUsers snapshot error:', error);
  });
};

export const upsertConversation = async (conversation: Conversation & { participantIds?: string[] }) => {
  const convoRef = doc(db, CONVERSATIONS_COLLECTION, conversation.id);
  await setDoc(convoRef, {
    ...conversation,
    participantIds: conversation.participantIds || [],
    updatedAt: Date.now(),
  }, { merge: true });
};

export const fetchConversations = (userId: string, callback: (conversations: Conversation[]) => void, onError?: (error: Error) => void) => {
  const q = query(
    collection(db, CONVERSATIONS_COLLECTION),
    where('participantIds', 'array-contains', userId),
    orderBy('lastMessageTime', 'desc'),
    limit(200)
  );
  return onSnapshot(q, (snapshot) => {
    const convos = snapshot.docs.map(doc => ({ ...(doc.data() as Conversation), id: doc.id, messages: (doc.data() as any).messages || [] }));
    callback(convos);
  }, (error) => {
    if (onError) onError(error as Error);
    else console.warn('fetchConversations snapshot error:', error);
  });
};

export const fetchConversationMessages = (conversationId: string, callback: (messages: Message[]) => void, onError?: (error: Error) => void) => {
  const q = query(
    collection(db, MESSAGES_COLLECTION),
    where('conversationId', '==', conversationId),
    orderBy('timestamp', 'asc'),
    limit(500)
  );
  return onSnapshot(q, (snapshot) => {
    const msgs = snapshot.docs.map(doc => ({ ...(doc.data() as Message), id: doc.id }));
    callback(msgs);
  }, (error) => {
    if (onError) onError(error as Error);
    else console.warn('fetchConversationMessages snapshot error:', error);
  });
};

export const sendConversationMessage = async (conversationId: string, message: Message) => {
  await addDoc(collection(db, MESSAGES_COLLECTION), { ...message, conversationId });
  const convoRef = doc(db, CONVERSATIONS_COLLECTION, conversationId);
  await setDoc(convoRef, {
    lastMessage: message.text || 'Attachment Packet',
    lastMessageTime: message.timestamp,
    updatedAt: Date.now(),
  }, { merge: true });
};

export const fetchMeetingMessages = (callId: string, callback: (messages: MeetingMessage[]) => void, onError?: (error: Error) => void) => {
  const q = query(
    collection(db, MEETING_MESSAGES_COLLECTION),
    where('callId', '==', callId),
    orderBy('timestamp', 'asc'),
    limit(500)
  );
  return onSnapshot(q, (snapshot) => {
    const msgs = snapshot.docs.map(doc => ({ ...(doc.data() as MeetingMessage), id: doc.id }));
    callback(msgs);
  }, (error) => {
    if (onError) onError(error as Error);
    else console.warn('fetchMeetingMessages snapshot error:', error);
  });
};

export const sendMeetingMessage = async (callId: string, message: MeetingMessage) => {
  await addDoc(collection(db, MEETING_MESSAGES_COLLECTION), { ...message, callId });
};

export const purgeExpiredCalls = async (now = Date.now()) => {
  const q = query(
    collection(db, CALLS_COLLECTION),
    where('expiresAt', '<=', now),
    limit(200)
  );
  const snapshot = await getDocs(q);
  await Promise.all(snapshot.docs.map(docRef => deleteDoc(docRef.ref)));
  return snapshot.size;
};

export const fetchAgentCalls = (agentId: string, limitCount: number, callback: (calls: Call[]) => void) => {
  const q = query(
    collection(db, CALLS_COLLECTION),
    where('agentId', '==', agentId),
    orderBy('startTime', 'desc'),
    limit(limitCount)
  );
  return onSnapshot(q, (snapshot) => {
    const calls = snapshot.docs.map(doc => doc.data() as Call);
    callback(calls);
  });
};

export interface CallLogFilters {
  agentId?: string;
  direction?: string;
  startDate?: number;
  endDate?: number;
  status?: string;
}

export const queryCallLogs = async (filters: CallLogFilters) => {
  let q = query(collection(db, CALLS_COLLECTION), orderBy('startTime', 'desc'));

  if (filters.agentId) {
    q = query(q, where('agentId', '==', filters.agentId));
  }
  if (filters.direction) {
    q = query(q, where('direction', '==', filters.direction));
  }
  if (filters.status) {
    q = query(q, where('status', '==', filters.status));
  }
  if (filters.startDate) {
    q = query(q, where('startTime', '>=', filters.startDate));
  }
  if (filters.endDate) {
    q = query(q, where('startTime', '<=', filters.endDate));
  }

  // Note: Compound queries in Firestore require indices. 
  // If this fails, we might need to filter client-side for some fields or create indices.
  // For now, we'll fetch and filter if catch error, or just rely on simple queries.
  // To avoid index issues for this demo, we might want to just fetch last 1000 and filter in memory if volume is low.

  // Limiting logic for safety
  const snapshot = await getDocs(query(q, limit(100)));
  return snapshot.docs.map(doc => doc.data() as Call);
};
