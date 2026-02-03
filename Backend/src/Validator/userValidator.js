const { body, param, query } = require('express-validator');
const User = require('../models/user');

module.exports = {
  // Create user validation
  validateCreateUser: [
    body('employeeId')
      .notEmpty().withMessage('Employee ID is required')
      .trim()
      .escape()
      .custom(async (value) => {
        const existingUser = await User.findOne({ employeeId: value });
        if (existingUser) {
          throw new Error('Employee ID already exists');
        }
        return true;
      }),
    
    body('firstName')
      .notEmpty().withMessage('First name is required')
      .trim()
      .escape()
      .isLength({ max: 50 }).withMessage('First name must be less than 50 characters'),
    
    body('lastName')
      .notEmpty().withMessage('Last name is required')
      .trim()
      .escape()
      .isLength({ max: 50 }).withMessage('Last name must be less than 50 characters'),
    
    body('email')
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Valid email is required')
      .normalizeEmail()
      .custom(async (value) => {
        const existingUser = await User.findOne({ email: value });
        if (existingUser) {
          throw new Error('Email already exists');
        }
        return true;
      }),
    
    body('phone')
      .notEmpty().withMessage('Phone number is required')
      .trim()
      .custom(value => {
        const ethiopianPhoneRegex = /^(\+251|0)(9|7)\d{8}$/;
        if (!ethiopianPhoneRegex.test(value)) {
          throw new Error('Phone number must be a valid Ethiopian number');
        }
        return true;
      }),
    
    body('department')
      .notEmpty().withMessage('Department is required')
      .isIn([
        'News', 'Sports', 'Entertainment', 'Politics', 
        'Culture', 'Technical', 'Administration'
      ]).withMessage('Invalid department'),
    
    body('position')
      .notEmpty().withMessage('Position is required')
      .isIn([
        'Reporter', 'Cameraman', 'Sound Technician', 'Driver',
        'Editor', 'Manager', 'Administrator', 'Producer'
      ]).withMessage('Invalid position'),
    
    body('role')
      .optional()
      .isIn(['requester', 'editor', 'reporter', 'crew', 'admin'])
      .withMessage('Invalid role'),
    
    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    
    body('expertise')
      .optional()
      .isArray()
      .withMessage('Expertise must be an array'),
    
    body('expertise.*')
      .optional()
      .isIn([
        'Breaking News', 'Sports', 'Politics', 'Culture',
        'Entertainment', 'Investigative', 'Feature'
      ]).withMessage('Invalid expertise'),
    
    body('languages')
      .optional()
      .isArray()
      .withMessage('Languages must be an array'),
    
    body('languages.*')
      .optional()
      .isIn(['Amharic', 'English', 'Oromo', 'Tigrinya', 'Other'])
      .withMessage('Invalid language')
  ],

  // Update user validation
  validateUpdateUser: [
    param('id')
      .isMongoId()
      .withMessage('Invalid user ID'),
    
    body('firstName')
      .optional()
      .trim()
      .escape()
      .isLength({ max: 50 }).withMessage('First name must be less than 50 characters'),
    
    body('lastName')
      .optional()
      .trim()
      .escape()
      .isLength({ max: 50 }).withMessage('Last name must be less than 50 characters'),
    
    body('email')
      .optional()
      .isEmail().withMessage('Valid email is required')
      .normalizeEmail()
      .custom(async (value, { req }) => {
        const existingUser = await User.findOne({ 
          email: value,
          _id: { $ne: req.params.id }
        });
        if (existingUser) {
          throw new Error('Email already exists');
        }
        return true;
      }),
    
    body('phone')
      .optional()
      .trim()
      .custom(value => {
        const ethiopianPhoneRegex = /^(\+251|0)(9|7)\d{8}$/;
        if (!ethiopianPhoneRegex.test(value)) {
          throw new Error('Phone number must be a valid Ethiopian number');
        }
        return true;
      }),
    
    body('department')
      .optional()
      .isIn([
        'News', 'Sports', 'Entertainment', 'Politics', 
        'Culture', 'Technical', 'Administration'
      ]).withMessage('Invalid department'),
    
    body('position')
      .optional()
      .isIn([
        'Reporter', 'Cameraman', 'Sound Technician', 'Driver',
        'Editor', 'Manager', 'Administrator', 'Producer'
      ]).withMessage('Invalid position'),
    
    body('role')
      .optional()
      .isIn(['requester', 'editor', 'reporter', 'crew', 'admin'])
      .withMessage('Invalid role'),
    
    body('availabilityStatus')
      .optional()
      .isIn(['available', 'assigned', 'on_leave', 'busy'])
      .withMessage('Invalid availability status'),
    
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    
    body('expertise')
      .optional()
      .isArray()
      .withMessage('Expertise must be an array'),
    
    body('expertise.*')
      .optional()
      .isIn([
        'Breaking News', 'Sports', 'Politics', 'Culture',
        'Entertainment', 'Investigative', 'Feature'
      ]).withMessage('Invalid expertise'),
    
    body('notificationPreferences.email')
      .optional()
      .isBoolean()
      .withMessage('Email preference must be a boolean'),
    
    body('notificationPreferences.sms')
      .optional()
      .isBoolean()
      .withMessage('SMS preference must be a boolean'),
    
    body('notificationPreferences.push')
      .optional()
      .isBoolean()
      .withMessage('Push preference must be a boolean'),
    
    body('notificationPreferences.inApp')
      .optional()
      .isBoolean()
      .withMessage('In-app preference must be a boolean')
  ],

  // Change password validation
  validateChangePassword: [
    body('currentPassword')
      .notEmpty().withMessage('Current password is required'),
    
    body('newPassword')
      .notEmpty().withMessage('New password is required')
      .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
      .custom((value, { req }) => {
        if (value === req.body.currentPassword) {
          throw new Error('New password must be different from current password');
        }
        return true;
      }),
    
    body('confirmPassword')
      .notEmpty().withMessage('Confirm password is required')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('Passwords do not match');
        }
        return true;
      })
  ],

  // Login validation
  validateLogin: [
    body('email')
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Valid email is required')
      .normalizeEmail(),
    
    body('password')
      .notEmpty().withMessage('Password is required')
  ],

  // Query validation for getting users
  validateGetUsers: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt(),
    
    query('department')
      .optional()
      .trim()
      .escape(),
    
    query('position')
      .optional()
      .trim()
      .escape(),
    
    query('role')
      .optional()
      .custom(value => {
        const roles = value.split(',');
        for (const role of roles) {
          if (!['requester', 'editor', 'reporter', 'crew', 'admin'].includes(role)) {
            throw new Error(`Invalid role: ${role}`);
          }
        }
        return true;
      }),
    
    query('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean')
      .toBoolean(),
    
    query('search')
      .optional()
      .trim()
      .escape(),
    
    query('sortBy')
      .optional()
      .isIn(['firstName', 'lastName', 'email', 'createdAt', 'lastLogin'])
      .withMessage('Invalid sort field'),
    
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc')
  ],

  // Update location validation
  validateUpdateLocation: [
    param('id')
      .isMongoId()
      .withMessage('Invalid user ID'),
    
    body('coordinates')
      .notEmpty().withMessage('Coordinates are required')
      .isArray().withMessage('Coordinates must be an array')
      .custom(value => {
        if (value.length !== 2) {
          throw new Error('Coordinates must be [longitude, latitude]');
        }
        const [lon, lat] = value;
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
          throw new Error('Invalid coordinates');
        }
        return true;
      }),
    
    body('address')
      .optional()
      .trim()
      .escape(),
    
    body('batteryLevel')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Battery level must be between 0 and 100'),
    
    body('networkStrength')
      .optional()
      .isIn(['poor', 'fair', 'good', 'excellent'])
      .withMessage('Invalid network strength')
  ]
};