const User = require('../models/user');
const jwt = require('jsonwebtoken');

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user.userId,
      email: user.email,
      role: user.role 
    }, 
    process.env.JWT_SECRET || 'ameco-secret-key-2024',
    { expiresIn: '7d' }
  );
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, department, phone } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Validate role against frontend roles
    const validRoles = ['reporter', 'editor', 'crew', 'requester', 'admin'];
    const userRole = validRoles.includes(role) ? role : 'requester';

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: userRole,
      department: department || 'General',
      phone: phone || '',
      status: 'active'
    });

    // Generate token
    const token = generateToken(user);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          _id: user._id,
          userId: user.userId,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          profileImage: user.profileImage,
          status: user.status
        },
        token,
        dashboard: getDashboardPath(user.role)
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Registration failed'
    });
  }
};

// @desc    Authenticate user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt for:', email);

    // Check for user email
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Account is not active. Please contact administrator.'
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateToken(user);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          _id: user._id,
          userId: user.userId,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          profileImage: user.profileImage,
          status: user.status,
          permissions: user.permissions
        },
        token,
        dashboard: getDashboardPath(user.role)
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Login failed'
    });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email'
      });
    }

    // Generate reset token (simplified - in production use crypto)
    const resetToken = jwt.sign(
      { userId: user.userId },
      process.env.JWT_SECRET || 'ameco-reset-key',
      { expiresIn: '1h' }
    );

    // In production: Send email with reset link
    console.log('Reset token for', email, ':', resetToken);

    res.json({
      success: true,
      message: 'Password reset email sent',
      data: { 
        resetToken,
        email: user.email 
      }
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process password reset'
    });
  }
};

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:resetToken
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken } = req.params;
    const { password } = req.body;

    // Verify token
    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET || 'ameco-reset-key');
    
    const user = await User.findOne({ userId: decoded.userId });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update password
    user.password = password;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to reset password'
    });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get profile'
    });
  }
};

// Helper function to get dashboard path based on role
function getDashboardPath(role) {
  const dashboardMap = {
    'reporter': 'dashboard-reporter.html',
    'editor': 'dashboard-editor.html',
    'crew': 'dashboard-crew.html',
    'requester': 'dashboard-requester.html',
    'admin': 'dashboard-admin.html',
    'cameraman': 'dashboard-crew.html',
    'driver': 'dashboard-crew.html',
    'sound_technician': 'dashboard-crew.html',
    'manager': 'dashboard-admin.html'
  };
  return dashboardMap[role] || 'dashboard.html';
}

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    // For JWT, logout is handled client-side by removing token
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Logout failed'
    });
  }
};