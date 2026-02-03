const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');

// Create new request
router.post('/', requestController.createRequest);

// Get all requests (with filtering)
router.get('/', requestController.getRequests);

// Get request by ID
router.get('/:id', requestController.getRequestById);

// Update request status
router.patch('/:id/status', requestController.updateRequestStatus);

// Get dashboard statistics
router.get('/stats/dashboard', requestController.getDashboardStats);

module.exports = router;