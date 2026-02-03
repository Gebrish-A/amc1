// ===========================================
// BACKEND AUTHENTICATION APIs
// ===========================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/user');

// Role-based permissions mapping
const ROLE_PERMISSIONS = {
  admin: {
    canCreateRequest: true,
    canApproveRequest: true,
    canAssignResources: true,
    canUploadMedia: true,
    canGenerateReports: true
  },
  editor: {
    canCreateRequest: true,
    canApproveRequest: true,
    canAssignResources: true,
    canUploadMedia: false,
    canGenerateReports: true
  },
  reporter: {
    canCreateRequest: true,
    canApproveRequest: false,
    canAssignResources: false,
    canUploadMedia: false,
    canGenerateReports: false
  },
  requester: {
    canCreateRequest: true,
    canApproveRequest: false,
    canAssignResources: false,
    canUploadMedia: false,
    canGenerateReports: false
  },
  crew: {
    canCreateRequest: true,
    canApproveRequest: false,
    canAssignResources: false,
    canUploadMedia: false,
    canGenerateReports: false
  }
};

// Generate unique userId based on role
async function generateUserId(role) {
  const prefix = `USER-${role.toUpperCase()}`;
  
  // Find the last user with this role
  const lastUser = await User.findOne({ userId: new RegExp(`^${prefix}`) })
    .sort({ userId: -1 })
    .limit(1);
  
  let sequence = 1;
  if (lastUser && lastUser.userId) {
    const match = lastUser.userId.match(/(\d+)$/);
    if (match) {
      sequence = parseInt(match[1]) + 1;
    }
  }
  
  return `${prefix}-${sequence.toString().padStart(3, '0')}`;
}

// Validate Ethiopian phone number
function validateEthiopianPhone(phone) {
  const ethiopianRegex = /^\+251(9|7)\d{8}$/;
  return ethiopianRegex.test(phone);
}

// Validate email format
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate password strength
function validatePassword(password) {
  return password.length >= 6; // Basic validation
}

// ===========================================
// 1. REGISTRATION ENDPOINT
// ===========================================
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, department, role } = req.body;
    
    console.log('📝 Registration attempt:', { email, role });
    
    // Validation
    if (!name || !email || !password || !phone || !department || !role) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }
    
    // Validate email
    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address'
      });
    }
    
    // Validate phone (Ethiopian format)
    if (!validateEthiopianPhone(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Phone number must be in Ethiopian format: +251XXXXXXXXX'
      });
    }
    
    // Validate password
    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }
    
    // Validate role
    const allowedRoles = ['editor', 'reporter', 'requester', 'crew'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role selected'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { phone }] 
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: existingUser.email === email 
          ? 'Email already registered' 
          : 'Phone number already registered'
      });
    }
    
    // Generate userId
    const userId = await generateUserId(role);
    
    // Create new user (with plain text password)
    const newUser = new User({
      userId,
      name,
      email,
      password, // Stored as plain text (as per your seed data)
      phone,
      department,
      role,
      expertise: [],
      status: 'active',
      profileImage: '',
      isVerified: false,
      permissions: ROLE_PERMISSIONS[role],
      isActive: true,
      lastLogin: null
    });
    
    await newUser.save();
    
    console.log('✅ User registered successfully:', newUser.email);
    
    // Return success (without password)
    const userResponse = newUser.toObject();
    delete userResponse.password;
    
    res.status(201).json({
      success: true,
      message: 'Registration successful! You can now login.',
      data: {
        user: userResponse,
        redirectUrl: '/login.html'
      }
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
});

// ===========================================
// 2. LOGIN ENDPOINT (Matches your login page expectation)
// ===========================================
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    
    console.log('🔐 Login attempt:', email);
    
    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }
    
    // Check if user is active
    // if (!user.isActive) {
    //   return res.status(403).json({
    //     success: false,
    //     error: 'Account is deactivated'
    //   });
    // }
    
    // PLAIN TEXT PASSWORD COMPARISON (as per your seed data)
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }
    
    // Check if user role matches requested role (optional)
    if (role && user.role !== role) {
      return res.status(403).json({
        success: false,
        error: `You don't have access as ${role}. Your role is ${user.role}`
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Determine dashboard based on role
    const dashboardPaths = {
      admin: '/dashboard-admin.html',
      editor: '/dashboard-editor.html',
      reporter: '/dashboard-reporter.html',
      requester: '/dashboard-requester.html',
      crew: '/dashboard-crew.html'
    };
    
    const dashboard = dashboardPaths[user.role] || '/dashboard.html';
    
    // Create user response (without password)
    const userResponse = user.toObject();
    delete userResponse.password;
    
    // In a real app, you'd generate a JWT token
    // For simplicity, we'll use a mock token
    const token = `mock-jwt-token-${Date.now()}-${user._id}`;
    
    console.log('✅ Login successful for:', user.email);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        token,
        dashboard
      }
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
});

// ===========================================
// 3. GET CURRENT USER ENDPOINT
// ===========================================
router.get('/me', async (req, res) => {
  try {
    // In a real app, you'd verify JWT token from headers
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Mock token verification
    const userId = token.split('-').pop();
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: user
    });
    
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user data'
    });
  }
});

// ===========================================
// 4. CHECK EMAIL AVAILABILITY
// ===========================================
router.get('/check-email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    const existingUser = await User.findOne({ email });
    
    res.json({
      available: !existingUser
    });
    
  } catch (error) {
    console.error('❌ Check email error:', error);
    res.status(500).json({
      available: false,
      error: 'Failed to check email'
    });
  }
});

module.exports = router;