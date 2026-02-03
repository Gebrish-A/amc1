// src/routes/auth.js - WORKING VERSION
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// SIMPLE PUBLIC ROUTES WITHOUT VALIDATION
router.post('/register', (req, res) => {
  // Direct to controller but with error handling
  try {
    return authController.register(req, res);
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Registration failed' 
    });
  }
});

router.post('/login', (req, res) => {
  console.log('Login request body:', req.body);
  
  try {
    // Check if body exists
    if (!req.body || !req.body.email || !req.body.password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password required'
      });
    }
    
    // Try to call the controller
    return authController.login(req, res);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      details: error.message
    });
  }
});

// Keep other routes with validation for now
router.post('/forgot-password', authController.forgotPassword);
router.put('/reset-password/:resetToken', authController.resetPassword);

// Protected routes (if you have protect middleware)
// router.use(protect);
// router.get('/me', authController.getMe);
// ... etc

module.exports = router;