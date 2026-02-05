import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  role: { type: String, enum: ['AGENT', 'SUPERVISOR', 'ADMIN'], default: 'AGENT' },
  avatarUrl: String,
  status: { type: String, enum: ['AVAILABLE', 'BUSY', 'OFFLINE'], default: 'OFFLINE' },
  extension: String
});

const CallSchema = new mongoose.Schema({
  direction: { type: String, enum: ['inbound', 'outbound', 'internal'] },
  customerName: String,
  phoneNumber: String,
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  durationSeconds: Number,
  status: { type: String, enum: ['active', 'completed', 'missed'] },
  transcript: [{
    speaker: String,
    text: String,
    timestamp: Number
  }],
  sentimentScore: Number,
  riskFlag: String,
  recordingUrl: String
});

const CampaignSchema = new mongoose.Schema({
  name: String,
  type: { type: String, enum: ['voice', 'sms', 'whatsapp'] },
  status: { type: String, enum: ['draft', 'running', 'paused', 'completed'] },
  leads: [{
    phone: String,
    name: String,
    status: { type: String, default: 'pending' } // pending, called, converted, failed
  }],
  script: String
});

export const User = mongoose.model('User', UserSchema);
export const Call = mongoose.model('Call', CallSchema);
export const Campaign = mongoose.model('Campaign', CampaignSchema);
