const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

// Apply protection to all routes
router.use(protect);

// Get user notifications
router.get('/', notificationController.getNotifications);

// Get notification preferences
router.get('/preferences', notificationController.getPreferences);

// Update notification preferences
router.put('/preferences', notificationController.updatePreferences);

// Mark notification as read
router.put('/:id/read', notificationController.markAsRead);

// Mark all notifications as read
router.put('/read-all', notificationController.markAllAsRead);

// Delete notification
router.delete('/:id', notificationController.deleteNotification);

// Clear all notifications
router.delete('/clear-all', notificationController.clearAllNotifications);

// Admin/Editor only routes
router.get('/statistics', 
  authorize('editor', 'admin'),
  notificationController.getNotificationStatistics
);

router.post('/test', 
  authorize('editor', 'admin'),
  notificationController.testNotification
);

router.post('/send', 
  authorize('admin'),
  notificationController.sendCustomNotification
);

module.exports = router;