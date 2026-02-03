// src/models/index.js
const User = require("./user");
const CoverageRequest = require("./coveragerequest"); // or "./coveragerequest"
const Event = require("./event");
const Resource = require("./resource");
const Assignment = require("./assignment");
const MediaFile = require("./mediafile");
const Notification = require("./notification");
const AuditLog = require("./auditLogs");
const Report = require("./report");

module.exports = {
  User,
  CoverageRequest,
  Event,
  Resource,
  Assignment,
  MediaFile,
  Notification,
  AuditLog,
  Report
};

// Setup relationships
CoverageRequest.schema.virtual('requester', {
  ref: 'User',
  localField: 'requesterId',
  foreignField: '_id',
  justOne: true
});

Event.schema.virtual('coverageRequest', {
  ref: 'CoverageRequest',
  localField: 'requestId',
  foreignField: '_id',
  justOne: true
});

Assignment.schema.virtual('event', {
  ref: 'Event',
  localField: 'eventId',
  foreignField: '_id',
  justOne: true
});

Assignment.schema.virtual('resource', {
  ref: 'Resource',
  localField: 'resourceId',
  foreignField: '_id',
  justOne: true
});

MediaFile.schema.virtual('assignment', {
  ref: 'Assignment',
  localField: 'assignmentId',
  foreignField: '_id',
  justOne: true
});

Notification.schema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

module.exports = {
  User,
  CoverageRequest,
  Event,
  Resource,
  Assignment,
  MediaFile,
  Notification,
  AuditLog,
  Report
};