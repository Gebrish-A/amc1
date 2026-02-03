const mongoose = require("mongoose");

const ResourceSchema = new mongoose.Schema({
  resourceId: {
    type: String,
    unique: true,
    required: true,
    default: () => `RES-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  },
  type: {
    type: String,
    enum: ["personnel", "equipment", "vehicle"],
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  availabilityStatus: {
    type: String,
    enum: ["available", "assigned", "maintenance", "reserved", "unavailable"],
    default: "available"
  },
  location: String,
  maintenanceSchedule: {
    lastMaintenance: Date,
    nextMaintenance: Date,
    maintenanceLog: [{
      date: Date,
      description: String,
      cost: Number,
      technician: String
    }]
  },
  specifications: mongoose.Schema.Types.Mixed,
  
  // For personnel resources
  linkedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  
  // For vehicle resources
  vehicleDetails: {
    registrationNumber: String,
    make: String,
    model: String,
    year: Number,
    fuelType: String,
    mileage: Number
  },
  
  // For equipment resources
  equipmentDetails: {
    serialNumber: String,
    model: String,
    brand: String,
    purchaseDate: Date,
    condition: {
      type: String,
      enum: ["excellent", "good", "fair", "poor", "damaged"],
      default: "good"
    }
  }
}, { timestamps: true });

// Indexes
ResourceSchema.index({ type: 1, availabilityStatus: 1 });
ResourceSchema.index({ "maintenanceSchedule.nextMaintenance": 1 });

module.exports = mongoose.model("Resource", ResourceSchema);