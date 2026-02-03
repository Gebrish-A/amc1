const Event = require('../models/event');
const CoverageRequest = require('../models/coveragerequest');
const Resource = require('../models/resource');
const Assignment = require('../models/assignment');
const { sendNotification } = require('../utils/notificationService');
const calendarService = require('../utils/calendarService');
const resourceAllocator = require('../utils/resourceAllocator');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

// @desc    Create event from coverage request
// @route   POST /api/events
// @access  Private (Editor, Admin)
exports.createEvent = async (req, res) => {
  try {
    const { coverageRequestId, schedule, location, description } = req.body;

    // Get coverage request
    const coverageRequest = await CoverageRequest.findById(coverageRequestId);
    
    if (!coverageRequest) {
      return res.status(404).json({
        success: false,
        error: 'Coverage request not found'
      });
    }

    if (coverageRequest.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Coverage request must be approved before creating event'
      });
    }

    // Check scheduling conflicts
    const conflicts = await calendarService.checkSchedulingConflicts({
      start: schedule.start,
      end: schedule.end,
      location: location || coverageRequest.location
    });

    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        conflicts,
        message: 'Scheduling conflicts detected'
      });
    }

    // Create event
    const event = await Event.create({
      coverageRequest: coverageRequestId,
      title: coverageRequest.title,
      description: description || coverageRequest.description,
      location: location || coverageRequest.location,
      schedule,
      status: 'scheduled',
      metadata: {
        createdBy: req.user.id,
        revision: 1
      }
    });

    // Update coverage request status
    coverageRequest.status = 'scheduled';
    await coverageRequest.save();

    // Allocate resources if specified
    let resourceAllocations = {};
    if (req.body.allocateResources !== false) {
      const requirements = {
        personnel: [
          { role: 'reporter', count: coverageRequest.requiredResources.reporters || 1 },
          { role: 'cameraman', count: coverageRequest.requiredResources.cameramen || 1 }
        ],
        equipment: [
          { type: 'camera', count: coverageRequest.requiredResources.cameras || 1 },
          { type: 'microphone', count: coverageRequest.requiredResources.microphones || 1 }
        ]
      };

      if (coverageRequest.requiredResources.vehicles > 0) {
        requirements.vehicles = [
          { type: 'car', count: coverageRequest.requiredResources.vehicles }
        ];
      }

      resourceAllocations = await resourceAllocator.allocateResources(event, requirements);
    }

    // Send notifications
    await sendNotification({
      recipient: coverageRequest.requester,
      type: 'event_reminder',
      title: 'Event Scheduled',
      message: `Your coverage request "${coverageRequest.title}" has been scheduled as an event.`,
      data: {
        requestId: coverageRequest.requestId,
        eventId: event.eventId,
        startTime: schedule.start
      }
    });

    // Log audit
    await AuditLog.create({
      action: 'create',
      entity: 'event',
      entityId: event.eventId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        after: event.toObject(),
        resourceAllocations
      }
    });

    res.status(201).json({
      success: true,
      data: {
        event,
        resourceAllocations
      },
      message: 'Event created successfully'
    });

  } catch (error) {
    logger.error('Create event error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get all events
// @route   GET /api/events
// @access  Private
exports.getEvents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'schedule.start',
      sortOrder = 'asc',
      status,
      startDate,
      endDate,
      category,
      priority,
      search
    } = req.query;

    // Build query
    const query = {};

    // Filter by status
    if (status) {
      query.status = { $in: status.split(',') };
    }

    // Filter by date range
    if (startDate || endDate) {
      query['schedule.start'] = {};
      if (startDate) query['schedule.start'].$gte = new Date(startDate);
      if (endDate) query['schedule.start'].$lte = new Date(endDate);
    }

    // Filter by category (through coverage request)
    if (category) {
      const coverageRequests = await CoverageRequest.find({
        category: { $in: category.split(',') }
      }).select('_id');
      
      query.coverageRequest = { $in: coverageRequests.map(cr => cr._id) };
    }

    // Text search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { eventId: { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [events, total] = await Promise.all([
      Event.find(query)
        .populate({
          path: 'coverageRequest',
          select: 'title category priority requestId requester',
          populate: {
            path: 'requester',
            select: 'firstName lastName department'
          }
        })
        .populate('assignedResources.resource', 'name type subType')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Event.countDocuments(query)
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      data: events,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages,
        hasNextPage,
        hasPrevPage
      }
    });

  } catch (error) {
    logger.error('Get events error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get single event
// @route   GET /api/events/:id
// @access  Private
exports.getEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate({
        path: 'coverageRequest',
        select: 'title description category priority requestId requester attachments',
        populate: {
          path: 'requester',
          select: 'firstName lastName email phone department'
        }
      })
      .populate({
        path: 'assignedResources.resource',
        select: 'name type subType specifications availabilityStatus',
        populate: {
          path: 'assignedTo',
          select: 'firstName lastName email phone'
        }
      })
      .populate('checklist.assignedTo', 'firstName lastName')
      .populate('notes.createdBy', 'firstName lastName')
      .populate('incidents.reportedBy', 'firstName lastName');

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    res.status(200).json({
      success: true,
      data: event
    });

  } catch (error) {
    logger.error('Get event error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Update event
// @route   PUT /api/events/:id
// @access  Private (Editor, Admin)
exports.updateEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    // Store old data for audit
    const oldData = { ...event.toObject() };

    const updates = {};
    const allowedFields = [
      'title', 'description', 'location', 'schedule', 'status',
      'checklist', 'notes', 'weatherInfo', 'trafficInfo'
    ];

    // Filter allowed fields
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // If schedule is being updated, check for conflicts
    if (updates.schedule) {
      const conflicts = await calendarService.checkSchedulingConflicts({
        start: updates.schedule.start || event.schedule.start,
        end: updates.schedule.end || event.schedule.end,
        location: updates.location || event.location
      });

      if (conflicts.length > 0) {
        return res.status(409).json({
          success: false,
          conflicts,
          message: 'Scheduling conflicts detected'
        });
      }
    }

    // Update event
    Object.assign(event, updates);
    event.metadata.revision += 1;
    event.metadata.lastModifiedBy = req.user.id;
    await event.save();

    // Send notifications if status changed
    if (updates.status && updates.status !== oldData.status) {
      // Notify assigned resources
      if (event.assignedResources && event.assignedResources.length > 0) {
        for (const allocation of event.assignedResources) {
          if (allocation.resource?.assignedTo) {
            await sendNotification({
              recipient: allocation.resource.assignedTo,
              type: 'assignment_updated',
              title: 'Event Status Updated',
              message: `Event "${event.title}" status changed to ${updates.status}`,
              data: {
                eventId: event.eventId,
                oldStatus: oldData.status,
                newStatus: updates.status
              }
            });
          }
        }
      }
    }

    // Log audit
    await AuditLog.create({
      action: 'update',
      entity: 'event',
      entityId: event.eventId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        before: oldData,
        after: event.toObject(),
        changes: this.calculateChanges(oldData, updates)
      }
    });

    res.status(200).json({
      success: true,
      data: event,
      message: 'Event updated successfully'
    });

  } catch (error) {
    logger.error('Update event error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Delete event
// @route   DELETE /api/events/:id
// @access  Private (Admin)
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    // Check if event can be deleted
    if (event.status === 'in_progress' || event.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: `Cannot delete event with status: ${event.status}`
      });
    }

    // Release allocated resources
    await resourceAllocator.releaseResources(event._id);

    // Update coverage request status
    await CoverageRequest.findByIdAndUpdate(
      event.coverageRequest,
      { status: 'approved' }
    );

    // Store data for audit before deletion
    const eventData = event.toObject();

    // Delete event
    await event.deleteOne();

    // Log audit
    await AuditLog.create({
      action: 'delete',
      entity: 'event',
      entityId: eventData.eventId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        before: eventData
      }
    });

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully'
    });

  } catch (error) {
    logger.error('Delete event error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Add incident to event
// @route   POST /api/events/:id/incidents
// @access  Private (Reporter, Editor, Admin)
exports.addIncident = async (req, res) => {
  try {
    const { type, description, severity } = req.body;

    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    const incident = {
      type,
      description,
      severity: severity || 'medium',
      reportedBy: req.user.id,
      reportedAt: new Date()
    };

    event.incidents.push(incident);
    await event.save();

    // Send notification to editors/admins
    const User = require('../models/user');
    const editors = await User.find({
      role: { $in: ['editor', 'admin'] },
      isActive: true
    }).select('_id');

    for (const editor of editors) {
      await sendNotification({
        recipient: editor._id,
        type: 'system_alert',
        title: 'Event Incident Reported',
        message: `New incident reported for event "${event.title}": ${description}`,
        data: {
          eventId: event.eventId,
          incidentType: type,
          severity: severity,
          reporter: req.user.id
        },
        priority: severity === 'critical' ? 'critical' : 'high'
      });
    }

    // Log audit
    await AuditLog.create({
      action: 'create',
      entity: 'event_incident',
      entityId: event._id,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        incident,
        eventId: event.eventId
      }
    });

    res.status(201).json({
      success: true,
      data: incident,
      message: 'Incident reported successfully'
    });

  } catch (error) {
    logger.error('Add incident error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Update event status in real-time
// @route   PUT /api/events/:id/status
// @access  Private (Assigned personnel)
exports.updateEventStatus = async (req, res) => {
  try {
    const { status, location, notes } = req.body;

    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    // Check if user is assigned to this event
    const isAssigned = event.assignedResources.some(
      allocation => allocation.resource?.assignedTo?.toString() === req.user.id
    );

    if (!isAssigned && req.user.role !== 'editor' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this event'
      });
    }

    const oldStatus = event.status;
    event.status = status;

    // Update actual timings based on status
    if (status === 'in_progress' && !event.actualTimings.startedAt) {
      event.actualTimings.startedAt = new Date();
    } else if (status === 'completed' && !event.actualTimings.finishedAt) {
      event.actualTimings.finishedAt = new Date();
    }

    // Add note if provided
    if (notes) {
      event.notes.push({
        content: `Status changed to ${status}: ${notes}`,
        createdBy: req.user.id,
        createdAt: new Date()
      });
    }

    await event.save();

    // Send real-time update via Socket.IO
    if (global.io) {
      global.io.to(`event_${event._id}`).emit('eventStatusUpdate', {
        eventId: event.eventId,
        status,
        updatedBy: req.user.id,
        timestamp: new Date(),
        location
      });
    }

    // Send notifications
    if (oldStatus !== status) {
      // Notify requester
      const coverageRequest = await CoverageRequest.findById(event.coverageRequest);
      if (coverageRequest && coverageRequest.requester) {
        await sendNotification({
          recipient: coverageRequest.requester,
          type: 'assignment_updated',
          title: 'Event Status Updated',
          message: `Event "${event.title}" status updated to ${status}`,
          data: {
            eventId: event.eventId,
            oldStatus,
            newStatus: status
          }
        });
      }

      // Notify editors
      const User = require('../models/user');
      const editors = await User.find({
        role: { $in: ['editor', 'admin'] },
        isActive: true
      }).select('_id');

      for (const editor of editors) {
        await sendNotification({
          recipient: editor._id,
          type: 'assignment_updated',
          title: 'Event Status Changed',
          message: `Event "${event.title}" status changed from ${oldStatus} to ${status}`,
          data: {
            eventId: event.eventId,
            updatedBy: req.user.id
          }
        });
      }
    }

    // Log audit
    await AuditLog.create({
      action: 'update',
      entity: 'event',
      entityId: event.eventId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        field: 'status',
        oldValue: oldStatus,
        newValue: status,
        notes
      }
    });

    res.status(200).json({
      success: true,
      data: event,
      message: 'Event status updated successfully'
    });

  } catch (error) {
    logger.error('Update event status error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get calendar events
// @route   GET /api/events/calendar
// @access  Private
exports.getCalendarEvents = async (req, res) => {
  try {
    const { startDate, endDate, department, category } = req.query;

    const events = await calendarService.getCalendarEvents({
      startDate,
      endDate,
      userId: req.user.id,
      department,
      category
    });

    res.status(200).json({
      success: true,
      data: events
    });

  } catch (error) {
    logger.error('Get calendar events error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get event statistics
// @route   GET /api/events/statistics
// @access  Private (Editor, Admin)
exports.getEventStatistics = async (req, res) => {
  try {
    const { timeRange = 'month' } = req.query;

    const statistics = await calendarService.getEventStatistics(timeRange);

    res.status(200).json({
      success: true,
      data: statistics
    });

  } catch (error) {
    logger.error('Get event statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Helper function to calculate changes
exports.calculateChanges = (oldData, newData) => {
  const changes = [];
  
  for (const key in newData) {
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      changes.push({
        field: key,
        oldValue: oldData[key],
        newValue: newData[key]
      });
    }
  }
  
  return changes;
};
