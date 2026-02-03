const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { protect, authorize } = require('../middleware/auth');

// Apply protection to all routes
router.use(protect);

// Get all resources
router.get('/', resourceController.getResources);

// Get resource availability
router.get('/availability', resourceController.getResourceAvailability);

// Get resource statistics
router.get('/statistics', 
  authorize('editor', 'admin'),
  resourceController.getResourceStatistics
);

// Create resource
router.post('/', 
  authorize('editor', 'admin'),
  resourceController.createResource
);

// Get single resource
router.get('/:id', resourceController.getResource);

// Update resource
router.put('/:id', 
  authorize('editor', 'admin'),
  resourceController.updateResource
);

// Delete resource
router.delete('/:id', 
  authorize('admin'),
  resourceController.deleteResource
);

// Check out resource
router.post('/:id/checkout', 
  authorize('editor', 'admin'),
  resourceController.checkoutResource
);

// Check in resource
router.post('/:id/checkin', 
  authorize('reporter', 'crew', 'editor', 'admin'),
  resourceController.checkinResource
);

// Update resource location
router.put('/:id/location', 
  authorize('reporter', 'crew', 'editor', 'admin'),
  resourceController.updateResourceLocation
);

module.exports = router;