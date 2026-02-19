
export enum Role {
  AGENT = 'AGENT',
  SUPERVISOR = 'SUPERVISOR',
  ADMIN = 'ADMIN',
}

export enum AgentStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  AWAY = 'AWAY',
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
  customerEmail?: string;
  customerExtension?: string;
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
  agentEmail?: string;
  agentExtension?: string;
  targetAgentId?: string;
  targetAgentEmail?: string;
  participants?: string[];
  participantIdentityKeys?: string[];
  agentIdentityKey?: string;
  targetIdentityKey?: string;
  extension?: string;
  qaEvaluation?: QaEvaluation;
  handledByBot?: boolean;
  liveSentiment?: number;
  riskFlag?: string;
  isVideo?: boolean;
  isScreenSharing?: boolean;
  screenShareOwnerId?: string;
  hostId?: string;
  lobbyEnabled?: boolean;
  meetingLocked?: boolean;
  waitingRoom?: string[];
  isMigrated?: boolean;
  legacyProvider?: string;
  emailSynced?: boolean;
  isRecording?: boolean;
  transcriptionEnabled?: boolean;
  expiresAt?: number;
  piiRedacted?: boolean;
  recordingUrl?: string;
  recordingId?: string;
  twilioCallSid?: string;
  conferenceName?: string;
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
  threadIds?: string[];
  canonicalRoomId?: string;
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
  broadcastCenter?: {
    messages: BroadcastMessage[];
  };
  desktopRelease?: {
    latestVersion: string;
    windowsDownloadUrl: string;
    releaseNotesUrl: string;
    releasesPageUrl: string;
    publishedAt: string;
    fileName?: string;
    fileSizeLabel?: string;
    unsignedBeta: boolean;
  };
  integrations: {
    hubSpot: {
      enabled: boolean;
      syncContacts: boolean;
      syncDeals: boolean;
      syncTasks: boolean;
      lastSync?: number;
      logs: IntegrationLog[];
    };
    primaryCrm?: 'HubSpot' | 'Salesforce' | 'Pipedrive';
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
    currency?: CurrencyCode;
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

export type BroadcastAudience = 'ALL' | 'AGENT' | 'SUPERVISOR' | 'ADMIN';
export type CurrencyCode = 'USD' | 'GBP' | 'NGN';

export interface BroadcastDeliveryLog {
  email: string;
  status: 'DELIVERED' | 'FAILED' | 'SKIPPED';
  reason?: string;
  at: string;
}

export interface BroadcastMessage {
  id: string;
  title: string;
  body: string;
  audience: BroadcastAudience;
  inApp: boolean;
  email: boolean;
  status: 'SENT' | 'ARCHIVED';
  createdAt: string;
  sentAt?: string;
  createdByName?: string;
  delivery?: {
    attempted: number;
    delivered: number;
    failed: number;
    provider?: 'sendgrid' | 'none';
    logs: BroadcastDeliveryLog[];
  };
}

export interface User {
  id: string;
  name: string;
  role: Role;
  avatarUrl: string;
  extension?: string;
  email?: string;
  department?: string;
  status: 'active' | 'invited' | 'disabled';
  currentPresence?: AgentStatus;
  allowedNumbers?: string[];
  restrictOutboundNumbers?: boolean;
  canAccessRecordings?: boolean;
}

export interface AudienceFilter {
  industry?: string;
  lifecycleStage?: string;
  region?: string;
  minEngagement?: number;
  consentRequired?: boolean;
}

export interface CampaignChannelConfig {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

export interface JourneyStep {
  id: string;
  type: 'send_email' | 'send_sms' | 'send_whatsapp' | 'wait' | 'branch' | 'notify_sales' | 'update_field';
  label: string;
  delayHours?: number;
}

export interface CampaignMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}

export interface CampaignContent {
  emailSubject?: string;
  emailBody?: string;
  smsBody?: string;
  whatsappBody?: string;
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
  audience?: AudienceFilter;
  channels?: CampaignChannelConfig;
  journey?: JourneyStep[];
  metrics?: CampaignMetrics;
  content?: CampaignContent;
}

export type ChannelType = 'sms' | 'whatsapp' | 'call' | 'email' | 'chat';

export interface Message {
  id: string;
  channel: ChannelType;
  sender: 'customer' | 'agent' | 'ai' | 'teammate';
  senderId?: string;
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
  lastSenderId?: string;
  lastSenderName?: string;
  unreadCount: number;
  messages: Message[];
  status: 'open' | 'closed';
  teammateId?: string;
  participantIds?: string[];
  participantEmails?: string[];
  participantIdentityKeys?: string[];
  participantNameKeys?: string[];
  aliases?: string[];
  bootstrapSent?: boolean;
  bootstrapSentAt?: number;
  consentStatus?: 'requested' | 'granted' | 'opted_out';
  consentChannel?: 'whatsapp' | 'sms' | 'voice' | 'chat';
  consentRequestedAt?: number;
  consentGivenAt?: number;
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  phone: string;
  email?: string;
  industry?: string;
  status: string;
  notes?: string;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  action?: {
    type: 'open-conversation';
    conversationId: string;
    label?: string;
  };
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

export interface DepartmentRoute {
  id: string;
  name: string;
  targetType: 'queue' | 'client' | 'phone';
  target: string;
}

export interface IvrConfig {
  phoneNumber: string;
  welcomeMessage: string;
  options: IvrOption[];
  departments?: DepartmentRoute[];
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
