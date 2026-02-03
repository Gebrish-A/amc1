const mongoose = require("mongoose");

const AssignmentSchema = new mongoose.Schema({
  assignmentId: {
    type: String,
    unique: true,
    required: true,
    default: () => `ASG-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Resource",
    required: true
  },
  assignedDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "in-progress", "completed", "cancelled", "declined"],
    default: "pending"
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  checkInTime: Date,
  checkOutTime: Date,
  notes: String,
  feedback: {
    rating: { type: Number, min: 1, max: 5 },
    comments: String,
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    submittedAt: Date
  }
}, { timestamps: true });

// Indexes
AssignmentSchema.index({ eventId: 1, resourceId: 1 });
AssignmentSchema.index({ status: 1, assignedDate: 1 });

module.exports = mongoose.model("Assignment", AssignmentSchema);