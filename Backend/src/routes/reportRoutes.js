const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/auth');

// Apply protection to all routes
router.use(protect);

// Get all reports
router.get('/', reportController.getReports);

// Get report statistics
router.get('/statistics', 
  authorize('editor', 'admin'),
  reportController.getReportStatistics
);

// Generate coverage report
router.post('/coverage', 
  authorize('editor', 'admin'),
  reportController.generateCoverageReport
);

// Generate resource utilization report
router.post('/resources', 
  authorize('editor', 'admin'),
  reportController.generateResourceReport
);

// Generate performance analytics report
router.post('/performance', 
  authorize('admin'),
  reportController.generatePerformanceReport
);

// Create scheduled report
router.post('/schedule', 
  authorize('editor', 'admin'),
  reportController.scheduleReport
);

// Get single report
router.get('/:id', reportController.getReport);

// Download report
router.get('/:id/download', reportController.downloadReport);

// Delete report
router.delete('/:id', 
  authorize('admin'),
  reportController.deleteReport
);

module.exports = router;