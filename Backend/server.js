require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const registertRoutes = require('./src/routes/registertRoutes');
const requestRoutes = require('./src/routes/requestRoutes');
const app = express();

// ==================== JWT CONFIGURATION ====================
const JWT_SECRET = process.env.JWT_SECRET || 'ameco-super-secret-jwt-key-2024';
const JWT_EXPIRES_IN = '7d';


// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:5001'],
  credentials: true
}));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/auth', registertRoutes);
app.use('/api/requests', requestRoutes);
// ==================== STATIC FILES ====================
app.use(express.static("public", {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  }
}));

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authMiddleware = {
  // Protect routes
  protect: async (req, res, next) => {
    try {
      let token;

      // Get token from header
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
      } else if (req.cookies?.token) {
        token = req.cookies.token;
      }

      if (!token) {
        return res.status(401).json({
          success: false,
          error: "Not authorized, no token"
        });
      }

      // Verify token
      const decoded = jwt.verify(token, JWT_SECRET);

      // Get user from token
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return res.status(401).json({
          success: false,
          error: "User not found"
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          error: "User account is deactivated"
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(401).json({
        success: false,
        error: "Not authorized, token failed"
      });
    }
  },

  // Authorize roles
  authorize: (...roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated"
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: `User role ${req.user.role} is not authorized to access this route`
        });
      }

      next();
    };
  }
};

// ==================== DATABASE CONNECTION ====================
console.log("🔗 Connecting to MongoDB...");
mongoose.connect("mongodb+srv://admin:nunDUEzwTqKcSP1R@cluster0.yiz1p7x.mongodb.net/coverage", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
})
  .then(async () => {
    console.log("✅ MongoDB Connected to '" + mongoose.connection.name + "' database");

    try {
      await mongoose.connection.collection("users").createIndex({ email: 1 }, { unique: true });
      console.log("⚡ Database indexes optimized");
    } catch (indexError) {
      console.log("📝 Indexes already exist");
    }
  })
  .catch(err => {
    console.error("❌ MongoDB Connection Error:", err.message);
    console.log("💡 Make sure MongoDB is running: mongod --dbpath ./data/db");
  });

// ==================== MODELS ====================
// User Model
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin", "editor", "reporter", "cameraman", "requester", "crew", "driver", "sound_technician", "manager"],
    default: "requester"
  },
  department: { type: String, required: true, default: "General" },
  phone: String,
  isActive: { type: Boolean, default: true },
  avatar: String,
  expertise: [String],
  permissions: {
    canCreateRequest: { type: Boolean, default: true },
    canApproveRequest: { type: Boolean, default: false },
    canAssignResources: { type: Boolean, default: false },
    canUploadMedia: { type: Boolean, default: false },
    canGenerateReports: { type: Boolean, default: false }
  },
  lastLogin: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};
const User = mongoose.models.User || mongoose.model("User", UserSchema);
UserSchema.methods.generateAuthToken = function () {
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
// ==================== ADDITIONAL MODELS FOR CREW & NOTIFICATIONS ====================

// Crew Model
const CrewSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: String,
  role: {
    type: String,
    enum: ["cameraman", "sound_technician", "driver", "reporter", "editor"],
    required: true
  },
  status: {
    type: String,
    enum: ["available", "on_field", "on_break", "off_duty", "assigned"],
    default: "available"
  },
  currentAssignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Request",
    default: null
  },
  location: String,
  expertise: [String],
  isActive: { type: Boolean, default: true },
  lastAssignment: Date,
  notes: String
}, { timestamps: true });

const Crew = mongoose.model("Crew", CrewSchema);

// Notification Model
const NotificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, required: true },
  recipientType: {
    type: String,
    enum: ["reporter", "editor", "crew", "admin", "requester"],
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ["assignment", "status_update", "system", "alert", "message"],
    default: "system"
  },
  relatedRequest: { type: mongoose.Schema.Types.ObjectId, ref: "Request" },
  relatedCrew: { type: mongoose.Schema.Types.ObjectId, ref: "Crew" },
  isRead: { type: Boolean, default: false },
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const Notification = mongoose.model("Notification", NotificationSchema);

// ==================== AUTH ROUTES ====================

// User registration
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, role = "requester", department = "General", phone } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: "Name, email and password are required"
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "User already exists with this email"
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role,
      department,
      phone: phone || ""
    });

    // Generate token
    const token = user.generateAuthToken();

    // Prepare response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      data: {
        user: userResponse,
        token,
        expiresIn: JWT_EXPIRES_IN
      },
      message: "User registered successfully"
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// User login
// User login - SIMPLIFIED (NO HASHING)
app.post("/api/auth/login", async (req, res) => {
  try {
    console.log("🔐 SIMPLE LOGIN ATTEMPT");

    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required"
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      console.log("❌ User not found:", email);
      return res.status(401).json({
        success: false,
        error: "Invalid email or password"
      });
    }

    console.log("✅ User found:", user.email);
    console.log("🔑 Password check:", {
      input: password,
      stored: user.password,
      match: user.password === password
    });

    // SIMPLE PASSWORD CHECK (direct comparison)
    if (user.password !== password) {
      console.log("❌ Password doesn't match");
      return res.status(401).json({
        success: false,
        error: "Invalid email or password"
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: "Account is deactivated. Please contact administrator."
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = user.generateAuthToken();

    // Determine dashboard based on role
    const dashboardMap = {
      'reporter': '/dashboard-reporter.html',
      'editor': '/dashboard-editor.html',
      'cameraman': '/dashboard-crew.html',
      'crew': '/dashboard-crew.html',
      'driver': '/dashboard-crew.html',
      'sound_technician': '/dashboard-crew.html',
      'requester': '/dashboard-requester.html',
      'admin': '/dashboard-admin.html',
      'manager': '/dashboard-admin.html'
    };

    const dashboard = dashboardMap[user.role] || '/dashboard.html';

    // Prepare response
    const userResponse = user.toObject();
    delete userResponse.password;

    console.log("✅ Login successful for:", user.email);

    res.json({
      success: true,
      data: {
        user: userResponse,
        token,
        expiresIn: JWT_EXPIRES_IN,
        dashboard
      },
      message: "Login successful"
    });
  } catch (error) {
    console.error("🔥 Login error:", error);
    res.status(500).json({
      success: false,
      error: "Login failed. Please try again."
    });
  }
});

// Get current user (protected)
app.get("/api/auth/me", authMiddleware.protect, async (req, res) => {
  try {
    res.json({
      success: true,
      data: req.user
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie('token');
  res.json({
    success: true,
    message: "Logout successful"
  });
});

// ==================== OTHER MODELS (Keep your existing models) ====================

// Resource Model (unchanged)
const ResourceSchema = new mongoose.Schema({
  resourceId: { type: String, unique: true, default: () => "RES-" + Date.now() },
  name: String,
  type: {
    type: String,
    enum: ["personnel", "equipment", "vehicle"]
  },
  subType: String,
  description: String,
  availability: {
    type: String,
    enum: ["available", "assigned", "maintenance", "unavailable"],
    default: "available"
  },
  specifications: mongoose.Schema.Types.Mixed,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  location: String
}, { timestamps: true });

const Resource = mongoose.model("Resource", ResourceSchema);

// Event Model (unchanged)
const EventSchema = new mongoose.Schema({
  eventId: { type: String, unique: true, default: () => "EVT-" + Date.now() },
  title: String,
  description: String,
  coverageRequest: { type: mongoose.Schema.Types.ObjectId, ref: "CoverageRequest" },
  startDateTime: Date,
  endDateTime: Date,
  location: {
    name: String,
    address: String
  },
  status: {
    type: String,
    enum: ["scheduled", "in-progress", "completed", "cancelled", "postponed"],
    default: "scheduled"
  },
  assignedResources: [{ type: mongoose.Schema.Types.ObjectId, ref: "Resource" }],
  assignedPersonnel: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

const Event = mongoose.model("Event", EventSchema);

// ==================== API ROUTES ====================

// Root endpoint
app.get("/api", (req, res) => {
  res.json({
    message: "Welcome to Amhara Media Coverage Management System API",
    version: "2.0.0",
    status: "Running",
    authentication: "JWT Token Based",
    database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    endpoints: {
      auth: {
        login: "POST /api/auth/login",
        register: "POST /api/auth/register",
        logout: "POST /api/auth/logout",
        me: "GET /api/auth/me (Protected)"
      },
      users: "GET /api/users (Protected)",
      coverageRequests: "GET /api/coverage-requests",
      resources: "GET /api/resources",
      events: "GET /api/events",
      stats: "GET /api/stats",
      seed: "POST /api/seed",
      reset: "POST /api/reset"
    },
    frontend_integration: {
      login_page: "Switch to 'Login Accounts' mode",
      demo_accounts: "Use demo mode for testing",
      real_accounts: "Use backend authentication"
    }
  });
});

// ==================== USER ROUTES (Protected) ====================

// Get all users (protected)
app.get("/api/users", authMiddleware.protect, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// ==================== CREW API ENDPOINTS ====================

// Get all crew members
app.get("/api/crew", authMiddleware.protect, async (req, res) => {
  try {
    const crew = await Crew.find().sort({ status: 1, name: 1 });
    res.json({
      success: true,
      count: crew.length,
      data: crew
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get available crew (green status)
app.get("/api/crew/available", authMiddleware.protect, async (req, res) => {
  try {
    const availableCrew = await Crew.find({
      status: "available",
      isActive: true
    }).sort({ role: 1, name: 1 });

    res.json({
      success: true,
      count: availableCrew.length,
      data: availableCrew
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update crew status
app.put("/api/crew/:id/status", authMiddleware.protect, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, currentAssignment, location } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required"
      });
    }

    const updateData = { status };
    if (currentAssignment !== undefined) updateData.currentAssignment = currentAssignment;
    if (location) updateData.location = location;

    if (status === "on_field" || status === "assigned") {
      updateData.lastAssignment = new Date();
    }

    const crew = await Crew.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!crew) {
      return res.status(404).json({
        success: false,
        error: "Crew member not found"
      });
    }

    res.json({
      success: true,
      data: crew,
      message: `Crew status updated to ${status}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create new crew member
app.post("/api/crew", authMiddleware.protect, async (req, res) => {
  try {
    const { name, email, phone, role, status, location, expertise } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        error: "Name, email, and role are required"
      });
    }

    // Check if crew member already exists
    const existingCrew = await Crew.findOne({ email });
    if (existingCrew) {
      return res.status(400).json({
        success: false,
        error: "Crew member with this email already exists"
      });
    }

    const crew = await Crew.create({
      name,
      email,
      phone,
      role,
      status: status || "available",
      location,
      expertise: expertise || []
    });

    res.status(201).json({
      success: true,
      data: crew,
      message: "Crew member created successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// ==================== NOTIFICATION API ENDPOINTS ====================

// Create notification
app.post("/api/notifications", async (req, res) => {
  try {
    const { recipientId, recipientType, title, message, type, relatedRequest, relatedCrew, metadata } = req.body;

    // Validate required fields
    if (!recipientId || !recipientType || !title || !message) {
      return res.status(400).json({
        success: false,
        error: "recipientId, recipientType, title, and message are required"
      });
    }

    const notification = await Notification.create({
      recipientId,
      recipientType,
      title,
      message,
      type: type || "system",
      relatedRequest,
      relatedCrew,
      metadata,
      isRead: false
    });

    res.status(201).json({
      success: true,
      data: notification,
      message: "Notification created"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get reporter notifications
app.get("/api/notifications/reporter/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { unread } = req.query;

    let query = {
      recipientId: id,
      recipientType: "reporter"
    };

    if (unread === "true") {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    // Count unread notifications
    const unreadCount = await Notification.countDocuments({
      recipientId: id,
      recipientType: "reporter",
      isRead: false
    });

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      total: notifications.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get crew notifications
app.get("/api/notifications/crew/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { unread } = req.query;

    let query = {
      recipientId: id,
      recipientType: "crew"
    };

    if (unread === "true") {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    // Count unread notifications
    const unreadCount = await Notification.countDocuments({
      recipientId: id,
      recipientType: "crew",
      isRead: false
    });

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      total: notifications.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mark notification as read
app.put("/api/notifications/:id/read", async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      id,
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found"
      });
    }

    res.json({
      success: true,
      data: notification,
      message: "Notification marked as read"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mark all reporter notifications as read
app.put("/api/notifications/reporter/:id/mark-all-read", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Notification.updateMany(
      {
        recipientId: id,
        recipientType: "reporter",
        isRead: false
      },
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      }
    );

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mark all crew notifications as read
app.put("/api/notifications/crew/:id/mark-all-read", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await Notification.updateMany(
      {
        recipientId: id,
        recipientType: "crew",
        isRead: false
      },
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      }
    );

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// ==================== ASSIGNMENT API ENDPOINTS ====================

// Assign reporter & crew to request
app.put("/api/requests/:id/assign-reporter", authMiddleware.protect, async (req, res) => {
  try {
    console.log('=== ASSIGN REPORTER & CREW ===');
    console.log('Request ID:', req.params.id);
    console.log('Request Body:', req.body);

    const Request = getRequestModel();
    if (!Request) {
      return res.status(500).json({
        success: false,
        message: 'Database model not ready'
      });
    }

    const { id } = req.params;
    const { reporterId, reporterName, crewMembers, editorNotes } = req.body;

    if (!reporterId || !reporterName) {
      return res.status(400).json({
        success: false,
        error: "Reporter ID and name are required"
      });
    }

    // Find the request
    let request = await Request.findOne({
      $or: [
        { _id: id },
        { requestId: id }
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        error: "Request not found"
      });
    }

    // Update request with reporter assignment
    const updateData = {
      status: "assigned",
      assignedReporter: {
        id: reporterId,
        name: reporterName,
        assignedAt: new Date()
      },
      updatedAt: new Date()
    };

    // Add crew assignment if provided
    if (crewMembers && Array.isArray(crewMembers) && crewMembers.length > 0) {
      updateData.assignedCrew = crewMembers;
      updateData.crewStatus = "pending";
    }

    if (editorNotes) {
      updateData.editorNotes = editorNotes;
    }

    const updatedRequest = await Request.findByIdAndUpdate(
      request._id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedRequest) {
      return res.status(500).json({
        success: false,
        error: "Failed to update request"
      });
    }

    // Update crew members status
    if (crewMembers && crewMembers.length > 0) {
      for (const crewId of crewMembers) {
        await Crew.findByIdAndUpdate(crewId, {
          status: "assigned",
          currentAssignment: request._id
        });
      }
    }

    res.json({
      success: true,
      data: updatedRequest,
      message: `Reporter ${reporterName} assigned to request`
    });
  } catch (error) {
    console.error('Error assigning reporter:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get assignments with crew info
app.get("/api/requests/with-crew", authMiddleware.protect, async (req, res) => {
  try {
    const Request = getRequestModel();
    if (!Request) {
      return res.status(500).json({
        success: false,
        message: 'Database model not ready'
      });
    }

    const requests = await Request.find({
      $or: [
        { status: "assigned" },
        { status: "in_progress" },
        { "assignedCrew.0": { $exists: true } }
      ]
    })
      .populate('assignedCrew', 'name role status')
      .sort({ updatedAt: -1 })
      .limit(50);

    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get crew assignments
app.get("/api/requests/crew/:id", authMiddleware.protect, async (req, res) => {
  try {
    const Request = getRequestModel();
    if (!Request) {
      return res.status(500).json({
        success: false,
        message: 'Database model not ready'
      });
    }

    const { id } = req.params;

    // Find requests where this crew member is assigned
    const assignments = await Request.find({
      assignedCrew: id,
      $or: [
        { status: "assigned" },
        { status: "in_progress" }
      ]
    })
      .sort({ updatedAt: -1 })
      .limit(20);

    // Find completed assignments
    const completed = await Request.find({
      assignedCrew: id,
      status: "completed"
    })
      .sort({ updatedAt: -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        active: assignments,
        completed: completed,
        activeCount: assignments.length,
        completedCount: completed.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update crew status for assignment
app.put("/api/requests/:id/crew-status", authMiddleware.protect, async (req, res) => {
  try {
    const Request = getRequestModel();
    if (!Request) {
      return res.status(500).json({
        success: false,
        message: 'Database model not ready'
      });
    }

    const { id } = req.params;
    const { crewStatus, crewNotes, reporterNotes, progress } = req.body;

    if (!crewStatus) {
      return res.status(400).json({
        success: false,
        error: "Crew status is required"
      });
    }

    const request = await Request.findOne({
      $or: [
        { _id: id },
        { requestId: id }
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        error: "Request not found"
      });
    }

    const updateData = {
      crewStatus,
      updatedAt: new Date()
    };

    if (crewNotes) updateData.crewNotes = crewNotes;
    if (reporterNotes) updateData.reporterNotes = reporterNotes;
    if (progress) updateData.progress = progress;

    // If crew status is "on_the_way" or "at_location", update overall status
    if (crewStatus === "on_the_way" || crewStatus === "at_location") {
      updateData.status = "in_progress";
    }

    // If crew status is "shooting_completed", update progress
    if (crewStatus === "shooting_completed") {
      updateData.progress = "shooting_completed";
    }

    const updatedRequest = await Request.findByIdAndUpdate(
      request._id,
      updateData,
      { new: true }
    );

    res.json({
      success: true,
      data: updatedRequest,
      message: `Crew status updated to ${crewStatus}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// ==================== SEED ENDPOINTS ====================

// Seed initial crew data

// Get dashboard stats
app.get("/api/dashboard/stats", authMiddleware.protect, async (req, res) => {
  try {
    const Request = getRequestModel();
    if (!Request) {
      return res.status(500).json({
        success: false,
        message: 'Database model not ready'
      });
    }

    const [totalRequests, assignedRequests, availableCrew, activeAssignments] = await Promise.all([
      Request.countDocuments(),
      Request.countDocuments({ status: "assigned" }),
      Crew.countDocuments({ status: "available" }),
      Request.countDocuments({ crewStatus: { $in: ["on_the_way", "at_location", "shooting"] } })
    ]);

    res.json({
      success: true,
      data: {
        totalRequests,
        assignedRequests,
        availableCrew,
        activeAssignments,
        crewStatus: {
          available: await Crew.countDocuments({ status: "available" }),
          on_field: await Crew.countDocuments({ status: "on_field" }),
          assigned: await Crew.countDocuments({ status: "assigned" }),
          off_duty: await Crew.countDocuments({ status: "off_duty" })
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// ==================== ENHANCED LOGIN INTEGRATION ENDPOINT ====================

// Endpoint to verify login integration
app.get("/api/login/integration", (req, res) => {
  res.json({
    success: true,
    message: "Login integration ready",
    frontend_changes_needed: [
      "1. Update handleLogin function to call backend API",
      "2. Store JWT token from response",
      "3. Redirect based on user role",
      "4. Use demo mode for testing, login mode for real authentication"
    ],
    backend_features: [
      "JWT Authentication",
      "Role-based dashboards",
      "Password hashing",
      "User session management"
    ],
    test_credentials: {
      master_admin: "master@ameco.et / Master@2024",
      regular_admin: "admin@amedia.et / Admin@123",
      reporter: "reporter@amedia.et / Reporter@123",
      requester: "requester@amedia.et / Requester@123"
    }
  });
});

// ==================== HTML PAGES ====================

// Serve HTML pages
const pages = [
  '/', '/login', '/register', '/dashboard', '/dashboard-reporter',
  '/dashboard-editor', '/dashboard-crew', '/dashboard-requester',
  '/dashboard-admin', '/profile', '/requests', '/resources', '/events'
];

pages.forEach(page => {
  app.get(page, (req, res) => {
    let fileName = page === '/' ? 'index.html' : page.substring(1) + '.html';
    const filePath = path.join(__dirname, 'public', fileName);

    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });
});


// ==================== REQUEST MANAGEMENT ENDPOINTS ====================

// Helper to get Request model safely
const getRequestModel = () => {
  try {
    return mongoose.model('Request');
  } catch (error) {
    console.log('⚠️ Request model not loaded yet:', error.message);
    return null;
  }
};

// GET all requests (this endpoint already exists via requestRoutes, but adding a direct one)
app.get('/api/requests/all', async (req, res) => {
  try {
    const Request = getRequestModel();
    if (!Request) {
      return res.status(500).json({
        success: false,
        message: 'Database model not ready'
      });
    }

    const { status, category, priority, limit = 100 } = req.query;
    let query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    const requests = await Request.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch requests',
      error: error.message
    });
  }
});

// GET single request by ID
app.get('/api/requests/:id', async (req, res) => {
  try {
    const Request = getRequestModel();
    if (!Request) {
      return res.status(500).json({
        success: false,
        message: 'Database model not ready'
      });
    }

    const { id } = req.params;

    let request = await Request.findOne({
      $or: [
        { _id: id },
        { requestId: id }
      ]
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('Error fetching request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch request',
      error: error.message
    });
  }
});

// ✅ THIS IS THE CRITICAL ENDPOINT - UPDATE REQUEST STATUS
app.put('/api/requests/:id/status', async (req, res) => {
  try {
    console.log('=== STATUS UPDATE REQUEST ===');
    console.log('Request ID:', req.params.id);
    console.log('Request Body:', req.body);

    const Request = getRequestModel();
    if (!Request) {
      console.error('❌ Request model not available');
      return res.status(500).json({
        success: false,
        message: 'Database model not ready'
      });
    }

    const { id } = req.params;
    const { status, editorNotes, assignedEditor } = req.body;

    // Validate required fields
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    // Validate status against your model
    const validStatuses = ['draft', 'pending', 'approved', 'rejected', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Find the request first
    let request = await Request.findOne({
      $or: [
        { _id: id },
        { requestId: id }
      ]
    });

    if (!request) {
      console.log('❌ Request not found, searching all requests...');
      // List all requests to help debug
      const allRequests = await Request.find().limit(5);
      console.log('Sample requests in DB:', allRequests.map(r => ({
        _id: r._id,
        requestId: r.requestId,
        title: r.title
      })));

      return res.status(404).json({
        success: false,
        message: `Request with ID "${id}" not found`,
        sampleIds: allRequests.map(r => ({ _id: r._id, requestId: r.requestId }))
      });
    }

    console.log('✅ Found request:', {
      _id: request._id,
      requestId: request.requestId,
      title: request.title,
      currentStatus: request.status
    });

    // Prepare update data
    const updateData = {
      status: status,
      reviewedAt: new Date(),
      updatedAt: new Date()
    };

    if (editorNotes && editorNotes.trim() !== '') {
      updateData.editorNotes = editorNotes;
    }

    if (assignedEditor && assignedEditor.name) {
      updateData.assignedEditor = {
        name: assignedEditor.name,
        email: assignedEditor.email || '',
        assignedAt: new Date()
      };
    }

    console.log('📝 Update data:', updateData);

    // Update the request
    const updatedRequest = await Request.findByIdAndUpdate(
      request._id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedRequest) {
      console.error('❌ Failed to update request in database');
      return res.status(500).json({
        success: false,
        message: 'Failed to update request in database'
      });
    }

    console.log('✅ Successfully updated request:', {
      _id: updatedRequest._id,
      requestId: updatedRequest.requestId,
      newStatus: updatedRequest.status
    });

    res.json({
      success: true,
      data: updatedRequest,
      message: `Request status updated to ${status}`
    });

  } catch (error) {
    console.error('🔥 Error updating request status:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to update request status',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Alternative simpler endpoint (if above doesn't work)
app.post('/api/requests/:id/update-status', async (req, res) => {
  try {
    console.log('=== SIMPLE STATUS UPDATE ===');

    const Request = getRequestModel();
    if (!Request) {
      return res.status(500).json({
        success: false,
        message: 'Database not ready'
      });
    }

    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status required' });
    }

    console.log(`Updating request ${id} to status: ${status}`);

    // Simple update
    const result = await Request.updateOne(
      {
        $or: [
          { _id: id },
          { requestId: id }
        ]
      },
      {
        $set: {
          status: status,
          editorNotes: notes || '',
          reviewedAt: new Date()
        }
      }
    );

    console.log('Update result:', result);

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Request not found or no changes made'
      });
    }

    // Get the updated request
    const updatedRequest = await Request.findOne({
      $or: [
        { _id: id },
        { requestId: id }
      ]
    });

    res.json({
      success: true,
      data: updatedRequest,
      message: `Request ${status} successfully`
    });

  } catch (error) {
    console.error('Error in simple update:', error);
    res.status(500).json({
      success: false,
      message: 'Update failed',
      error: error.message
    });
  }
});

// Debug endpoint to see all requests
app.get('/api/debug/requests-list', async (req, res) => {
  try {
    const Request = getRequestModel();
    if (!Request) {
      return res.json({
        success: false,
        message: 'Request model not loaded'
      });
    }

    const requests = await Request.find().sort({ createdAt: -1 }).limit(20);

    res.json({
      success: true,
      count: requests.length,
      requests: requests.map(r => ({
        _id: r._id.toString(),
        requestId: r.requestId,
        title: r.title,
        status: r.status,
        submittedBy: r.submittedBy,
        category: r.category,
        priority: r.priority,
        createdAt: r.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/seed/crew", async (req, res) => {
  try {
    // Clear existing crew
    await Crew.deleteMany({});

    // Create sample crew members
    const sampleCrew = [
      {
        name: "John Camera",
        email: "john.camera@amedia.et",
        phone: "+251 911 234 567",
        role: "cameraman",
        status: "available",
        expertise: ["News", "Documentary", "Sports"],
        location: "Addis Ababa"
      },
      {
        name: "Mike Sound",
        email: "mike.sound@amedia.et",
        phone: "+251 911 234 568",
        role: "sound_technician",
        status: "available",
        expertise: ["Live Recording", "Studio", "Field Recording"],
        location: "Addis Ababa"
      },
      {
        name: "David Driver",
        email: "david.driver@amedia.et",
        phone: "+251 911 234 569",
        role: "driver",
        status: "available",
        expertise: ["Van", "Car", "Motorcycle"],
        location: "Addis Ababa"
      },
      {
        name: "Sarah Camera",
        email: "sarah.camera@amedia.et",
        phone: "+251 911 234 570",
        role: "cameraman",
        status: "on_field",
        expertise: ["Interview", "Event", "Documentary"],
        location: "Bahir Dar",
        currentAssignment: null
      },
      {
        name: "Lisa Editor",
        email: "lisa.editor@amedia.et",
        phone: "+251 911 234 571",
        role: "editor",
        status: "available",
        expertise: ["Video Editing", "Sound Mixing", "Graphics"],
        location: "Studio"
      }
    ];

    const crew = await Crew.insertMany(sampleCrew);

    res.json({
      success: true,
      message: "Sample crew data seeded",
      count: crew.length,
      data: crew
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Get available crew (NO AUTH for testing)
app.get("/api/test/crew", async (req, res) => {
  try {
    const crew = await Crew.find().sort({ status: 1, name: 1 });
    res.json({
      success: true,
      count: crew.length,
      data: crew
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Get available crew (NO AUTH for testing)
app.get("/api/test/crew/available", async (req, res) => {
  try {
    const availableCrew = await Crew.find({
      status: "available",
      isActive: true
    }).sort({ role: 1, name: 1 });

    res.json({
      success: true,
      count: availableCrew.length,
      data: availableCrew
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Get single crew member
app.get("/api/crew/:id", authMiddleware.protect, async (req, res) => {
  try {
    const { id } = req.params;

    // Try to find by ID or email
    let crew = await Crew.findById(id);
    if (!crew) {
      // Try to find by email if user ID doesn't match
      const user = await User.findById(id);
      if (user) {
        crew = await Crew.findOne({ email: user.email });
      }
    }

    if (!crew) {
      return res.status(404).json({
        success: false,
        error: "Crew member not found"
      });
    }

    res.json({
      success: true,
      data: crew
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Handle 404 for API routes
app.use("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "API endpoint not found",
    availableEndpoints: {
      auth: "POST /api/auth/login",
      register: "POST /api/auth/register",
      users: "GET /api/users",
      coverageRequests: "GET /api/coverage-requests",
      integration: "GET /api/login/integration"
    }
  });
});

// Handle all other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: err.message,
    timestamp: new Date()
  });
});

// Serve config.js with PROPER MIME TYPE
app.get("/js/config.js", (req, res) => {
  const configContent = `// Global configuration for AMECO CMS
window.API_BASE_URL = 'http://localhost:5001/api';
window.APP_CONFIG = {
  VERSION: '2.0.0',
  ROLES: {
    REPORTER: 'reporter',
    EDITOR: 'editor',
    CREW: 'crew',
    CAMERAMAN: 'cameraman',
    DRIVER: 'driver',
    SOUND_TECHNICIAN: 'sound_technician',
    REQUESTER: 'requester',
    ADMIN: 'admin',
    MANAGER: 'manager'
  }
};

// Global API helper function
window.apiRequest = async function(endpoint, options = {}) {
  try {
    const url = endpoint.startsWith('http') ? endpoint : window.API_BASE_URL + endpoint;
    
    // Get token
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': \`Bearer \${token}\` }),
      ...options.headers
    };
    
    const response = await fetch(url, {
      headers,
      ...options
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.message || \`API Error \${response.status}\`);
    }
    
    return data;
  } catch (error) {
    console.error('❌ API Request Failed:', error);
    return { 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

console.log('✅ AMECO Config loaded: API Base URL =', window.API_BASE_URL);`;

  // SET CORRECT MIME TYPE
  res.setHeader('Content-Type', 'application/javascript');
  res.send(configContent);
});


app.use(express.static("public", {
  setHeaders: (res, filePath) => {
    // Set correct MIME types
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
    if (filePath.endsWith('.woff') || filePath.endsWith('.woff2')) {
      res.setHeader('Content-Type', 'font/woff2');
    }
  }
}));

// Add this route to server.js
app.get('/api/requests', async (req, res) => {
  try {
    const { status, category, submittedBy } = req.query;
    let query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (submittedBy) query.submittedBy = submittedBy;

    const requests = await Request.find(query)
      .sort({ submittedAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch requests'
    });
  }
});

// Add route to update request status
app.put('/api/requests/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, editorNotes, assignedEditor } = req.body;

    const updatedRequest = await Request.findOneAndUpdate(
      { $or: [{ _id: id }, { requestId: id }] },
      {
        status,
        editorNotes,
        assignedEditor,
        reviewedAt: new Date()
      },
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    res.json({
      success: true,
      data: updatedRequest
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update request'
    });
  }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`
🚀 AMECO CMS Server running on http://localhost:${PORT}
📁 Serving static files from: ${path.join(__dirname, "public")}

🔐 AUTHENTICATION SYSTEM:
   • Login: POST http://localhost:${PORT}/api/auth/login
   • Register: POST http://localhost:${PORT}/api/auth/register
   • Profile: GET http://localhost:${PORT}/api/auth/me (Protected)

🔗 FRONTEND INTEGRATION:
   • Config: http://localhost:${PORT}/js/config.js
   • Integration Guide: GET http://localhost:${PORT}/api/login/integration

📊 DATABASE:
   • Seed: POST http://localhost:${PORT}/api/seed
   • Reset: POST http://localhost:${PORT}/api/reset (password: reset123)
   • Debug: GET http://localhost:${PORT}/api/debug

🔑 TEST CREDENTIALS (after seeding):
   • Master Admin: master@ameco.et / Master@2024
   • Admin: admin@amedia.et / Admin@123
   • Reporter: reporter@amedia.et / Reporter@123
   • Requester: requester@amedia.et / Requester@123

💡 FRONTEND LOGIN INSTRUCTIONS:
   1. Open login.html in browser
   2. Switch to "Login Accounts" mode
   3. Select a role (will auto-fill for demo mode)
   4. For real login: Use seeded credentials above
   5. For demo login: Switch to "Demo Accounts" mode

✅ Integration ready! Update your frontend handleLogin function.
  `);
});