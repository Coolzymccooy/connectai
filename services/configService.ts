import { QueueConfig, DispositionConfig } from '../types';
import { apiGet } from './apiClient';

// Mock Queues - In a real app, this comes from GET /api/queues
const MOCK_QUEUES: QueueConfig[] = [
  { id: 'q_sales', name: 'Sales', description: 'Inbound sales inquiries', slaTarget: 30 },
  { id: 'q_support', name: 'Support / Billing', description: 'General customer support', slaTarget: 60 },
  { id: 'q_tech', name: 'Technical Support', description: 'L2 Technical issues', slaTarget: 120 },
  { id: 'q_out_sales', name: 'Outbound Sales', description: 'Campaign dialing', slaTarget: 0 },
];

// Mock Dispositions - In a real app, this comes from GET /api/dispositions
const MOCK_DISPOSITIONS: DispositionConfig[] = [
  { id: 'd_resolved', label: 'Resolved', category: 'positive' },
  { id: 'd_callback', label: 'Follow-up Needed', category: 'neutral' },
  { id: 'd_sales_opp', label: 'Sales Opportunity', category: 'positive' },
  { id: 'd_vm', label: 'Voicemail Left', category: 'neutral' },
  { id: 'd_wrong_num', label: 'Wrong Number', category: 'negative' },
  { id: 'd_not_interested', label: 'Not Interested', category: 'negative' },
  { id: 'd_escalated', label: 'Escalated', category: 'neutral' },
];

export const fetchQueues = async (): Promise<QueueConfig[]> => {
  try {
    const data = await apiGet('/queues');
    return data || MOCK_QUEUES;
  } catch {
    return MOCK_QUEUES;
  }
};

export const fetchDispositions = async (): Promise<DispositionConfig[]> => {
  try {
    const data = await apiGet('/dispositions');
    return data || MOCK_DISPOSITIONS;
  } catch {
    return MOCK_DISPOSITIONS;
  }
};
