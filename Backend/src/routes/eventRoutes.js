const express = require('express');
const router = express.Router();
const eventController = require('../controllers/eventController');
const { protect, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { rules } = require('../middleware/validation');

// Apply protection to all routes
router.use(protect);

// Get all events
router.get('/', eventController.getEvents);

// Get calendar events
router.get('/calendar', eventController.getCalendarEvents);

// Get event statistics
router.get('/statistics', 
  authorize('editor', 'admin'),
  eventController.getEventStatistics
);

// Create event
router.post('/', 
  authorize('editor', 'admin'),
  validate(rules.event.create),
  eventController.createEvent
);

// Get single event
router.get('/:id', eventController.getEvent);

// Update event
router.put('/:id', 
  authorize('editor', 'admin'),
  validate(rules.event.update),
  eventController.updateEvent
);

// Delete event
router.delete('/:id', 
  authorize('admin'),
  eventController.deleteEvent
);

// Update event status
router.put('/:id/status', 
  authorize('reporter', 'crew', 'editor', 'admin'),
  eventController.updateEventStatus
);

// Add incident to event
router.post('/:id/incidents', 
  authorize('reporter', 'crew', 'editor', 'admin'),
  eventController.addIncident
);

// Get upcoming events for user
router.get('/upcoming/mine', eventController.getUpcomingEvents);

module.exports = router;