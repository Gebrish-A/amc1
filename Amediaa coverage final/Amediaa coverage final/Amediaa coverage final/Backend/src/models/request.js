const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
    // Basic Information
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: [
            'breaking_news', 'politics', 'sports', 'culture', 
            'business', 'health', 'education', 'entertainment'
        ]
    },
    priority: {
        type: String,
        required: [true, 'Priority is required'],
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    description: {
        type: String,
        required: [true, 'Description is required'],
        trim: true
    },
    
    // Schedule
    date: {
        type: Date,
        required: [true, 'Date is required']
    },
    
    // Location
    address: {
        type: String,
        required: [true, 'Address is required'],
        trim: true
    },
    
    // Status and Tracking
    status: {
        type: String,
        enum: ['draft', 'pending', 'approved', 'rejected', 'in_progress', 'completed','submitted'],
        default: 'pending'
    },
    requestId: {
        type: String,
        unique: true,
        required: true
    },
    
    // Requester Information
    submittedBy: {
        type: String,
        required: true
    },
    submitterEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    submitterDepartment: {
        type: String,
        required: true
    },
    
    // Editor Information (if assigned)
    assignedEditor: {
        name: String,
        email: String,
        assignedAt: Date
    },
    editorNotes: {
        type: String,
        trim: true
    },
    
    // Timestamps
    submittedAt: {
        type: Date,
        default: Date.now
    },
    reviewedAt: Date,
    updatedAt: {
        type: Date,
        default: Date.now
    },
    
    // Additional metadata
    budget: Number,
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for better query performance
requestSchema.index({ status: 1, submittedAt: -1 });
requestSchema.index({ submitterEmail: 1, submittedAt: -1 });
requestSchema.index({ category: 1 });
requestSchema.index({ priority: 1 });

// Pre-save middleware to update updatedAt
requestSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Static method to generate request ID
requestSchema.statics.generateRequestId = function() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `REQ-${timestamp}-${random}`;
};

const Request = mongoose.model('Request', requestSchema);
module.exports = Request;