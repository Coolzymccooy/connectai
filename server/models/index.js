import mongoose from 'mongoose';

const baseOptions = { timestamps: true };
const tenantField = {
  tenantId: { type: String, index: true, required: true },
};

const UserSchema = new mongoose.Schema({
  ...tenantField,
  name: { type: String, required: true },
  email: { type: String, index: true, required: true },
  role: { type: String, enum: ['AGENT', 'SUPERVISOR', 'ADMIN', 'ANALYST'], default: 'AGENT' },
  avatarUrl: String,
  status: { type: String, enum: ['AVAILABLE', 'BUSY', 'WRAP_UP', 'OFFLINE'], default: 'OFFLINE' },
  extension: String,
  authSubject: { type: String, index: true },
}, baseOptions);
UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

const TranscriptSchema = new mongoose.Schema({
  id: String,
  speaker: String,
  text: String,
  timestamp: Number,
  isFinal: Boolean,
}, { _id: false });

const CallSchema = new mongoose.Schema({
  ...tenantField,
  externalId: { type: String, index: true },
  direction: { type: String, enum: ['inbound', 'outbound', 'internal'] },
  customerName: String,
  phoneNumber: String,
  customerEmail: String,
  customerExtension: String,
  queue: String,
  agentId: String,
  agentName: String,
  agentEmail: String,
  agentExtension: String,
  targetAgentId: String,
  targetAgentEmail: String,
  participants: [String],
  extension: String,
  startTime: { type: Number, default: () => Date.now() },
  endTime: Number,
  durationSeconds: Number,
  status: { type: String, enum: ['DIALING', 'RINGING', 'ACTIVE', 'HOLD', 'ENDED'], default: 'DIALING' },
  transcript: [TranscriptSchema],
  analysis: Object,
  crmData: Object,
  qaEvaluation: Object,
  handledByBot: Boolean,
  liveSentiment: Number,
  riskFlag: String,
  isVideo: Boolean,
  isScreenSharing: Boolean,
  screenShareOwnerId: String,
  roomId: String,
  hostId: String,
  lobbyEnabled: Boolean,
  meetingLocked: Boolean,
  waitingRoom: [String],
  isRecording: Boolean,
  transcriptionEnabled: Boolean,
  recordingUrl: String,
  recordingId: String,
  twilioCallSid: { type: String, index: true },
  conferenceName: String,
  expiresAt: Number,
  piiRedacted: Boolean,
}, baseOptions);
CallSchema.index({ tenantId: 1, startTime: -1 });
CallSchema.index({ tenantId: 1, agentId: 1, startTime: -1 });
CallSchema.index({ tenantId: 1, externalId: 1 });

const CampaignSchema = new mongoose.Schema({
  ...tenantField,
  externalId: { type: String, index: true },
  name: String,
  type: { type: String, enum: ['voice', 'sms', 'whatsapp', 'call', 'email', 'chat'] },
  status: { type: String, enum: ['draft', 'running', 'paused', 'completed'] },
  leads: [{
    phone: String,
    name: String,
    status: { type: String, default: 'pending' },
  }],
  script: String,
  targetCount: Number,
  processedCount: Number,
  successCount: Number,
  aiPersona: String,
  hourlyStats: [{ hour: String, value: Number }],
}, baseOptions);

const DispositionSchema = new mongoose.Schema({
  ...tenantField,
  externalId: { type: String, index: true },
  label: { type: String, required: true },
  category: { type: String, enum: ['positive', 'neutral', 'negative'], default: 'neutral' },
  updatedAt: { type: Number, default: () => Date.now() },
}, baseOptions);

const RecordingSchema = new mongoose.Schema({
  ...tenantField,
  externalId: { type: String, index: true },
  callId: String,
  filename: String,
  mimeType: String,
  size: Number,
  storagePath: String,
  storageProvider: String,
  createdBy: String,
  createdAt: { type: Number, default: () => Date.now() },
  expiresAt: Number,
}, baseOptions);
RecordingSchema.index({ tenantId: 1, createdAt: -1 });
RecordingSchema.index({ tenantId: 1, callId: 1 });

const SettingsSchema = new mongoose.Schema({
  ...tenantField,
  externalId: { type: String, index: true },
  data: { type: Object, default: {} },
  updatedAt: { type: Number, default: () => Date.now() },
}, baseOptions);

const ConversationSchema = new mongoose.Schema({
  ...tenantField,
  externalId: { type: String, index: true },
  contactName: String,
  contactPhone: String,
  channel: String,
  lastMessage: String,
  lastMessageTime: Number,
  unreadCount: { type: Number, default: 0 },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  teammateId: String,
  participantIds: [String],
}, baseOptions);
ConversationSchema.index({ tenantId: 1, lastMessageTime: -1 });
ConversationSchema.index({ tenantId: 1, participantIds: 1 });

const MessageSchema = new mongoose.Schema({
  ...tenantField,
  externalId: { type: String, index: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  channel: String,
  sender: String,
  text: String,
  timestamp: { type: Number, default: () => Date.now() },
  attachments: [Object],
}, baseOptions);
MessageSchema.index({ tenantId: 1, conversationId: 1, timestamp: 1 });

const TenantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  plan: { type: String, default: 'growth' },
  metadata: Object,
}, baseOptions);

const JobSchema = new mongoose.Schema({
  ...tenantField,
  type: { type: String, required: true },
  status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending' },
  payload: Object,
  result: Object,
  error: String,
  attempts: { type: Number, default: 0 },
  nextRunAt: { type: Number, default: () => Date.now() },
}, baseOptions);

export const User = mongoose.model('User', UserSchema);
export const Call = mongoose.model('Call', CallSchema);
export const Campaign = mongoose.model('Campaign', CampaignSchema);
export const Disposition = mongoose.model('Disposition', DispositionSchema);
export const Recording = mongoose.model('Recording', RecordingSchema);
export const Setting = mongoose.model('Setting', SettingsSchema);
export const Conversation = mongoose.model('Conversation', ConversationSchema);
export const Message = mongoose.model('Message', MessageSchema);
export const Tenant = mongoose.model('Tenant', TenantSchema);
export const Job = mongoose.model('Job', JobSchema);
