const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const { protect, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { rules } = require('../middleware/validation');

// Apply protection to all routes
router.use(protect);

// Get all assignments
router.get('/', assignmentController.getAssignments);

// Get assignment suggestions
router.get('/suggestions/:eventId', 
  authorize('editor', 'admin'),
  assignmentController.getAssignmentSuggestions
);

// Get assignment statistics
router.get('/statistics', 
  authorize('editor', 'admin'),
  assignmentController.getAssignmentStatistics
);

// Create assignment
router.post('/', 
  authorize('editor', 'admin'),
  validate(rules.assignment.create),
  assignmentController.createAssignment
);

// Get single assignment
router.get('/:id', assignmentController.getAssignment);

// Update assignment
router.put('/:id', 
  authorize('reporter', 'crew', 'editor', 'admin'),
  assignmentController.updateAssignment
);

// Update assignment status
router.put('/:id/status', 
  authorize('reporter', 'crew', 'editor', 'admin'),
  validate(rules.assignment.updateStatus),
  assignmentController.updateAssignmentStatus
);

// Add progress update
router.post('/:id/progress', 
  authorize('reporter', 'crew'),
  assignmentController.addProgressUpdate
);

// Update location
router.put('/:id/location', 
  authorize('reporter', 'crew'),
  assignmentController.updateLocation
);

// Submit feedback
router.post('/:id/feedback', 
  authorize('reporter', 'crew', 'editor', 'admin'),
  assignmentController.submitFeedback
);

module.exports = router;