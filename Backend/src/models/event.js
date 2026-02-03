const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    unique: true,
    required: true,
    default: () => `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  },
  requestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CoverageRequest",
    required: true
  },
  startDateTime: {
    type: Date,
    required: true
  },
  endDateTime: {
    type: Date,
    required: true
  },
  location: {
    name: String,
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  description: String,
  status: {
    type: String,
    enum: ["scheduled", "in-progress", "completed", "cancelled", "postponed"],
    default: "scheduled"
  },
  calendarColor: {
    type: String,
    default: "#2196F3"
  },
  notes: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: String,
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Index for calendar queries
EventSchema.index({ startDateTime: 1, endDateTime: 1 });
EventSchema.index({ status: 1, startDateTime: 1 });

module.exports = mongoose.model("Event", EventSchema);