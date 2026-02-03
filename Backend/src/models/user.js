const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true,
    required: true,
    default: () => `USER-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substr(2, 9)}`
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ["reporter", "editor", "crew", "requester", "admin", "cameraman", "driver", "sound_technician", "manager"],
    default: "requester",
    required: true
  },
  department: {
    type: String,
    required: true
  },
  phone: String,
  expertise: [String],
  location: String,
  lastLogin: Date,
  status: {
    type: String,
    enum: ["active", "inactive", "suspended"],
    default: "active"
  },
  profileImage: {
    type: String,
    default: ""
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  permissions: {
    canCreateRequest: { type: Boolean, default: true },
    canApproveRequest: { type: Boolean, default: false },
    canAssignResources: { type: Boolean, default: false },
    canUploadMedia: { type: Boolean, default: false },
    canGenerateReports: { type: Boolean, default: false }
  }
}, { 
  timestamps: true 
});

// SIMPLIFIED comparePassword method (direct string comparison)
UserSchema.methods.comparePassword = async function(candidatePassword) {
  console.log('🔐 SIMPLE PASSWORD COMPARISON:');
  console.log('🔐 Candidate:', candidatePassword);
  console.log('🔐 Stored:', this.password);
  console.log('🔐 Match:', this.password === candidatePassword);
  
  return this.password === candidatePassword; // Direct string comparison
};

// Generate JWT token (unchanged)
UserSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id, 
      email: this.email, 
      role: this.role 
    }, 
    JWT_SECRET, 
    { expiresIn: JWT_EXPIRES_IN }
  );
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);