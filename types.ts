
export enum Role {
  AGENT = 'AGENT',
  SUPERVISOR = 'SUPERVISOR',
  ADMIN = 'ADMIN',
}

export enum AgentStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  WRAP_UP = 'WRAP_UP',
  OFFLINE = 'OFFLINE',
}

export enum CallStatus {
  DIALING = 'DIALING',
  RINGING = 'RINGING',
  ACTIVE = 'ACTIVE',
  HOLD = 'HOLD',
  ENDED = 'ENDED',
}

export type CallDirection = 'inbound' | 'outbound' | 'internal';

export interface TranscriptSegment {
  id: string;
  speaker: 'agent' | 'customer' | 'bot' | 'teammate';
  text: string;
  timestamp: number;
  isFinal?: boolean;
}

export interface CallAnalysis {
  summary: string;
  sentimentScore: number;
  sentimentLabel: 'Positive' | 'Neutral' | 'Negative';
  topics: string[];
  qaScore: number;
  dispositionSuggestion: string;
}

export interface CrmData {
  contactId?: string;
  platform: 'HubSpot' | 'Pipedrive' | 'Salesforce';
  syncedAt?: number;
  status: 'searching' | 'found' | 'syncing' | 'synced' | 'error';
}

export interface Call {
  id: string;
  direction: CallDirection;
  customerName: string;
  phoneNumber: string;
  queue: string;
  startTime: number;
  durationSeconds: number;
  status: CallStatus;
  transcript: TranscriptSegment[];
  roomId?: string;
  analysis?: CallAnalysis;
  crmData?: CrmData;
  agentId?: string;
  agentName?: string;
  targetAgentId?: string;
  participants?: string[];
  extension?: string;
  qaEvaluation?: QaEvaluation;
  handledByBot?: boolean;
  liveSentiment?: number;
  riskFlag?: string;
  isVideo?: boolean;
  isScreenSharing?: boolean;
  isMigrated?: boolean;
  legacyProvider?: string;
  emailSynced?: boolean;
  isRecording?: boolean;
  transcriptionEnabled?: boolean;
  expiresAt?: number;
  piiRedacted?: boolean;
  recordingUrl?: string;
}

export type RsvpStatus = 'pending' | 'accepted' | 'declined' | 'forwarded';

export interface MeetingAttendee {
  userId: string;
  status: RsvpStatus;
  reason?: string;
  forwardedTo?: string;
}

export interface Attachment {
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface MeetingMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
  attachments?: Attachment[];
}

export interface Reaction {
  userId: string;
  emoji: string;
  timestamp: number;
}

export interface Meeting {
  id: string;
  title: string;
  startTime: number;
  duration: number;
  organizerId: string;
  attendees: MeetingAttendee[];
  description: string;
  status: 'upcoming' | 'active' | 'ended';
  roomId?: string;
  isRecording?: boolean;
  messages?: MeetingMessage[];
  reactions?: Reaction[];
  isRecurring?: boolean;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly';
  cancelReason?: string;
}

export interface AppSettings {
  integrations: {
    hubSpot: {
      enabled: boolean;
      syncContacts: boolean;
      syncDeals: boolean;
      syncTasks: boolean;
      lastSync?: number;
      logs: IntegrationLog[];
    };
    webhooks: WebhookConfig[];
    schemaMappings: SchemaMapping[];
    pipedrive: boolean;
    salesforce: boolean;
  };
  compliance: {
    jurisdiction: 'US' | 'UK' | 'NG' | 'EU';
    pciMode: boolean;
    playConsentMessage: boolean;
    anonymizePii: boolean;
    retentionDays: string;
    exportEnabled: boolean;
  };
  subscription: {
    plan: 'Starter' | 'Growth' | 'Enterprise';
    seats: number;
    balance: number;
    autoTopUp: boolean;
    usage: {
      aiTokens: number;
      aiTokenLimit: number;
      voiceMinutes: number;
      voiceMinuteLimit: number;
    };
    nextBillingDate: string;
    paymentMethod: string;
  };
  ivr: IvrConfig;
  voice: {
    allowedNumbers: string[];
  };
  bot: BotConfig;
  auth: {
    inviteOnly: boolean;
    allowedDomains: string[];
    autoTenantByDomain: boolean;
    domainTenantMap: { domain: string; tenantId: string }[];
  };
  team: User[];
  workflows: WorkflowRule[];
}

export interface User {
  id: string;
  name: string;
  role: Role;
  avatarUrl: string;
  extension?: string;
  email?: string;
  status: 'active' | 'invited' | 'disabled';
  currentPresence?: AgentStatus;
  allowedNumbers?: string[];
  restrictOutboundNumbers?: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  type: ChannelType;
  status: 'draft' | 'running' | 'paused' | 'completed';
  targetCount: number;
  processedCount: number;
  successCount: number;
  aiPersona: string;
  hourlyStats: { hour: string; value: number }[];
}

export type ChannelType = 'sms' | 'whatsapp' | 'call' | 'email' | 'chat';

export interface Message {
  id: string;
  channel: ChannelType;
  sender: 'customer' | 'agent' | 'ai' | 'teammate';
  text: string;
  timestamp: number;
  attachments?: Attachment[];
}

export interface Conversation {
  id: string;
  contactName: string;
  contactPhone: string;
  channel: ChannelType;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
  messages: Message[];
  status: 'open' | 'closed';
  teammateId?: string;
  participantIds?: string[];
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  status: string;
  notes?: string;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface AiSuggestion {
  id: string;
  title: string;
  content: string;
  type: 'script' | 'action' | 'info';
  triggerPhrase?: string;
  confidence?: number;
}

export interface IvrOption {
  key: string;
  action: 'QUEUE' | 'VOICEMAIL' | 'BOT' | 'TRANSFER';
  target: string;
  label: string;
}

export interface IvrConfig {
  phoneNumber: string;
  welcomeMessage: string;
  options: IvrOption[];
}

export interface BotConfig {
  enabled: boolean;
  name: string;
  persona: string;
  deflectionGoal: number;
}

export interface WorkflowRule {
  id: string;
  name: string;
  isActive: boolean;
}

export interface QaEvaluation {
  id: string;
  callId: string;
  totalScore: number;
  overallFeedback: string;
}

export interface KbArticle {
  id: string;
  title: string;
  content: string;
  tags: string[];
  category: string;
  lastUpdated: number;
}

export interface CrmContact {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  ltv: number;
  tags: string[];
  lifecycleStage: string;
  ownerId?: string;
  platform?: 'HubSpot' | 'Pipedrive' | 'Salesforce';
}

export interface IntegrationLog {
  id: string;
  timestamp: number;
  event: string;
  status: 'success' | 'warning' | 'error';
  details: string;
}

export interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
}

export interface SchemaMapping {
  id: string;
  localField: string;
  remoteField: string;
}

export interface ToolAction {
  id: string;
  name: string;
  description: string;
  params: Record<string, any>;
  status: 'suggested' | 'approved' | 'executed';
}

export interface CrmTask {
  id: string;
  subject: string;
  status: string;
  dueDate: number;
}

export type MigrationProvider = 'Genesys' | 'Twilio' | 'Five9' | 'AmazonConnect';

export interface QueueConfig {
  id: string;
  name: string;
  description: string;
  slaTarget: number;
}

export interface DispositionConfig {
  id: string;
  label: string;
  category: 'positive' | 'neutral' | 'negative';
}
