const { body, param, query } = require('express-validator');
const CoverageRequest = require('../models/CoverageRequest');

module.exports = {
  // Create coverage request validation
  validateCreateCoverageRequest: [
    body('title')
      .notEmpty().withMessage('Title is required')
      .trim()
      .escape()
      .isLength({ max: 200 }).withMessage('Title must be less than 200 characters'),
    
    body('description')
      .notEmpty().withMessage('Description is required')
      .trim()
      .escape()
      .isLength({ min: 10, max: 5000 }).withMessage('Description must be between 10 and 5000 characters'),
    
    body('category')
      .notEmpty().withMessage('Category is required')
      .isIn([
        'Breaking News', 'Politics', 'Sports', 'Culture', 
        'Entertainment', 'Business', 'Health', 'Education', 'Technology'
      ]).withMessage('Invalid category'),
    
    body('priority')
      .optional()
      .isIn(['high', 'medium', 'low'])
      .withMessage('Priority must be high, medium, or low'),
    
    body('location.address')
      .optional()
      .trim()
      .escape(),
    
    body('location.coordinates')
      .optional()
      .custom(value => {
        if (!Array.isArray(value) || value.length !== 2) {
          throw new Error('Coordinates must be an array of [longitude, latitude]');
        }
        const [lon, lat] = value;
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
          throw new Error('Invalid coordinates');
        }
        return true;
      }),
    
    body('proposedDateTime.start')
      .notEmpty().withMessage('Start date is required')
      .isISO8601().withMessage('Invalid start date format'),
    
    body('proposedDateTime.end')
      .notEmpty().withMessage('End date is required')
      .isISO8601().withMessage('Invalid end date format')
      .custom((value, { req }) => {
        const startDate = new Date(req.body.proposedDateTime.start);
        const endDate = new Date(value);
        if (endDate <= startDate) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),
    
    body('expectedDuration')
      .optional()
      .isFloat({ min: 0.5, max: 24 })
      .withMessage('Duration must be between 0.5 and 24 hours'),
    
    body('requiredResources.reporters')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Number of reporters must be a positive integer'),
    
    body('requiredResources.cameramen')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Number of cameramen must be a positive integer'),
    
    body('tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array'),
    
    body('tags.*')
      .optional()
      .trim()
      .escape()
      .isLength({ max: 50 })
      .withMessage('Tag must be less than 50 characters')
  ],

  // Update coverage request validation
  validateUpdateCoverageRequest: [
    param('id')
      .isMongoId()
      .withMessage('Invalid request ID'),
    
    body('title')
      .optional()
      .trim()
      .escape()
      .isLength({ max: 200 }).withMessage('Title must be less than 200 characters'),
    
    body('description')
      .optional()
      .trim()
      .escape()
      .isLength({ min: 10, max: 5000 }).withMessage('Description must be between 10 and 5000 characters'),
    
    body('priority')
      .optional()
      .isIn(['high', 'medium', 'low'])
      .withMessage('Priority must be high, medium, or low'),
    
    body('status')
      .optional()
      .isIn([
        'draft', 'submitted', 'under_review', 'approved', 'rejected',
        'scheduled', 'in_progress', 'completed', 'cancelled', 'archived'
      ]).withMessage('Invalid status'),
    
    body('location.coordinates')
      .optional()
      .custom(value => {
        if (!Array.isArray(value) || value.length !== 2) {
          throw new Error('Coordinates must be an array of [longitude, latitude]');
        }
        const [lon, lat] = value;
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
          throw new Error('Invalid coordinates');
        }
        return true;
      })
  ],

  // Approve/reject coverage request validation
  validateApproveCoverageRequest: [
    param('id')
      .isMongoId()
      .withMessage('Invalid request ID'),
    
    body('action')
      .notEmpty().withMessage('Action is required')
      .isIn(['approve', 'reject', 'request_revision'])
      .withMessage('Action must be approve, reject, or request_revision'),
    
    body('comments')
      .optional()
      .trim()
      .escape()
      .isLength({ max: 1000 }).withMessage('Comments must be less than 1000 characters'),
    
    body('slaDeadline')
      .optional()
      .isISO8601()
      .withMessage('Invalid SLA deadline format')
      .custom((value, { req }) => {
        if (req.body.action === 'approve' && !value) {
          throw new Error('SLA deadline is required when approving');
        }
        return true;
      })
  ],

  // Query validation for getting coverage requests
  validateGetCoverageRequests: [
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
    
    query('status')
      .optional()
      .custom(value => {
        const statuses = value.split(',');
        const validStatuses = [
          'draft', 'submitted', 'under_review', 'approved', 'rejected',
          'scheduled', 'in_progress', 'completed', 'cancelled', 'archived'
        ];
        
        for (const status of statuses) {
          if (!validStatuses.includes(status)) {
            throw new Error(`Invalid status: ${status}`);
          }
        }
        return true;
      }),
    
    query('priority')
      .optional()
      .custom(value => {
        const priorities = value.split(',');
        for (const priority of priorities) {
          if (!['high', 'medium', 'low'].includes(priority)) {
            throw new Error(`Invalid priority: ${priority}`);
          }
        }
        return true;
      }),
    
    query('category')
      .optional()
      .custom(value => {
        const categories = value.split(',');
        const validCategories = [
          'Breaking News', 'Politics', 'Sports', 'Culture',
          'Entertainment', 'Business', 'Health', 'Education', 'Technology'
        ];
        
        for (const category of categories) {
          if (!validCategories.includes(category)) {
            throw new Error(`Invalid category: ${category}`);
          }
        }
        return true;
      }),
    
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),
    
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format')
      .custom((value, { req }) => {
        if (req.query.startDate && value) {
          const startDate = new Date(req.query.startDate);
          const endDate = new Date(value);
          if (endDate < startDate) {
            throw new Error('End date must be after start date');
          }
        }
        return true;
      }),
    
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'updatedAt', 'priority', 'title'])
      .withMessage('Invalid sort field'),
    
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc')
  ],

  // Statistics query validation
  validateStatisticsQuery: [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),
    
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format')
      .custom((value, { req }) => {
        if (req.query.startDate && value) {
          const startDate = new Date(req.query.startDate);
          const endDate = new Date(value);
          if (endDate < startDate) {
            throw new Error('End date must be after start date');
          }
        }
        return true;
      }),
    
    query('department')
      .optional()
      .trim()
      .escape(),
    
    query('category')
      .optional()
      .custom(value => {
        const categories = value.split(',');
        const validCategories = [
          'Breaking News', 'Politics', 'Sports', 'Culture',
          'Entertainment', 'Business', 'Health', 'Education', 'Technology'
        ];
        
        for (const category of categories) {
          if (!validCategories.includes(category)) {
            throw new Error(`Invalid category: ${category}`);
          }
        }
        return true;
      })
  ]
};