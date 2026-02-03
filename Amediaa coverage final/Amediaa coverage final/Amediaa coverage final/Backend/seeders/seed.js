require("dotenv").config();
const mongoose = require("mongoose");
const { 
  User, CoverageRequest, Event, Resource, 
  Assignment, MediaFile, Notification, Report, AuditLog 
} = require("../src/models");

const seedCompleteDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/coverage");
    console.log("🌱 Starting complete database seeding (NO PASSWORD HASHING)...");

    // Clear all collections
    await Promise.all([
      User.deleteMany({}),
      CoverageRequest.deleteMany({}),
      Event.deleteMany({}),
      Resource.deleteMany({}),
      Assignment.deleteMany({}),
      MediaFile.deleteMany({}),
      Notification.deleteMany({}),
      Report.deleteMany({}),
      AuditLog.deleteMany({})
    ]);
    
    console.log("✅ Cleared all collections");

    // 1. Create Users with PLAIN TEXT passwords (NO HASHING)
    const users = await User.create([
      {
        userId: "USER-ADMIN-001",
        name: "System Administrator",
        email: "admin@amedia.et",
        password: "Admin@123", // PLAIN TEXT - NO HASHING
        role: "admin",
        department: "administration",
        phone: "+251911111111",
        permissions: {
          canCreateRequest: true,
          canApproveRequest: true,
          canAssignResources: true,
          canUploadMedia: true,
          canGenerateReports: true
        }
      },
      {
        userId: "USER-EDITOR-001",
        name: "Editor Manager",
        email: "editor@amedia.et",
        password: "Editor@123", // PLAIN TEXT - NO HASHING
        role: "editor",
        department: "news",
        phone: "+251922222222",
        permissions: {
          canCreateRequest: true,
          canApproveRequest: true,
          canAssignResources: true,
          canUploadMedia: false,
          canGenerateReports: true
        }
      },
      {
        userId: "USER-REPORTER-001",
        name: "Tadese Adis",
        email: "reporter@amedia.et",
        password: "Reporter@123", // PLAIN TEXT - NO HASHING
        role: "reporter",
        department: "politics",
        phone: "+251933333333",
        expertise: ["politics", "breaking-news"]
      },
      {
        userId: "USER-requestor-001",
        name: "Hana Abebaw",
        email: "requestor@amedia.et",
        password: "Requestor@123", 
        role: "requester",
        department: "technical",
        phone: "+251944444444"
      },
  
      {
        userId: "USER-CREW-001",
        name: "Tibebe Difabachew",
        email: "crew@amedia.et",
        password: "Crew@123",
        role: "crew",
        department: "technical",
        phone: "+251955555555"
      }
    ]);
    
    console.log(`✅ Created ${users.length} users with PLAIN TEXT passwords`);
    
    // Verify passwords are plain text
    console.log("🔐 Password verification:");
    const dbUsers = await User.find({}, 'email password');
    dbUsers.forEach(user => {
      console.log(`  ${user.email}: "${user.password}"`);
      console.log(`    Is bcrypt hash? ${user.password.startsWith('$2') ? 'YES ❌' : 'NO ✅'}`);
    });

    // 2. Coverage Requests
    const coverageRequests = await CoverageRequest.create([
      {
        title: "Eypts president announcement coverage",
        description: "announcement of egypts president in bahirdar university",
        location: {
          name: "Bahir Dar University",
          address: "Bahir Dar, Amhara Region",
          coordinates: { lat: 11.5936, lng: 37.3907 }
        },
        proposedDateTime: new Date("2025-12-20T10:00:00"),
        priorityLevel: "high",
        category: "breaking-news",
        requesterId: users[0]._id,
        status: "approved",
        approvedBy: users[1]._id,
        approvedAt: new Date()
      },
      {
        title: "premier liguea last compitation",
        description: "last compitation of bdr kenema with fasil kenema coverage",
        location: {
          name: "Bahir dar Stadium",
          address: "Bahirdar, Ethiopia",
          coordinates: { lat: 9.0054, lng: 38.7636 }
        },
        proposedDateTime: new Date("2025-12-22T16:00:00"),
        priorityLevel: "medium",
        category: "sports",
        requesterId: users[2]._id,
        status: "approved",
        approvedBy: users[1]._id,
        approvedAt: new Date()
      }
    ]);
    
    console.log(`✅ Created ${coverageRequests.length} coverage requests`);

    // 3. Events
    const events = await Event.create([
      {
        requestId: coverageRequests[0]._id,
        startDateTime: new Date("2025-12-20T09:30:00"),
        endDateTime: new Date("2025-12-20T12:30:00"),
        location: coverageRequests[0].location,
        description: coverageRequests[0].description,
        status: "scheduled",
        calendarColor: "#FF5722"
      }
    ]);

    console.log(`✅ Created ${events.length} events`);

    // 4. Resources
    const resources = await Resource.create([
      {
        type: "personnel",
        name: "photographer",
        availabilityStatus: "available",
        linkedUserId: users[3]._id,
        specifications: {
          expertise: ["photo-journalism", "event-coverage"],
          languages: ["amharic", "english"],
          experience: "5 years"
        }
      },
      {
        type: "equipment",
        name: "SONY PXW-FS7 Camera",
        availabilityStatus: "available",
        equipmentDetails: {
          serialNumber: "SN-12345",
          model: "PXW-FS7",
          brand: "SONY",
          purchaseDate: new Date("2023-01-15"),
          condition: "excellent"
        }
      }
    ]);

    console.log(`✅ Created ${resources.length} resources`);

    // Create a few more items
    const assignments = await Assignment.create([
      {
        eventId: events[0]._id,
        resourceId: resources[0]._id,
        assignedBy: users[1]._id,
        status: "accepted"
      }
    ]);

    const mediaFiles = await MediaFile.create([
      {
        assignmentId: assignments[0]._id,
        fileType: "photo",
        url: "/uploads/sample-event.jpg",
        metadata: {
          resolution: "1920x1080",
          size: 2500000,
          format: "jpg"
        },
        description: "Sample event photo",
        approvalStatus: "approved"
      }
    ]);

    console.log(`✅ Created ${assignments.length} assignments`);
    console.log(`✅ Created ${mediaFiles.length} media files`);

    console.log("\n🎉 DATABASE SEEDING COMPLETE!");
    console.log("====================================");
    console.log(`Users: ${users.length}`);
    console.log(`Coverage Requests: ${coverageRequests.length}`);
    console.log(`Events: ${events.length}`);
    console.log(`Resources: ${resources.length}`);
    console.log("====================================");
    console.log("\n🔑 TEST CREDENTIALS (PLAIN TEXT):");
    console.log("------------------------------------");
    console.log("Admin: admin@amedia.et / Admin@123");
    console.log("Editor: editor@amedia.et / Editor@123");
    console.log("Reporter: reporter@amedia.et / Reporter@123");
    console.log("Camera: camera@amedia.et / Camera@123");
    console.log("Test: test@test.com / test123");
    console.log("------------------------------------");
    console.log("\n📋 IMPORTANT: Passwords are stored in PLAIN TEXT");
    console.log("   For development/testing only!");
    console.log("\n🚀 To test login:");
    console.log("1. Open: http://localhost:5001/login.html");
    console.log("2. Switch to 'Login Accounts' mode");
    console.log("3. Use credentials above");

    process.exit(0);

  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

seedCompleteDatabase();