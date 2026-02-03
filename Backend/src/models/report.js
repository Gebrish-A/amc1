const mongoose = require("mongoose");

const ReportSchema = new mongoose.Schema({
  reportId: {
    type: String,
    unique: true,
    required: true,
    default: () => `RPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  },
  type: {
    type: String,
    enum: ["coverage-metrics", "resource-utilization", "performance-analytics", "financial", "content-analytics", "sla-compliance", "user-activity", "custom"],
    required: true
  },
  generatedDate: {
    type: Date,
    default: Date.now
  },
  parameters: mongoose.Schema.Types.Mixed,
  filePath: String,
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  data: mongoose.Schema.Types.Mixed,
  format: {
    type: String,
    enum: ["pdf", "excel", "csv", "json", "html"],
    default: "pdf"
  },
  schedule: {
    frequency: { type: String, enum: ["daily", "weekly", "monthly", "quarterly"] },
    nextRun: Date,
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  },
  isScheduled: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Indexes
ReportSchema.index({ type: 1, generatedDate: -1 });
ReportSchema.index({ generatedBy: 1, generatedDate: -1 });

module.exports = mongoose.model("Report", ReportSchema);