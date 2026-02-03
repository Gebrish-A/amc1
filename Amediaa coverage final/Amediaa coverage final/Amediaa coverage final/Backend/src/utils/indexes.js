const mongoose = require("mongoose");

/**
 * Create optimal indexes for database performance
 * Run this once after seeding or during application startup
 */
const createIndexes = async () => {
  try {
    console.log("🔄 Creating database indexes...");
    
    // User indexes
    await mongoose.connection.collection("users").createIndex({ email: 1 }, { unique: true });
    await mongoose.connection.collection("users").createIndex({ role: 1, department: 1 });
    await mongoose.connection.collection("users").createIndex({ createdAt: -1 });
    await mongoose.connection.collection("users").createIndex({ isActive: 1 });
    
    // Coverage request indexes
    await mongoose.connection.collection("coveragerequests").createIndex({ 
      status: 1, 
      priorityLevel: 1, 
      category: 1 
    });
    await mongoose.connection.collection("coveragerequests").createIndex({ 
      proposedDateTime: 1 
    });
    await mongoose.connection.collection("coveragerequests").createIndex({ 
      "location.coordinates": "2dsphere" 
    });
    await mongoose.connection.collection("coveragerequests").createIndex({ 
      requesterId: 1,
      status: 1 
    });
    await mongoose.connection.collection("coveragerequests").createIndex({ 
      createdAt: -1 
    });
    
    // Event indexes
    await mongoose.connection.collection("events").createIndex({ 
      startDateTime: 1, 
      endDateTime: 1 
    });
    await mongoose.connection.collection("events").createIndex({ 
      status: 1, 
      startDateTime: 1 
    });
    await mongoose.connection.collection("events").createIndex({ 
      requestId: 1 
    });
    await mongoose.connection.collection("events").createIndex({ 
      "location.coordinates": "2dsphere" 
    });
    
    // Resource indexes
    await mongoose.connection.collection("resources").createIndex({ 
      type: 1, 
      availabilityStatus: 1 
    });
    await mongoose.connection.collection("resources").createIndex({ 
      "maintenanceSchedule.nextMaintenance": 1 
    });
    await mongoose.connection.collection("resources").createIndex({ 
      linkedUserId: 1 
    });
    
    // Assignment indexes
    await mongoose.connection.collection("assignments").createIndex({ 
      eventId: 1, 
      resourceId: 1 
    });
    await mongoose.connection.collection("assignments").createIndex({ 
      status: 1, 
      assignedDate: 1 
    });
    await mongoose.connection.collection("assignments").createIndex({ 
      assignedBy: 1 
    });
    await mongoose.connection.collection("assignments").createIndex({ 
      checkInTime: 1,
      checkOutTime: 1 
    });
    
    // Media file indexes
    await mongoose.connection.collection("mediafiles").createIndex({ 
      fileType: 1, 
      uploadDate: -1 
    });
    await mongoose.connection.collection("mediafiles").createIndex({ 
      assignmentId: 1 
    });
    await mongoose.connection.collection("mediafiles").createIndex({ 
      approvalStatus: 1 
    });
    await mongoose.connection.collection("mediafiles").createIndex({ 
      "metadata.gpsCoordinates": "2dsphere" 
    });
    await mongoose.connection.collection("mediafiles").createIndex({ 
      tags: 1 
    });
    
    // Notification indexes
    await mongoose.connection.collection("notifications").createIndex({ 
      userId: 1, 
      readStatus: 1, 
      sentDate: -1 
    });
    await mongoose.connection.collection("notifications").createIndex({ 
      type: 1, 
      priority: 1, 
      sentDate: -1 
    });
    
    // Audit log indexes
    await mongoose.connection.collection("auditlogs").createIndex({ 
      userId: 1, 
      timestamp: -1 
    });
    await mongoose.connection.collection("auditlogs").createIndex({ 
      entityType: 1, 
      entityId: 1, 
      timestamp: -1 
    });
    await mongoose.connection.collection("auditlogs").createIndex({ 
      actionType: 1, 
      timestamp: -1 
    });
    
    // Report indexes
    await mongoose.connection.collection("reports").createIndex({ 
      type: 1, 
      generatedDate: -1 
    });
    await mongoose.connection.collection("reports").createIndex({ 
      generatedBy: 1, 
      generatedDate: -1 
    });
    
    console.log("✅ Database indexes created successfully");
    return true;
  } catch (error) {
    console.error("❌ Error creating indexes:", error.message);
    // Don't throw error - indexes might already exist
    return false;
  }
};

/**
 * Check existing indexes
 */
const listIndexes = async () => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    console.log("\n📊 CURRENT DATABASE INDEXES:");
    console.log("=============================");
    
    for (const collection of collections) {
      const indexes = await mongoose.connection.collection(collection.name).indexes();
      
      console.log(`\n📁 Collection: ${collection.name}`);
      console.log(`   Indexes: ${indexes.length}`);
      
      indexes.forEach((index, i) => {
        const name = index.name || `idx_${i}`;
        const keys = Object.keys(index.key || {}).join(", ");
        console.log(`   - ${name}: [${keys}] ${index.unique ? '(UNIQUE)' : ''}`);
      });
    }
  } catch (error) {
    console.error("Error listing indexes:", error);
  }
};

/**
 * Drop all indexes (for development only)
 */
const dropAllIndexes = async () => {
  try {
    console.log("⚠️  Dropping all indexes...");
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    for (const collection of collections) {
      if (collection.name !== "system.indexes") {
        await mongoose.connection.collection(collection.name).dropIndexes();
        console.log(`   Dropped indexes for: ${collection.name}`);
      }
    }
    
    console.log("✅ All indexes dropped");
  } catch (error) {
    console.error("Error dropping indexes:", error);
  }
};

module.exports = {
  createIndexes,
  listIndexes,
  dropAllIndexes
};