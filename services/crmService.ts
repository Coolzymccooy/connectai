
import { db, collection, query, where, getDocs, limit } from './firebase';
import { CrmContact, CrmTask } from '../types';

export const lookupCrmContact = async (phoneNumber: string, platform: 'HubSpot' | 'Pipedrive' = 'HubSpot'): Promise<CrmContact | null> => {
  try {
    const contactsRef = collection(db, 'contacts');
    // Simple lookup simulation - in production we'd normalize phone numbers
    const q = query(contactsRef, where('phone', '==', phoneNumber), limit(1));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data() as CrmContact;
    }
    return null;
  } catch (e) {
    console.error("CRM Lookup Failed", e);
    return null;
  }
};

export const fetchCrmTasks = async (): Promise<CrmTask[]> => {
  const tasksRef = collection(db, 'tasks');
  const snapshot = await getDocs(tasksRef);
  return snapshot.docs.map(doc => doc.data() as CrmTask);
};
