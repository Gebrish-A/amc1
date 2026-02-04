// C:\Users\NehZewd\Documents\hanii\Amediaa coverage final\Amediaa coverage final\Amediaa coverage final\Backend\src\models\notification.js
const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  notificationId: {
    type: String,
    unique: true,
    required: true,
    default: () => `NOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  },
  
  // =========== UPDATED: Enhanced Recipient Info ===========
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'recipientModel',
    required: true
  },
  recipientModel: {
    type: String,
    required: true,
    enum: ["User", "Crew"],
    default: "User"
  },
  recipientRole: {
    type: String,
    enum: ["reporter", "editor", "crew", "requester", "admin", "manager"],
    required: true
  },
  // ========================================================
  
  message: {
    type: String,
    required: true
  },
  
  // =========== UPDATED: Enhanced Type System ===========
  type: {
    type: String,
    enum: [
      // Original types
      "email", "sms", "in-app", "push", "telegram", "whatsapp",
      
      // NEW: Assignment-related types
      "assignment_accepted",      // Reporter accepted assignment
      "crew_assigned",            // Crew assigned to assignment
      "crew_status_update",       // Crew updated status
      "material_ready",           // Material ready for reporting
      "assignment_submitted",     // Reporter submitted assignment
      "request_approved",         // Request approved by editor
      "request_rejected",         // Request rejected
      "system_alert",             // System notification
      "message",                  // Direct message
      "reminder",                 // Reminder
      "coverage_request"          // New coverage request
    ],
    default: "in-app"
  },
  // ========================================================
  
  title: {
    type: String,
    default: "Notification"
  },
  
  sentDate: {
    type: Date,
    default: Date.now
  },
  readStatus: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  priority: {
    type: String,
    enum: ["low", "medium", "high", "urgent"],
    default: "medium"
  },
  relatedEntityType: String,
  relatedEntityId: mongoose.Schema.Types.ObjectId,
  actionUrl: String,
  
  // =========== NEW: Assignment Data ===========
  assignmentData: {
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request"
    },
    assignmentTitle: String,
    reporterName: String,
    reporterEmail: String,
    crewName: String,
    crewEmail: String,
    location: String,
    scheduledTime: Date,
    priority: String,
    status: String,
    reporterNotes: String,
    crewNotes: String
  },
  // ============================================
  
  channels: [{
    channel: String,
    sent: { type: Boolean, default: false },
    sentAt: Date,
    delivered: { type: Boolean, default: false },
    deliveredAt: Date
  }]
}, { 
  timestamps: true 
});

// Indexes for performance
NotificationSchema.index({ userId: 1, readStatus: 1, sentDate: -1 });
NotificationSchema.index({ type: 1, priority: 1, sentDate: -1 });
NotificationSchema.index({ recipientRole: 1, readStatus: 1 });
NotificationSchema.index({ "assignmentData.assignmentId": 1 });

// =========== NEW: Static Methods ===========
NotificationSchema.statics.createAssignmentNotification = function({
  userId,
  recipientModel = "User",
  recipientRole,
  type,
  title,
  message,
  assignmentData = null,
  priority = "medium",
  relatedEntityType = "Request",
  relatedEntityId = null,
  actionUrl = null
}) {
  return this.create({
    userId,
    recipientModel,
    recipientRole,
    type,
    title,
    message,
    assignmentData,
    priority,
    relatedEntityType,
    relatedEntityId: relatedEntityId || (assignmentData ? assignmentData.assignmentId : null),
    actionUrl
  });
};

// Find notifications by role
NotificationSchema.statics.findByRole = function(role, options = {}) {
  const query = { recipientRole: role };
  
  if (options.readStatus !== undefined) {
    query.readStatus = options.readStatus;
  }
  
  if (options.type) {
    query.type = options.type;
  }
  
  return this.find(query)
    .sort({ sentDate: -1 })
    .limit(options.limit || 50);
};

// Mark as read
NotificationSchema.methods.markAsRead = function() {
  this.readStatus = true;
  this.readAt = new Date();
  return this.save();
};

// Mark all as read for user
NotificationSchema.statics.markAllAsReadForUser = function(userId) {
  return this.updateMany(
    { userId, readStatus: false },
    { $set: { readStatus: true, readAt: new Date() } }
  );
};
// ===========================================

module.exports = mongoose.model("Notification", NotificationSchema);