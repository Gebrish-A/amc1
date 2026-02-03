// src/app.js - Application configuration
const config = {
    appName: "Amhara Media Coverage Management System",
    version: "1.0.0",
    env: process.env.NODE_ENV || "development",
    port: process.env.PORT || 5001,
    mongoURI: process.env.MONGO_URI || "mongodb://localhost:27017/coverage"
};

const constants = {
    ROLES: {
        ADMIN: "admin",
        EDITOR: "editor", 
        REPORTER: "reporter",
        CAMERAMAN: "cameraman",
        REQUESTER: "requester"
    },
    STATUS: {
        DRAFT: "draft",
        PENDING: "pending",
        APPROVED: "approved",
        REJECTED: "rejected",
        SCHEDULED: "scheduled",
        COMPLETED: "completed"
    },
    PRIORITY: {
        HIGH: "high",
        MEDIUM: "medium",
        LOW: "low"
    }
};

module.exports = {
    config,
    constants
};
