const mongoose = require("mongoose");

const MediaFileSchema = new mongoose.Schema({
  fileId: {
    type: String,
    unique: true,
    required: true,
    default: () => `MED-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  },
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Assignment",
    required: true
  },
  fileType: {
    type: String,
    enum: ["photo", "video", "audio", "script", "document", "graphic"],
    required: true
  },
  filePath: String,
  url: String,
  thumbnailUrl: String,
  metadata: {
    resolution: String,
    duration: Number, // seconds
    size: Number, // bytes
    format: String,
    codec: String,
    cameraModel: String,
    gpsCoordinates: {
      lat: Number,
      lng: Number
    },
    timestamp: Date
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  approvalStatus: {
    type: String,
    enum: ["pending", "under-review", "approved", "rejected", "needs-revision"],
    default: "pending"
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  reviewComments: [{
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    comment: String,
    timestamp: { type: Date, default: Date.now },
    action: String
  }],
  tags: [String],
  description: String
}, { timestamps: true });

// Indexes for search
MediaFileSchema.index({ fileType: 1, approvalStatus: 1 });
MediaFileSchema.index({ "metadata.gpsCoordinates": "2dsphere" });
MediaFileSchema.index({ tags: 1 });

module.exports = mongoose.model("MediaFile", MediaFileSchema);