import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  actorId: String,
  actorName: String,
  action: String, // 'UPDATE_IVR', 'DELETE_USER', etc.
  target: String,
  metadata: Object
});

export const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
