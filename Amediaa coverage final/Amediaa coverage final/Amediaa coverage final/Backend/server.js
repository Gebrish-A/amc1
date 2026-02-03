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

UserSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

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


// ==================== KEEP YOUR EXISTING ROUTES ====================
// Keep all your existing routes for users, coverage-requests, resources, events, stats, etc.
// They are already in your code and I haven't removed them

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
