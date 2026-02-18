
import { db, collection, doc, setDoc, getDoc, updateDoc, addDoc, query, orderBy, limit, onSnapshot, where, deleteDoc, getDocs } from './firebase';
import { Call, Lead, AppSettings, Conversation, User, Message, MeetingMessage } from '../types';
import { buildIdentityKey, normalizeEmail, normalizeName } from '../utils/identity';

const CALLS_COLLECTION = 'calls';
const LEADS_COLLECTION = 'leads';
const SETTINGS_COLLECTION = 'settings';
const CONVERSATIONS_COLLECTION = 'conversations';
const USERS_COLLECTION = 'users';
const MESSAGES_COLLECTION = 'messages';
const MEETING_MESSAGES_COLLECTION = 'meetingMessages';
const ROUTING_DEBUG = (import.meta.env as any).VITE_DEBUG_ROUTING === 'true';
const debugRouting = (...args: any[]) => {
  if (ROUTING_DEBUG) console.info('[routing][db]', ...args);
};

export type FirestoreErrorCode =
  | 'permission-denied'
  | 'unauthenticated'
  | 'network-blocked'
  | 'offline'
  | 'unknown';

const readErrorCode = (error: any) => String(error?.code || '').toLowerCase();
const readErrorMessage = (error: any) => String(error?.message || error || '').trim();

export const classifyFirestoreError = (error: any): FirestoreErrorCode => {
  const code = readErrorCode(error);
  const message = readErrorMessage(error).toLowerCase();
  if (code.includes('permission-denied') || message.includes('missing or insufficient permissions') || message.includes('insufficient permissions')) {
    return 'permission-denied';
  }
  if (code.includes('unauthenticated') || message.includes('request.auth') || message.includes('not authenticated') || message.includes('authentication required')) {
    return 'unauthenticated';
  }
  if (message.includes('err_blocked_by_client') || message.includes('blocked by client') || message.includes('failed to fetch') || message.includes('networkerror')) {
    return 'network-blocked';
  }
  if (code.includes('unavailable') || message.includes('offline') || message.includes('health ping timeout')) {
    return 'offline';
  }
  return 'unknown';
};

export const describeFirestoreError = (error: any) => {
  const code = classifyFirestoreError(error);
  const detail = readErrorMessage(error);
  const suffix = detail ? `: ${detail}` : '';
  if (code === 'permission-denied') return `permission-denied${suffix}`;
  if (code === 'unauthenticated') return `unauthenticated${suffix}`;
  if (code === 'network-blocked') return `network-blocked${suffix}`;
  if (code === 'offline') return `offline${suffix}`;
  return `unknown${suffix}`;
};

const toRealtimeError = (error: any) => new Error(describeFirestoreError(error));

const normalizeIdentityKey = (value?: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('email:')) return `email:${normalizeEmail(raw.slice(6))}`;
  if (raw.startsWith('id:')) return `id:${raw.slice(3).trim()}`;
  if (raw.startsWith('name:')) return `name:${normalizeName(raw.slice(5))}`;
  if (raw.includes('@')) return `email:${normalizeEmail(raw)}`;
  return raw.toLowerCase();
};

const uniqueIdentityKeys = (values: Array<string | undefined | null>): string[] =>
  Array.from(new Set(values.map((value) => normalizeIdentityKey(value || undefined)).filter((value) => Boolean(value) && value !== 'unknown')));

const uniqueEmails = (values: Array<string | undefined | null>): string[] =>
  Array.from(new Set(values.map((value) => normalizeEmail(value || undefined)).filter(Boolean)));

const uniqueNames = (values: Array<string | undefined | null>): string[] =>
  Array.from(new Set(values.map((value) => normalizeName(value || undefined)).filter(Boolean)));

const pruneUndefinedDeep = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(pruneUndefinedDeep).filter((v) => v !== undefined);
  }
  if (value && typeof value === 'object') {
    const out: any = {};
    Object.entries(value).forEach(([k, v]) => {
      const cleaned = pruneUndefinedDeep(v);
      if (cleaned !== undefined) out[k] = cleaned;
    });
    return out;
  }
  return value === undefined ? undefined : value;
};

const sanitizeUserForSave = (user: User): User => {
  const clone: any = { ...user };
  const optionalStringFields = ['email', 'extension', 'department'];
  optionalStringFields.forEach((key) => {
    if (clone[key] === undefined || clone[key] === null || clone[key] === '') {
      delete clone[key];
    }
  });
  if (!Array.isArray(clone.allowedNumbers) || clone.allowedNumbers.length === 0) delete clone.allowedNumbers;
  if (clone.restrictOutboundNumbers === undefined) delete clone.restrictOutboundNumbers;
  if (clone.canAccessRecordings === undefined) delete clone.canAccessRecordings;
  if (clone.currentPresence === undefined) delete clone.currentPresence;
  return pruneUndefinedDeep(clone) as User;
};

export const saveCall = async (call: Call) => {
  try {
    const callRef = doc(db, CALLS_COLLECTION, call.id);
    await setDoc(callRef, {
      ...pruneUndefinedDeep(call),
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
    const normalized = toRealtimeError(error);
    if (onError) onError(normalized);
    else console.warn('fetchHistoricalCalls snapshot error:', normalized.message);
  });
};

export const saveSettings = async (settings: AppSettings) => {
  try {
    const settingsRef = doc(db, SETTINGS_COLLECTION, 'global_config');
    await setDoc(settingsRef, pruneUndefinedDeep(settings));
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
  try {
    const leadRef = doc(db, LEADS_COLLECTION, lead.id);
    await setDoc(leadRef, pruneUndefinedDeep(lead), { merge: true });
    return { ok: true as const };
  } catch (error: any) {
    const normalized = describeFirestoreError(error);
    console.warn('syncLead failed', normalized);
    return { ok: false as const, error: normalized };
  }
};

export const fetchLeads = (callback: (leads: Lead[]) => void, onError?: (error: Error) => void) => {
  const q = query(collection(db, LEADS_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const leads = snapshot.docs.map(doc => doc.data() as Lead);
    callback(leads);
  }, (error) => {
    const normalized = toRealtimeError(error);
    if (onError) onError(normalized);
    else console.warn('fetchLeads snapshot error:', normalized.message);
  });
};

export const saveUser = async (user: User) => {
  try {
    const userRef = doc(db, USERS_COLLECTION, user.id);
    const payload = sanitizeUserForSave(user);
    await setDoc(userRef, payload, { merge: true });
    return true;
  } catch (err) {
    console.warn('saveUser failed', describeFirestoreError(err));
    return false;
  }
};

export const fetchUsers = (callback: (users: User[]) => void, onError?: (error: Error) => void) => {
  const q = query(collection(db, USERS_COLLECTION));
  return onSnapshot(q, (snapshot) => {
    const users = snapshot.docs.map((doc) => doc.data() as User);
    callback(users);
  }, (error) => {
    const normalized = toRealtimeError(error);
    if (onError) onError(normalized);
    else console.warn('fetchUsers snapshot error:', normalized.message);
  });
};

export const upsertConversation = async (conversation: Conversation & { participantIds?: string[] }) => {
  try {
    const convoRef = doc(db, CONVERSATIONS_COLLECTION, conversation.id);
    const participantIds = Array.from(new Set((conversation.participantIds || []).filter(Boolean)));
    const participantEmails = uniqueEmails(conversation.participantEmails || []);
    const participantNameKeys = uniqueNames(conversation.participantNameKeys || []);
    const participantIdentityKeys = uniqueIdentityKeys([
      ...(conversation.participantIdentityKeys || []),
      ...participantEmails.map((email) => `email:${email}`),
      ...participantIds.map((id) => `id:${id}`),
      ...participantNameKeys.map((name) => `name:${name}`),
    ]);
    const aliases = Array.from(new Set([...(conversation as any).aliases || [], conversation.id].filter(Boolean)));
    await setDoc(convoRef, pruneUndefinedDeep({
      ...conversation,
      participantIds,
      participantEmails,
      participantNameKeys,
      participantIdentityKeys,
      aliases,
      updatedAt: Date.now(),
    }), { merge: true });
    return { ok: true as const };
  } catch (error: any) {
    const normalized = describeFirestoreError(error);
    console.warn('upsertConversation failed', normalized);
    return { ok: false as const, error: normalized };
  }
};

export const fetchConversations = (
  userId: string,
  userEmail: string | undefined,
  userName: string | undefined,
  callback: (conversations: Conversation[]) => void,
  onError?: (error: Error) => void
) => {
  const normalizedEmail = normalizeEmail(userEmail);
  const normalizedName = normalizeName(userName);
  const emailIdentityToken = normalizedEmail ? `email:${normalizedEmail}` : '';
  const userIdentityKey = normalizeIdentityKey(buildIdentityKey({ id: userId, email: normalizedEmail, name: normalizedName }));
  const q = query(
    collection(db, CONVERSATIONS_COLLECTION)
  );
  return onSnapshot(q, (snapshot) => {
    const convos = snapshot.docs
      .map(doc => ({ ...(doc.data() as Conversation), id: doc.id, messages: (doc.data() as any).messages || [] }))
      .filter((conv) => {
        const participantIds = Array.isArray(conv.participantIds) ? conv.participantIds : [];
        const participantEmails = Array.isArray(conv.participantEmails) ? conv.participantEmails.map((value) => normalizeEmail(value)) : [];
        const participantNameKeys = Array.isArray(conv.participantNameKeys) ? conv.participantNameKeys.map((value) => normalizeName(value)) : [];
        const participantIdentityKeys = Array.isArray(conv.participantIdentityKeys)
          ? conv.participantIdentityKeys.map((value) => normalizeIdentityKey(value))
          : [];
        const messages = Array.isArray(conv.messages) ? conv.messages : [];
        const idMatch = participantIds.includes(userId);
        const emailMatch = normalizedEmail ? participantEmails.includes(normalizedEmail) : false;
        const identityMatch = userIdentityKey ? participantIdentityKeys.includes(userIdentityKey) : false;
        const identityKeyMatch = emailIdentityToken ? String(conv.id || '').includes(emailIdentityToken) : false;
        const idTokenMatch = userId ? String(conv.id || '').includes(userId) : false;
        const teammateMatch = conv.teammateId === userId;
        const nameKeyMatch = normalizedName ? participantNameKeys.includes(normalizedName) : false;
        const contactNameMatch = normalizedName ? (conv.channel === 'chat' && normalizeName(conv.contactName) === normalizedName) : false;
        const lastSenderMatch = conv.lastSenderId === userId;
        const inlineMessageMatch = messages.some((m: any) => m?.senderId === userId);
        return idMatch || emailMatch || identityMatch || identityKeyMatch || idTokenMatch || teammateMatch || nameKeyMatch || contactNameMatch || lastSenderMatch || inlineMessageMatch;
      })
      .sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0))
      .slice(0, 200);
    debugRouting('fetchConversations', {
      userId,
      userIdentityKey,
      matched: convos.length,
    });
    callback(convos);
  }, (error) => {
    const normalized = toRealtimeError(error);
    if (onError) onError(normalized);
    else console.warn('fetchConversations snapshot error:', normalized.message);
  });
};

export const fetchConversationMessages = (conversationId: string, callback: (messages: Message[]) => void, onError?: (error: Error) => void) => {
  const q = query(
    collection(db, MESSAGES_COLLECTION),
    where('conversationId', '==', conversationId)
  );
  return onSnapshot(q, (snapshot) => {
    const msgs = snapshot.docs
      .map((doc) => {
        const payload = doc.data() as Message;
        const logicalId = String((payload as any)?.id || '').trim();
        return { ...payload, id: logicalId || doc.id };
      })
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-500);
    callback(msgs);
  }, (error) => {
    const normalized = toRealtimeError(error);
    if (onError) onError(normalized);
    else console.warn('fetchConversationMessages snapshot error:', normalized.message);
  });
};

export const sendConversationMessage = async (
  conversationId: string,
  message: Message,
  metadata?: Partial<Conversation>
) : Promise<{ ok: true } | { ok: false; error: string }> => {
  debugRouting('sendConversationMessage.start', {
    conversationId,
    messageId: message?.id,
    senderId: message?.senderId,
    timestamp: message?.timestamp,
  });
  try {
    await addDoc(collection(db, MESSAGES_COLLECTION), pruneUndefinedDeep({ ...message, conversationId }));
    const convoRef = doc(db, CONVERSATIONS_COLLECTION, conversationId);
    const convoSnap = await getDoc(convoRef);
    const existing = convoSnap.exists() ? (convoSnap.data() as Conversation) : null;
    const history = Array.isArray(metadata?.messages)
      ? metadata!.messages!
      : (Array.isArray(existing?.messages) ? existing!.messages : []);
    const mergedMessages = [...history, message]
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-250);
    const aliases = Array.from(
      new Set([...(existing?.aliases || []), ...(metadata?.aliases || []), conversationId].filter(Boolean))
    );
    const patch: Partial<Conversation> & { updatedAt: number } = {
      lastMessage: message.text || 'Attachment Packet',
      lastMessageTime: message.timestamp,
      lastSenderId: message.senderId || '',
      lastSenderName: metadata?.lastSenderName || '',
      messages: mergedMessages,
      updatedAt: Date.now(),
      aliases,
    };
    const participantIds = Array.from(new Set([...(existing?.participantIds || []), ...(metadata?.participantIds || [])].filter(Boolean)));
    const participantEmails = uniqueEmails([...(existing?.participantEmails || []), ...(metadata?.participantEmails || [])]);
    const participantNameKeys = uniqueNames([...(existing?.participantNameKeys || []), ...(metadata?.participantNameKeys || [])]);
    const participantIdentityKeys = uniqueIdentityKeys([
      ...(existing?.participantIdentityKeys || []),
      ...(metadata?.participantIdentityKeys || []),
      ...participantEmails.map((email) => `email:${email}`),
      ...participantIds.map((id) => `id:${id}`),
      ...participantNameKeys.map((name) => `name:${name}`),
    ]);
    if (participantIds.length) patch.participantIds = participantIds;
    if (participantEmails.length) patch.participantEmails = participantEmails;
    if (participantNameKeys.length) patch.participantNameKeys = participantNameKeys;
    if (participantIdentityKeys.length) patch.participantIdentityKeys = participantIdentityKeys;
    if (metadata?.teammateId) patch.teammateId = metadata.teammateId;
    if (metadata?.contactName) patch.contactName = metadata.contactName;
    if (metadata?.contactPhone) patch.contactPhone = metadata.contactPhone;
    debugRouting('sendConversationMessage', {
      conversationId,
      messageId: message.id,
      participantIdentityKeys: patch.participantIdentityKeys,
      aliases,
    });
    await setDoc(convoRef, pruneUndefinedDeep(patch as any), { merge: true });
    return { ok: true as const };
  } catch (error: any) {
    const normalized = describeFirestoreError(error);
    debugRouting('sendConversationMessage.error', { conversationId, messageId: message?.id, error: normalized });
    console.warn('sendConversationMessage failed', normalized);
    return { ok: false as const, error: normalized };
  }
};

export const fetchMeetingMessages = (
  canonicalRoomId: string,
  callback: (messages: MeetingMessage[]) => void,
  onError?: (error: Error) => void
) => {
  const buckets = new Map<string, MeetingMessage[]>();
  const dedupeMeetingMessageKey = (message: MeetingMessage) =>
    `${String(message.id || '').trim()}::${String(message.senderId || '').trim()}::${Number(message.timestamp || 0)}`;
  const emit = () => {
    const merged = new Map<string, MeetingMessage>();
    buckets.forEach((messages) => {
      messages.forEach((message) => {
        const dedupeKey = dedupeMeetingMessageKey(message);
        if (!merged.has(dedupeKey)) merged.set(dedupeKey, message);
      });
    });
    const ordered = Array.from(merged.values())
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-500);
    callback(ordered);
  };

  const q = query(
    collection(db, MEETING_MESSAGES_COLLECTION),
    where('threadIds', 'array-contains', canonicalRoomId)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((docSnap) => {
      const payload = docSnap.data() as MeetingMessage & { id?: string };
      return {
        ...payload,
        id: payload.id || docSnap.id,
      };
    });
    buckets.set(canonicalRoomId, messages);
    emit();
  }, (error) => {
    const normalized = toRealtimeError(error);
    if (onError) onError(normalized);
    else console.warn('fetchMeetingMessages snapshot error:', normalized.message);
  });

  return () => unsubscribe();
};

export const sendMeetingMessage = async (
  callId: string,
  message: MeetingMessage,
  metadata?: { roomId?: string; legacyCallId?: string }
) : Promise<{ ok: true } | { ok: false; error: string }> => {
  const roomId = metadata?.roomId || callId;
  const threadIds = Array.from(new Set([callId, roomId, metadata?.legacyCallId].filter(Boolean)));
  const payload = { ...message, roomId, callIds: threadIds, canonicalCallId: callId, threadIds, canonicalRoomId: roomId };
  debugRouting('sendMeetingMessage', {
    messageId: message.id,
    callId,
    threadIds,
  });
  try {
    await addDoc(collection(db, MEETING_MESSAGES_COLLECTION), pruneUndefinedDeep({ ...payload, callId: roomId }));
    return { ok: true as const };
  } catch (error: any) {
    const normalized = describeFirestoreError(error);
    console.warn('sendMeetingMessage failed', normalized);
    return { ok: false as const, error: normalized };
  }
};

export const pingFirestore = async () => {
  try {
    const pingRef = doc(db, '__health', 'ping');
    await setDoc(pingRef, { ts: Date.now() }, { merge: true });
    await getDoc(pingRef);
    return { ok: true as const };
  } catch (error: any) {
    return { ok: false as const, error: describeFirestoreError(error) };
  }
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
