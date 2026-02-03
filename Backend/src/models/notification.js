const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  notificationId: {
    type: String,
    unique: true,
    required: true,
    default: () => `NOT-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ["email", "sms", "in-app", "push", "telegram", "whatsapp"],
    default: "in-app"
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
  channels: [{
    channel: String,
    sent: { type: Boolean, default: false },
    sentAt: Date,
    delivered: { type: Boolean, default: false },
    deliveredAt: Date
  }]
}, { timestamps: true });

// Indexes for performance
NotificationSchema.index({ userId: 1, readStatus: 1, sentDate: -1 });
NotificationSchema.index({ type: 1, priority: 1, sentDate: -1 });

module.exports = mongoose.model("Notification", NotificationSchema);