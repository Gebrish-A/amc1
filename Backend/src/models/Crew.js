// C:\Users\NehZewd\Documents\hanii\Amediaa coverage final\Amediaa coverage final\Amediaa coverage final\Backend\src\models\Crew.js
const mongoose = require('mongoose');

const CrewSchema = new mongoose.Schema({
    // Basic Information
    crewId: {
        type: String,
        unique: true,
        required: true,
        default: () => `CREW-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    },
    name: {
        type: String,
        required: [true, 'Crew name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true
    },
    
    // Crew Type and Skills
    type: {
        type: String,
        required: [true, 'Crew type is required'],
        enum: ['camera', 'sound', 'lighting', 'driver', 'editor', 'general', 'cameraman', 'sound_technician'],
        default: 'general'
    },
    specialization: {
        type: [String],
        default: []
    },
    experience: {
        type: String,
        enum: ['junior', 'mid', 'senior', 'expert'],
        default: 'mid'
    },
    
    // Status and Availability
    status: {
        type: String,
        enum: ['available', 'on_field', 'offline', 'maintenance', 'on_leave'],
        default: 'available'
    },
    availability: {
        type: Boolean,
        default: true
    },
    
    // Current Assignment
    currentAssignment: {
        assignmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Request'
        },
        assignmentTitle: String,
        reporterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reporterName: String,
        reporterEmail: String,
        startTime: Date,
        estimatedEnd: Date,
        status: String
    },
    
    // Location
    location: {
        type: String,
        default: 'Headquarters'
    },
    lastLocationUpdate: Date,
    
    // Equipment (linked from Resource model)
    assignedEquipment: [{
        equipmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Resource'
        },
        name: String,
        type: String,
        checkOutTime: Date,
        expectedReturn: Date
    }],
    
    // Performance
    totalAssignments: {
        type: Number,
        default: 0
    },
    completedAssignments: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
    },
    
    // Schedule
    schedule: {
        monday: { available: Boolean, hours: String },
        tuesday: { available: Boolean, hours: String },
        wednesday: { available: Boolean, hours: String },
        thursday: { available: Boolean, hours: String },
        friday: { available: Boolean, hours: String },
        saturday: { available: Boolean, hours: String },
        sunday: { available: Boolean, hours: String }
    },
    
    // Metadata
    isActive: {
        type: Boolean,
        default: true
    },
    notes: String,
    
    // Timestamps
    lastActive: {
        type: Date,
        default: Date.now
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes
CrewSchema.index({ status: 1, type: 1 });
CrewSchema.index({ availability: 1 });
CrewSchema.index({ email: 1 }, { unique: true });
CrewSchema.index({ 'currentAssignment.assignmentId': 1 });
CrewSchema.index({ type: 1, status: 1, availability: 1 });

// Virtuals
CrewSchema.virtual('isAvailable').get(function() {
    return this.status === 'available' && this.availability === true && this.isActive === true;
});

// Pre-save middleware
CrewSchema.pre('save', function(next) {
    this.lastUpdated = Date.now();
    
    if (!this.availability && this.status === 'available') {
        this.status = 'offline';
    }
    
    next();
});

// Methods
CrewSchema.methods.assignToRequest = function(assignmentData) {
    this.status = 'on_field';
    this.currentAssignment = {
        assignmentId: assignmentData.assignmentId,
        assignmentTitle: assignmentData.assignmentTitle,
        reporterId: assignmentData.reporterId,
        reporterName: assignmentData.reporterName,
        reporterEmail: assignmentData.reporterEmail,
        startTime: new Date(),
        status: 'assigned'
    };
    this.totalAssignments += 1;
    this.lastUpdated = new Date();
    return this.save();
};

CrewSchema.methods.completeAssignment = function() {
    this.status = 'available';
    this.completedAssignments += 1;
    this.currentAssignment = null;
    this.lastUpdated = new Date();
    return this.save();
};

CrewSchema.methods.updateStatus = function(newStatus, notes = '') {
    this.status = newStatus;
    if (notes) {
        this.notes = notes;
    }
    this.lastUpdated = new Date();
    return this.save();
};

// Statics
CrewSchema.statics.findAvailable = function(type = null) {
    const query = {
        status: 'available',
        availability: true,
        isActive: true
    };
    
    if (type) {
        query.type = type;
    }
    
    return this.find(query).sort({ rating: -1, totalAssignments: 1 });
};

CrewSchema.statics.findByType = function(type) {
    return this.find({ 
        type,
        isActive: true 
    }).sort({ name: 1 });
};

CrewSchema.statics.updateCrewStatus = function(crewId, newStatus, assignmentData = null) {
    return this.findByIdAndUpdate(
        crewId,
        {
            status: newStatus,
            ...(assignmentData && { currentAssignment: assignmentData }),
            lastUpdated: new Date()
        },
        { new: true }
    );
};

const Crew = mongoose.model('Crew', CrewSchema);
module.exports = Crew;