const Resource = require('../models/resource');
const User = require('../models/user');
const Event = require('../models/event');
const { sendNotification } = require('../utils/notificationService');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

// @desc    Create resource
// @route   POST /api/resources
// @access  Private (Admin, Editor)
exports.createResource = async (req, res) => {
  try {
    const {
      name,
      type,
      subType,
      category,
      description,
      specifications,
      currentLocation,
      assignedTo,
      maintenance,
      insurance
    } = req.body;

    // Check if resource with same identifier exists
    if (specifications && specifications.serialNumber) {
      const existingResource = await Resource.findOne({
        'specifications.serialNumber': specifications.serialNumber
      });

      if (existingResource) {
        return res.status(400).json({
          success: false,
          error: 'Resource with this serial number already exists'
        });
      }
    }

    // Create resource
    const resource = await Resource.create({
      name,
      type,
      subType,
      category,
      description,
      specifications,
      currentLocation,
      assignedTo,
      maintenance,
      insurance,
      availabilityStatus: 'available',
      metadata: {
        createdBy: req.user.id
      }
    });

    // If assigned to a user, update user's current resource
    if (assignedTo) {
      await User.findByIdAndUpdate(assignedTo, {
        $push: { assignedResources: resource._id }
      });

      // Send notification to assigned user
      await sendNotification({
        recipient: assignedTo,
        type: 'system_alert',
        title: 'Resource Assigned',
        message: `Resource "${name}" has been assigned to you.`,
        data: {
          resourceId: resource.resourceId,
          resourceType: type,
          assignedAt: new Date()
        }
      });
    }

    // Log audit
    await AuditLog.create({
      action: 'create',
      entity: 'resource',
      entityId: resource.resourceId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        after: resource.toObject()
      }
    });

    res.status(201).json({
      success: true,
      data: resource,
      message: 'Resource created successfully'
    });

  } catch (error) {
    logger.error('Create resource error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get all resources
// @route   GET /api/resources
// @access  Private
exports.getResources = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'name',
      sortOrder = 'asc',
      type,
      subType,
      category,
      availabilityStatus,
      assignedTo,
      search,
      maintenanceDue
    } = req.query;

    // Build query
    const query = {};

    // Filter by type
    if (type) {
      query.type = { $in: type.split(',') };
    }

    // Filter by subType
    if (subType) {
      query.subType = { $in: subType.split(',') };
    }

    // Filter by category
    if (category) {
      query.category = { $in: category.split(',') };
    }

    // Filter by availability status
    if (availabilityStatus) {
      query.availabilityStatus = { $in: availabilityStatus.split(',') };
    }

    // Filter by assigned user
    if (assignedTo) {
      query.assignedTo = assignedTo;
    }

    // Filter by maintenance due
    if (maintenanceDue === 'true') {
      query['maintenance.nextMaintenance'] = {
        $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Due within 7 days
      };
    }

    // Text search
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { resourceId: { $regex: search, $options: 'i' } },
        { 'specifications.model': { $regex: search, $options: 'i' } },
        { 'specifications.serialNumber': { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [resources, total] = await Promise.all([
      Resource.find(query)
        .populate('assignedTo', 'firstName lastName email phone')
        .populate('assignedEvent', 'title eventId')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Resource.countDocuments(query)
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      data: resources,
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
    logger.error('Get resources error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get single resource
// @route   GET /api/resources/:id
// @access  Private
exports.getResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id)
      .populate('assignedTo', 'firstName lastName email phone department position')
      .populate('assignedEvent', 'title eventId schedule.location')
      .populate('bookingSchedule.event', 'title eventId schedule');

    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found'
      });
    }

    res.status(200).json({
      success: true,
      data: resource
    });

  } catch (error) {
    logger.error('Get resource error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Update resource
// @route   PUT /api/resources/:id
// @access  Private (Admin, Editor)
exports.updateResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);

    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found'
      });
    }

    // Store old data for audit
    const oldData = { ...resource.toObject() };

    const updates = {};
    const allowedFields = [
      'name', 'description', 'specifications', 'currentLocation',
      'assignedTo', 'assignedEvent', 'availabilityStatus',
      'maintenance', 'operationalStatus', 'insurance', 'documents'
    ];

    // Filter allowed fields
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Check if assignedTo is changing
    if (updates.assignedTo && updates.assignedTo !== resource.assignedTo?.toString()) {
      // Remove from old user
      if (resource.assignedTo) {
        await User.findByIdAndUpdate(resource.assignedTo, {
          $pull: { assignedResources: resource._id }
        });
      }

      // Add to new user
      await User.findByIdAndUpdate(updates.assignedTo, {
        $push: { assignedResources: resource._id }
      });

      // Send notification to new assigned user
      await sendNotification({
        recipient: updates.assignedTo,
        type: 'system_alert',
        title: 'Resource Assigned',
        message: `Resource "${resource.name}" has been assigned to you.`,
        data: {
          resourceId: resource.resourceId,
          resourceType: resource.type,
          assignedAt: new Date()
        }
      });
    }

    // Update resource
    Object.assign(resource, updates);
    resource.metadata.lastUpdatedBy = req.user.id;
    resource.metadata.lastUpdatedAt = new Date();
    await resource.save();

    // Log audit
    await AuditLog.create({
      action: 'update',
      entity: 'resource',
      entityId: resource.resourceId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        before: oldData,
        after: resource.toObject(),
        changes: this.calculateChanges(oldData, updates)
      }
    });

    res.status(200).json({
      success: true,
      data: resource,
      message: 'Resource updated successfully'
    });

  } catch (error) {
    logger.error('Update resource error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Delete resource
// @route   DELETE /api/resources/:id
// @access  Private (Admin)
exports.deleteResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);

    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found'
      });
    }

    // Check if resource is currently assigned
    if (resource.availabilityStatus === 'assigned' || resource.assignedEvent) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete resource that is currently assigned'
      });
    }

    // Remove from assigned user
    if (resource.assignedTo) {
      await User.findByIdAndUpdate(resource.assignedTo, {
        $pull: { assignedResources: resource._id }
      });
    }

    // Store data for audit before deletion
    const resourceData = resource.toObject();

    // Delete resource
    await resource.deleteOne();

    // Log audit
    await AuditLog.create({
      action: 'delete',
      entity: 'resource',
      entityId: resourceData.resourceId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        before: resourceData
      }
    });

    res.status(200).json({
      success: true,
      message: 'Resource deleted successfully'
    });

  } catch (error) {
    logger.error('Delete resource error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Check out resource for event
// @route   POST /api/resources/:id/checkout
// @access  Private (Editor, Admin)
exports.checkoutResource = async (req, res) => {
  try {
    const { eventId, start, end, condition, notes } = req.body;

    const resource = await Resource.findById(req.params.id);
    const event = await Event.findById(eventId);

    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found'
      });
    }

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    // Check if resource is available
    if (resource.availabilityStatus !== 'available') {
      return res.status(400).json({
        success: false,
        error: `Resource is currently ${resource.availabilityStatus}`
      });
    }

    // Check for scheduling conflicts
    const hasConflict = resource.bookingSchedule.some(booking => {
      return (
        booking.status === 'confirmed' &&
        booking.start < end &&
        booking.end > start
      );
    });

    if (hasConflict) {
      return res.status(409).json({
        success: false,
        error: 'Resource has scheduling conflict'
      });
    }

    // Add to booking schedule
    resource.bookingSchedule.push({
      event: eventId,
      start: new Date(start),
      end: new Date(end),
      status: 'confirmed',
      notes
    });

    // Update availability
    resource.availabilityStatus = 'assigned';
    resource.assignedEvent = eventId;
    
    // Update operational status if condition is provided
    if (condition) {
      resource.operationalStatus = resource.operationalStatus || {};
      resource.operationalStatus.condition = condition;
      resource.operationalStatus.lastCheck = new Date();
    }

    await resource.save();

    // Add to event's assigned resources
    event.assignedResources.push({
      resource: resource._id,
      role: resource.subType,
      status: 'confirmed',
      assignedAt: new Date(),
      notes: notes || `Checked out for event: ${event.title}`
    });

    await event.save();

    // Send notifications
    if (resource.assignedTo) {
      await sendNotification({
        recipient: resource.assignedTo,
        type: 'assignment_created',
        title: 'Resource Checked Out',
        message: `Resource "${resource.name}" has been checked out for event "${event.title}"`,
        data: {
          resourceId: resource.resourceId,
          eventId: event.eventId,
          startTime: start,
          endTime: end
        }
      });
    }

    // Log audit
    await AuditLog.create({
      action: 'checkout',
      entity: 'resource',
      entityId: resource.resourceId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        eventId: event.eventId,
        start,
        end,
        condition
      }
    });

    res.status(200).json({
      success: true,
      data: resource,
      message: 'Resource checked out successfully'
    });

  } catch (error) {
    logger.error('Checkout resource error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Check in resource
// @route   POST /api/resources/:id/checkin
// @access  Private (Editor, Admin, Assigned User)
exports.checkinResource = async (req, res) => {
  try {
    const { eventId, condition, notes, issues } = req.body;

    const resource = await Resource.findById(req.params.id);
    const event = await Event.findById(eventId);

    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found'
      });
    }

    // Find the booking for this event
    const booking = resource.bookingSchedule.find(
      b => b.event.toString() === eventId && b.status === 'confirmed'
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'No active booking found for this event'
      });
    }

    // Update booking
    booking.status = 'completed';
    booking.checkinTime = new Date();
    booking.condition = condition;
    booking.notes = notes;

    // Update operational status
    resource.operationalStatus = resource.operationalStatus || {};
    resource.operationalStatus.condition = condition;
    resource.operationalStatus.lastCheck = new Date();

    // Add issues if any
    if (issues) {
      resource.operationalStatus.issues = resource.operationalStatus.issues || [];
      resource.operationalStatus.issues.push({
        description: issues,
        severity: 'low',
        reportedAt: new Date(),
        reportedBy: req.user.id
      });

      // If there are issues, set status to maintenance
      if (issues.trim().length > 0) {
        resource.availabilityStatus = 'maintenance';
      }
    }

    // Check if all bookings are completed
    const hasActiveBookings = resource.bookingSchedule.some(
      b => b.status === 'confirmed'
    );

    if (!hasActiveBookings) {
      resource.availabilityStatus = issues ? 'maintenance' : 'available';
      resource.assignedEvent = null;
    }

    await resource.save();

    // Update event's assigned resources status
    if (event) {
      const resourceAssignment = event.assignedResources.find(
        a => a.resource.toString() === resource._id.toString()
      );
      
      if (resourceAssignment) {
        resourceAssignment.status = 'returned';
        resourceAssignment.returnedAt = new Date();
        await event.save();
      }
    }

    // Send notifications
    if (resource.assignedTo) {
      await sendNotification({
        recipient: resource.assignedTo,
        type: 'system_alert',
        title: 'Resource Checked In',
        message: `Resource "${resource.name}" has been checked in. ${issues ? 'Issues reported: ' + issues : ''}`,
        data: {
          resourceId: resource.resourceId,
          condition,
          hasIssues: !!issues
        }
      });
    }

    // Log audit
    await AuditLog.create({
      action: 'checkin',
      entity: 'resource',
      entityId: resource.resourceId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        eventId: eventId,
        condition,
        issues,
        bookingId: booking._id
      }
    });

    res.status(200).json({
      success: true,
      data: resource,
      message: 'Resource checked in successfully'
    });

  } catch (error) {
    logger.error('Checkin resource error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get resource availability
// @route   GET /api/resources/availability
// @access  Private
exports.getResourceAvailability = async (req, res) => {
  try {
    const { start, end, type, subType, category } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'Start and end dates are required'
      });
    }

    const query = {
      availabilityStatus: 'available',
      $or: [
        { bookingSchedule: { $size: 0 } },
        {
          bookingSchedule: {
            $not: {
              $elemMatch: {
                start: { $lt: new Date(end) },
                end: { $gt: new Date(start) },
                status: { $in: ['confirmed', 'tentative'] }
              }
            }
          }
        }
      ]
    };

    // Add filters
    if (type) query.type = type;
    if (subType) query.subType = subType;
    if (category) query.category = category;

    const availableResources = await Resource.find(query)
      .populate('assignedTo', 'firstName lastName')
      .sort({ name: 1 })
      .lean();

    // Also get resources that will be available by the start time
    const willBeAvailable = await Resource.find({
      availabilityStatus: 'assigned',
      'bookingSchedule.end': { $lt: new Date(start) }
    }).populate('assignedTo', 'firstName lastName');

    const allResources = [...availableResources, ...willBeAvailable];

    res.status(200).json({
      success: true,
      data: {
        available: allResources,
        count: allResources.length
      }
    });

  } catch (error) {
    logger.error('Get resource availability error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get resource statistics
// @route   GET /api/resources/statistics
// @access  Private (Editor, Admin)
exports.getResourceStatistics = async (req, res) => {
  try {
    const statistics = await Resource.aggregate([
      {
        $facet: {
          totalByType: [
            { $group: { _id: '$type', count: { $sum: 1 } } }
          ],
          byAvailability: [
            { $group: { _id: '$availabilityStatus', count: { $sum: 1 } } }
          ],
          byCategory: [
            { $group: { _id: '$category', count: { $sum: 1 } } }
          ],
          maintenanceDue: [
            {
              $match: {
                'maintenance.nextMaintenance': {
                  $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                }
              }
            },
            { $count: 'count' }
          ],
          utilizationRate: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                assigned: {
                  $sum: {
                    $cond: [{ $eq: ['$availabilityStatus', 'assigned'] }, 1, 0]
                  }
                }
              }
            },
            {
              $project: {
                utilizationRate: {
                  $multiply: [
                    { $divide: ['$assigned', '$total'] },
                    100
                  ]
                },
                total: 1,
                assigned: 1,
                available: { $subtract: ['$total', '$assigned'] }
              }
            }
          ],
          mostUsedResources: [
            {
              $addFields: {
                bookingCount: { $size: '$bookingSchedule' }
              }
            },
            { $sort: { bookingCount: -1 } },
            { $limit: 10 },
            {
              $project: {
                name: 1,
                type: 1,
                subType: 1,
                bookingCount: 1,
                lastMaintenance: '$maintenance.lastMaintenance'
              }
            }
          ]
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: statistics[0]
    });

  } catch (error) {
    logger.error('Get resource statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Update resource location
// @route   PUT /api/resources/:id/location
// @access  Private (Assigned User, Editor, Admin)
exports.updateResourceLocation = async (req, res) => {
  try {
    const { coordinates, address, batteryLevel, networkStrength } = req.body;

    const resource = await Resource.findById(req.params.id);

    if (!resource) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found'
      });
    }

    // Check if user is authorized (assigned user or editor/admin)
    const isAssigned = resource.assignedTo?.toString() === req.user.id;
    const isEditorOrAdmin = ['editor', 'admin'].includes(req.user.role);

    if (!isAssigned && !isEditorOrAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update resource location'
      });
    }

    // Update location
    resource.currentLocation = {
      type: 'Point',
      coordinates: coordinates || resource.currentLocation.coordinates,
      address: address || resource.currentLocation.address,
      lastUpdated: new Date()
    };

    // Update operational status
    if (batteryLevel !== undefined) {
      resource.operationalStatus = resource.operationalStatus || {};
      resource.operationalStatus.batteryLevel = batteryLevel;
    }

    await resource.save();

    // Send real-time update via Socket.IO
    if (global.io && resource.assignedEvent) {
      global.io.to(`event_${resource.assignedEvent}`).emit('resourceLocationUpdate', {
        resourceId: resource.resourceId,
        resourceName: resource.name,
        coordinates: resource.currentLocation.coordinates,
        address: resource.currentLocation.address,
        timestamp: new Date(),
        batteryLevel
      });
    }

    // Log audit
    await AuditLog.create({
      action: 'update',
      entity: 'resource',
      entityId: resource.resourceId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        field: 'location',
        coordinates,
        address,
        batteryLevel
      }
    });

    res.status(200).json({
      success: true,
      data: resource.currentLocation,
      message: 'Resource location updated successfully'
    });

  } catch (error) {
    logger.error('Update resource location error:', error);
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
