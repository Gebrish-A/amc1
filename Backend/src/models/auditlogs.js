const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema({
  logId: {
    type: String,
    unique: true,
    required: true,
    default: () => `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  actionType: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  details: mongoose.Schema.Types.Mixed,
  entityType: {
    type: String,
    enum: ["User", "CoverageRequest", "Event", "Resource", "Assignment", "MediaFile", "Notification", "Report", "System"]
  },
  entityId: mongoose.Schema.Types.ObjectId,
  ipAddress: String,
  userAgent: String,
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    diff: mongoose.Schema.Types.Mixed
  }
}, { timestamps: true });

// Indexes for queries
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
AuditLogSchema.index({ actionType: 1, timestamp: -1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);