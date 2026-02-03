const Assignment = require('../models/assignment');
const Event = require('../models/event');
const User = require('../models/user');
const Resource = require('../models/resource');
const { sendNotification } = require('../utils/notificationService');
const { suggestReporters } = require('../utils/aiSuggestion');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

// @desc    Create assignment
// @route   POST /api/assignments
// @access  Private (Editor, Admin)
exports.createAssignment = async (req, res) => {
  try {
    const {
      event,
      assignee,
      role,
      responsibilities,
      priority,
      schedule,
      equipmentAssigned,
      vehicleAssigned
    } = req.body;

    // Check if event exists
    const eventDoc = await Event.findById(event);
    if (!eventDoc) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    // Check if assignee exists and is available
    const assigneeDoc = await User.findById(assignee);
    if (!assigneeDoc || !assigneeDoc.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Assignee not found or inactive'
      });
    }

    // Check if assignee already has assignment for this time
    if (schedule && schedule.start && schedule.end) {
      const existingAssignment = await Assignment.findOne({
        assignee,
        status: { $in: ['accepted', 'in_progress', 'pending'] },
        $or: [
          { 'schedule.start': { $lt: schedule.end } },
          { 'schedule.end': { $gt: schedule.start } }
        ]
      });

      if (existingAssignment) {
        return res.status(409).json({
          success: false,
          error: 'Assignee already has an assignment during this time',
          conflictingAssignment: existingAssignment
        });
      }
    }

    // Create assignment
    const assignment = await Assignment.create({
      event,
      assignee,
      assignedBy: req.user.id,
      role,
      responsibilities,
      priority: priority || 'medium',
      schedule,
      status: 'pending',
      metadata: {
        assignmentMethod: 'manual',
        revision: 1
      }
    });

    // Assign equipment if specified
    if (equipmentAssigned && equipmentAssigned.length > 0) {
      for (const equipment of equipmentAssigned) {
        const resource = await Resource.findById(equipment.resource);
        if (resource) {
          assignment.equipmentAssigned.push({
            resource: resource._id,
            checkOutTime: new Date(),
            condition: equipment.condition || 'good'
          });

          // Update resource status
          resource.availabilityStatus = 'assigned';
          resource.assignedEvent = event;
          resource.assignedTo = assignee;
          await resource.save();
        }
      }
    }

    // Assign vehicle if specified
    if (vehicleAssigned) {
      const vehicle = await Resource.findById(vehicleAssigned.resource);
      if (vehicle) {
        assignment.vehicleAssigned = {
          resource: vehicle._id,
          driver: vehicleAssigned.driver || assignee,
          checkOutTime: new Date(),
          mileageStart: vehicleAssigned.mileageStart || vehicle.operationalStatus?.mileage || 0
        };

        // Update vehicle status
        vehicle.availabilityStatus = 'assigned';
        vehicle.assignedEvent = event;
        vehicle.assignedTo = vehicleAssigned.driver || assignee;
        await vehicle.save();
      }
    }

    await assignment.save();

    // Add to event's assigned resources
    eventDoc.assignedResources.push({
      resource: assignee, // User as resource
      role,
      status: 'pending',
      assignedAt: new Date(),
      notes: `Assigned by ${req.user.fullName}`
    });
    await eventDoc.save();

    // Send notification to assignee
    await sendNotification({
      recipient: assignee,
      type: 'assignment_created',
      title: 'New Assignment',
      message: `You have been assigned to event: "${eventDoc.title}" as ${role}`,
      data: {
        assignmentId: assignment.assignmentId,
        eventId: eventDoc.eventId,
        eventTitle: eventDoc.title,
        startTime: schedule?.start || eventDoc.schedule.start,
        role,
        priority
      },
      channels: assigneeDoc.notificationPreferences || ['in_app', 'email', 'sms']
    });

    // Log audit
    await AuditLog.create({
      action: 'create',
      entity: 'assignment',
      entityId: assignment.assignmentId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        after: assignment.toObject(),
        event: eventDoc.title,
        assignee: assigneeDoc.fullName
      }
    });

    res.status(201).json({
      success: true,
      data: assignment,
      message: 'Assignment created successfully'
    });

  } catch (error) {
    logger.error('Create assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get all assignments
// @route   GET /api/assignments
// @access  Private
exports.getAssignments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      priority,
      assignee,
      event,
      startDate,
      endDate,
      search
    } = req.query;

    // Build query
    const query = {};

    // Role-based filtering
    if (req.user.role === 'reporter' || req.user.role === 'crew') {
      query.assignee = req.user.id;
    }

    // Filter by status
    if (status) {
      query.status = { $in: status.split(',') };
    }

    // Filter by priority
    if (priority) {
      query.priority = { $in: priority.split(',') };
    }

    // Filter by assignee
    if (assignee) {
      query.assignee = assignee;
    }

    // Filter by event
    if (event) {
      query.event = event;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Text search
    if (search) {
      query.$or = [
        { assignmentId: { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [assignments, total] = await Promise.all([
      Assignment.find(query)
        .populate('event', 'title eventId schedule location')
        .populate('assignee', 'firstName lastName email phone department position')
        .populate('assignedBy', 'firstName lastName')
        .populate('equipmentAssigned.resource', 'name type subType specifications')
        .populate('vehicleAssigned.resource', 'name type subType specifications')
        .populate('vehicleAssigned.driver', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Assignment.countDocuments(query)
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      data: assignments,
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
    logger.error('Get assignments error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get single assignment
// @route   GET /api/assignments/:id
// @access  Private
exports.getAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('event', 'title description eventId schedule location coverageRequest')
      .populate('assignee', 'firstName lastName email phone department position expertise languages')
      .populate('assignedBy', 'firstName lastName')
      .populate('equipmentAssigned.resource', 'name type subType specifications')
      .populate('vehicleAssigned.resource', 'name type subType specifications operationalStatus')
      .populate('vehicleAssigned.driver', 'firstName lastName')
      .populate('locationUpdates')
      .populate('progressUpdates')
      .populate('checklist.verifiedBy', 'firstName lastName');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    // Check authorization
    const isAssignee = assignment.assignee._id.toString() === req.user.id;
    const isAssignedBy = assignment.assignedBy._id.toString() === req.user.id;
    const isEditorOrAdmin = ['editor', 'admin'].includes(req.user.role);

    if (!isAssignee && !isAssignedBy && !isEditorOrAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this assignment'
      });
    }

    res.status(200).json({
      success: true,
      data: assignment
    });

  } catch (error) {
    logger.error('Get assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Update assignment
// @route   PUT /api/assignments/:id
// @access  Private (Assignee, Editor, Admin)
exports.updateAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    // Check authorization
    const isAssignee = assignment.assignee.toString() === req.user.id;
    const isEditorOrAdmin = ['editor', 'admin'].includes(req.user.role);

    if (!isAssignee && !isEditorOrAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this assignment'
      });
    }

    // Store old data for audit
    const oldData = { ...assignment.toObject() };

    const updates = {};
    const allowedFields = [
      'responsibilities', 'schedule', 'priority', 'checklist',
      'notes', 'attachments'
    ];

    // Filter allowed fields
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Update assignment
    Object.assign(assignment, updates);
    assignment.metadata.revision += 1;
    await assignment.save();

    // Log audit
    await AuditLog.create({
      action: 'update',
      entity: 'assignment',
      entityId: assignment.assignmentId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        before: oldData,
        after: assignment.toObject(),
        changes: this.calculateChanges(oldData, updates)
      }
    });

    res.status(200).json({
      success: true,
      data: assignment,
      message: 'Assignment updated successfully'
    });

  } catch (error) {
    logger.error('Update assignment error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Update assignment status
// @route   PUT /api/assignments/:id/status
// @access  Private (Assignee, Editor, Admin)
exports.updateAssignmentStatus = async (req, res) => {
  try {
    const { status, comments } = req.body;

    const assignment = await Assignment.findById(req.params.id)
      .populate('event', 'title eventId')
      .populate('assignee', 'firstName lastName')
      .populate('assignedBy', 'firstName lastName');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    // Check authorization
    const isAssignee = assignment.assignee._id.toString() === req.user.id;
    const isEditorOrAdmin = ['editor', 'admin'].includes(req.user.role);

    if (!isAssignee && !isEditorOrAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update assignment status'
      });
    }

    const oldStatus = assignment.status;
    assignment.status = status;

    // Update schedule timings based on status
    if (status === 'accepted' && !assignment.schedule.checkInTime) {
      assignment.schedule.checkInTime = new Date();
    } else if (status === 'in_progress' && !assignment.schedule.start) {
      assignment.schedule.start = new Date();
    } else if (status === 'completed' && !assignment.schedule.end) {
      assignment.schedule.end = new Date();
      assignment.schedule.checkOutTime = new Date();
      
      // Calculate actual hours
      if (assignment.schedule.start && assignment.schedule.end) {
        assignment.schedule.actualHours = 
          (assignment.schedule.end - assignment.schedule.start) / (1000 * 60 * 60);
      }
    }

    // Add note if comments provided
    if (comments) {
      assignment.notes.push({
        content: `Status changed to ${status}: ${comments}`,
        createdBy: req.user.id,
        createdAt: new Date(),
        type: 'status_update'
      });
    }

    await assignment.save();

    // Update event's assigned resources status
    const event = await Event.findById(assignment.event);
    if (event) {
      const resourceAssignment = event.assignedResources.find(
        a => a.resource.toString() === assignment.assignee._id.toString()
      );
      
      if (resourceAssignment) {
        resourceAssignment.status = 
          status === 'accepted' ? 'confirmed' :
          status === 'declined' ? 'declined' :
          status === 'in_progress' ? 'in_progress' :
          status === 'completed' ? 'completed' : 'pending';
        
        if (status === 'accepted') {
          resourceAssignment.confirmedAt = new Date();
        }
        
        await event.save();
      }
    }

    // Send notifications
    if (oldStatus !== status) {
      // Notify the person who assigned
      await sendNotification({
        recipient: assignment.assignedBy._id,
        type: 'assignment_updated',
        title: 'Assignment Status Updated',
        message: `${assignment.assignee.firstName} ${assignment.assignee.lastName} changed assignment status to ${status} for event "${assignment.event.title}"`,
        data: {
          assignmentId: assignment.assignmentId,
          oldStatus,
          newStatus: status,
          comments
        }
      });

      // If declined, notify editors for reassignment
      if (status === 'declined' && isAssignee) {
        const User = require('../models/user');
        const editors = await User.find({
          role: { $in: ['editor', 'admin'] },
          department: assignment.assignee.department,
          isActive: true
        }).select('_id');

        for (const editor of editors) {
          await sendNotification({
            recipient: editor._id,
            type: 'escalation',
            title: 'Assignment Declined - Needs Reassignment',
            message: `Assignment for event "${assignment.event.title}" was declined and needs reassignment`,
            data: {
              assignmentId: assignment.assignmentId,
              eventId: assignment.event.eventId,
              declinedBy: assignment.assignee.fullName,
              reason: comments
            },
            priority: 'high'
          });
        }
      }
    }

    // Send real-time update via Socket.IO
    if (global.io) {
      global.io.to(`assignment_${assignment._id}`).emit('assignmentStatusUpdate', {
        assignmentId: assignment.assignmentId,
        status,
        updatedBy: req.user.id,
        timestamp: new Date(),
        comments
      });

      // Also emit to event room
      global.io.to(`event_${assignment.event._id}`).emit('assignmentStatusChanged', {
        assignmentId: assignment.assignmentId,
        assignee: assignment.assignee.fullName,
        status,
        timestamp: new Date()
      });
    }

    // Log audit
    await AuditLog.create({
      action: 'update',
      entity: 'assignment',
      entityId: assignment.assignmentId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        field: 'status',
        oldValue: oldStatus,
        newValue: status,
        comments
      }
    });

    res.status(200).json({
      success: true,
      data: assignment,
      message: 'Assignment status updated successfully'
    });

  } catch (error) {
    logger.error('Update assignment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Add progress update to assignment
// @route   POST /api/assignments/:id/progress
// @access  Private (Assignee)
exports.addProgressUpdate = async (req, res) => {
  try {
    const { type, content, mediaUrl, isImportant } = req.body;

    const assignment = await Assignment.findById(req.params.id)
      .populate('event', 'title eventId')
      .populate('assignee', 'firstName lastName');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    // Check if user is the assignee
    if (assignment.assignee._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Only assignee can add progress updates'
      });
    }

    const progressUpdate = {
      type,
      content,
      mediaUrl,
      timestamp: new Date(),
      isImportant: isImportant || false
    };

    assignment.progressUpdates.push(progressUpdate);
    await assignment.save();

    // Send real-time update via Socket.IO
    if (global.io) {
      global.io.to(`assignment_${assignment._id}`).emit('progressUpdate', {
        assignmentId: assignment.assignmentId,
        update: progressUpdate,
        assignee: assignment.assignee.fullName
      });

      // Also emit to event room
      global.io.to(`event_${assignment.event._id}`).emit('assignmentProgress', {
        assignmentId: assignment.assignmentId,
        assignee: assignment.assignee.fullName,
        update: progressUpdate
      });
    }

    // Send notifications to editors if important
    if (isImportant) {
      const User = require('../models/user');
      const editors = await User.find({
        role: { $in: ['editor', 'admin'] },
        department: assignment.assignee.department,
        isActive: true
      }).select('_id');

      for (const editor of editors) {
        await sendNotification({
          recipient: editor._id,
          type: 'assignment_updated',
          title: 'Important Progress Update',
          message: `${assignment.assignee.firstName} posted an important update for assignment "${assignment.event.title}": ${content}`,
          data: {
            assignmentId: assignment.assignmentId,
            eventId: assignment.event.eventId,
            update: progressUpdate
          }
        });
      }
    }

    // Log audit
    await AuditLog.create({
      action: 'update',
      entity: 'assignment',
      entityId: assignment.assignmentId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        progressUpdate
      }
    });

    res.status(201).json({
      success: true,
      data: progressUpdate,
      message: 'Progress update added successfully'
    });

  } catch (error) {
    logger.error('Add progress update error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Update location for assignment
// @route   PUT /api/assignments/:id/location
// @access  Private (Assignee)
exports.updateLocation = async (req, res) => {
  try {
    const { coordinates, address, batteryLevel, networkStrength } = req.body;

    const assignment = await Assignment.findById(req.params.id)
      .populate('event', 'title eventId')
      .populate('assignee', 'firstName lastName');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    // Check if user is the assignee
    if (assignment.assignee._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Only assignee can update location'
      });
    }

    const locationUpdate = {
      coordinates,
      address,
      timestamp: new Date(),
      batteryLevel,
      networkStrength
    };

    assignment.locationUpdates.push(locationUpdate);
    
    // Keep only last 100 location updates
    if (assignment.locationUpdates.length > 100) {
      assignment.locationUpdates = assignment.locationUpdates.slice(-100);
    }
    
    await assignment.save();

    // Send real-time update via Socket.IO
    if (global.io) {
      global.io.to(`assignment_${assignment._id}`).emit('locationUpdate', {
        assignmentId: assignment.assignmentId,
        location: locationUpdate,
        assignee: assignment.assignee.fullName
      });

      // Also emit to event room
      global.io.to(`event_${assignment.event._id}`).emit('teamLocationUpdate', {
        assignmentId: assignment.assignmentId,
        assignee: assignment.assignee.fullName,
        location: locationUpdate
      });
    }

    // Log audit
    await AuditLog.create({
      action: 'update',
      entity: 'assignment',
      entityId: assignment.assignmentId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        locationUpdate
      }
    });

    res.status(200).json({
      success: true,
      data: locationUpdate,
      message: 'Location updated successfully'
    });

  } catch (error) {
    logger.error('Update location error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get assignment suggestions for event
// @route   GET /api/assignments/suggestions/:eventId
// @access  Private (Editor, Admin)
exports.getAssignmentSuggestions = async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId)
      .populate('coverageRequest', 'category location proposedDateTime');

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    const eventDetails = {
      category: event.coverageRequest?.category,
      location: event.location,
      startTime: event.schedule.start,
      priority: event.coverageRequest?.priority
    };

    // Get AI suggestions
    const suggestions = await suggestReporters(eventDetails);

    // Get equipment suggestions
    const Resource = require('../models/resource');
    const equipmentSuggestions = await Resource.find({
      type: 'equipment',
      availabilityStatus: 'available',
      subType: { $in: ['camera', 'microphone', 'lighting'] }
    }).limit(10);

    const vehicleSuggestions = await Resource.find({
      type: 'vehicle',
      availabilityStatus: 'available',
      'operationalStatus.fuelLevel': { $gt: 50 }
    }).limit(5);

    res.status(200).json({
      success: true,
      data: {
        reporters: suggestions,
        equipment: equipmentSuggestions,
        vehicles: vehicleSuggestions
      }
    });

  } catch (error) {
    logger.error('Get assignment suggestions error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get assignment statistics
// @route   GET /api/assignments/statistics
// @access  Private (Editor, Admin)
exports.getAssignmentStatistics = async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;

    const matchStage = {};
    
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const statistics = await Assignment.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'assignee',
          foreignField: '_id',
          as: 'assigneeInfo'
        }
      },
      { $unwind: '$assigneeInfo' },
      {
        $facet: {
          totalAssignments: [{ $count: 'count' }],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          byDepartment: [
            { 
              $group: { 
                _id: '$assigneeInfo.department', 
                count: { $sum: 1 },
                completed: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                }
              } 
            }
          ],
          byRole: [
            { $group: { _id: '$role', count: { $sum: 1 } } }
          ],
          topPerformers: [
            { $match: { status: 'completed' } },
            {
              $group: {
                _id: '$assignee',
                name: { $first: '$assigneeInfo.firstName' },
                lastName: { $first: '$assigneeInfo.lastName' },
                department: { $first: '$assigneeInfo.department' },
                completed: { $sum: 1 },
                averageHours: { $avg: '$schedule.actualHours' }
              }
            },
            { $sort: { completed: -1 } },
            { $limit: 10 }
          ],
          completionRate: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                completed: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                },
                inProgress: {
                  $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
                }
              }
            },
            {
              $project: {
                completionRate: {
                  $multiply: [
                    { $divide: ['$completed', '$total'] },
                    100
                  ]
                },
                total: 1,
                completed: 1,
                inProgress: 1,
                pending: { $subtract: ['$total', { $add: ['$completed', '$inProgress'] }] }
              }
            }
          ],
          averageResponseTime: [
            { $match: { status: { $in: ['completed', 'in_progress'] } } },
            {
              $addFields: {
                responseTime: {
                  $divide: [
                    { $subtract: ['$schedule.checkInTime', '$createdAt'] },
                    1000 * 60 * 60 // Convert to hours
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                avgResponseTime: { $avg: '$responseTime' },
                minResponseTime: { $min: '$responseTime' },
                maxResponseTime: { $max: '$responseTime' }
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
    logger.error('Get assignment statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Submit assignment feedback
// @route   POST /api/assignments/:id/feedback
// @access  Private
exports.submitFeedback = async (req, res) => {
  try {
    const { rating, comments, type = 'fromAssignee' } = req.body;

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    // Check authorization
    if (type === 'fromAssignee') {
      if (assignment.assignee.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Only assignee can submit feedback'
        });
      }
      
      assignment.feedback.fromAssignee = {
        rating,
        comments,
        submittedAt: new Date()
      };
    } else if (type === 'fromManager') {
      if (!['editor', 'admin'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: 'Only editors and admins can submit manager feedback'
        });
      }
      
      assignment.feedback.fromManager = {
        rating,
        comments,
        submittedAt: new Date(),
        submittedBy: req.user.id
      };
    }

    await assignment.save();

    // Calculate performance metrics if both feedbacks are submitted
    if (assignment.feedback.fromAssignee && assignment.feedback.fromManager) {
      assignment.performanceMetrics = {
        punctuality: this.calculatePunctuality(assignment),
        quality: (assignment.feedback.fromAssignee.rating + assignment.feedback.fromManager.rating) / 2,
        completeness: assignment.checklist.length > 0 ? 
          (assignment.checklist.filter(item => item.completed).length / assignment.checklist.length) * 100 : 100,
        collaboration: assignment.feedback.fromManager.rating,
        totalScore: this.calculateTotalScore(assignment)
      };
      
      await assignment.save();
    }

    // Log audit
    await AuditLog.create({
      action: 'update',
      entity: 'assignment',
      entityId: assignment.assignmentId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        feedbackType: type,
        rating,
        comments
      }
    });

    res.status(200).json({
      success: true,
      data: assignment.feedback,
      message: 'Feedback submitted successfully'
    });

  } catch (error) {
    logger.error('Submit feedback error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Helper function to calculate punctuality
exports.calculatePunctuality = (assignment) => {
  if (!assignment.schedule.start || !assignment.schedule.end) {
    return 100;
  }

  const event = assignment.event;
  if (!event || !event.schedule) {
    return 100;
  }

  const scheduledStart = new Date(event.schedule.start);
  const actualStart = new Date(assignment.schedule.start);
  
  const timeDifference = Math.abs(actualStart - scheduledStart);
  const hoursDifference = timeDifference / (1000 * 60 * 60);
  
  // Score based on punctuality (100 for on time, decreasing for delays)
  if (hoursDifference <= 0.5) return 100; // Within 30 minutes
  if (hoursDifference <= 1) return 90;   // Within 1 hour
  if (hoursDifference <= 2) return 80;   // Within 2 hours
  if (hoursDifference <= 4) return 60;   // Within 4 hours
  return 40;                             // More than 4 hours late
};

// Helper function to calculate total score
exports.calculateTotalScore = (assignment) => {
  const metrics = assignment.performanceMetrics;
  if (!metrics) return 0;
  
  return (
    metrics.punctuality * 0.3 +
    metrics.quality * 0.4 +
    metrics.completeness * 0.2 +
    metrics.collaboration * 0.1
  );
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
