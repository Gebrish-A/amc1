const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const Request = require('../models/request');
const Notification = require('../models/notification');
// const User = require('../models/user');

// Get all requests (with filters)
router.get('/', auth, async (req, res) => {
  try {
    const { status, category, priority, requester, startDate, endDate, page = 1, limit = 100 } = req.query;
    const filter = {};

    // Validate and apply filters
    if (status && ['draft', 'pending-approval', 'pending-revision', 'approved', 'rejected', 'assigned', 'in-progress', 'completed', 'archived'].includes(status)) {
      filter.status = status;
    }
    
    if (category) filter.category = category;
    if (priority && ['low', 'medium', 'high', 'critical'].includes(priority)) {
      filter.priority = priority;
    }
    if (requester && /^[0-9a-fA-F]{24}$/.test(requester)) {
      filter.requester = requester;
    }
    
    // Date filtering with proper validation
    if (startDate || endDate) {
      filter.dateTime = {};
      if (startDate && !isNaN(Date.parse(startDate))) {
        filter.dateTime.$gte = new Date(startDate);
      }
      if (endDate && !isNaN(Date.parse(endDate))) {
        filter.dateTime.$lte = new Date(endDate);
      }
      // If only startDate or endDate is provided but the other isn't valid
      if (Object.keys(filter.dateTime).length === 0) {
        delete filter.dateTime;
      }
    }

    // Role-based filtering
    if (req.user.role === 'requester') {
      filter.requester = req.user._id;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const requests = await Request.find(filter)
      .populate('requester', 'firstName lastName email')
      .populate('editor', 'firstName lastName email')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Request.countDocuments(filter);

    res.json({
      success: true,
      count: requests.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: requests
    });
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch requests',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get single request
router.get('/:id', auth, async (req, res) => {
  try {
    // Validate request ID
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID format'
      });
    }

    const request = await Request.findById(req.params.id)
      .populate('requester', 'firstName lastName email phone department')
      .populate('editor', 'firstName lastName email department')
      .populate('comments.user', 'firstName lastName avatar');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check permissions
    const canView = 
      req.user.role === 'admin' ||
      req.user.role === 'manager' ||
      req.user.role === 'editor' ||
      request.requester._id.toString() === req.user._id.toString() ||
      (request.assignedTo && request.assignedTo.toString() === req.user._id.toString());

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this request'
      });
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    console.error('Error fetching request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Create new request
router.post('/', auth, authorize('requester', 'editor', 'manager'), async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = ['title', 'description', 'category', 'dateTime'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const requestData = {
      ...req.body,
      requester: req.user._id,
      status: req.body.saveAsDraft ? 'draft' : 'pending-approval'
    };

    const request = new Request(requestData);
    await request.save();

    // Populate requester info for response
    await request.populate('requester', 'firstName lastName email');

    // Notify approvers if not a draft
    if (request.status === 'pending-approval') {
      try {
        const approvers = await User.find({
          role: { $in: ['editor', 'manager'] },
          department: request.category
        });

        const notifications = approvers.map(approver => 
          new Notification({
            userId: approver._id,
            title: 'New Coverage Request',
            message: `New request "${request.title}" requires your approval`,
            type: 'request',
            category: 'info',
            relatedEntity: {
              entityType: 'request',
              entityId: request._id
            },
            actionUrl: `/dashboard/requests/${request._id}`
          })
        );

        // Save all notifications in parallel
        await Promise.all(notifications.map(notification => notification.save()));
        
        // Emit socket notifications if available
        if (req.app.get('io')) {
          const io = req.app.get('io');
          notifications.forEach(notification => {
            io.to(`user-${notification.userId}`).emit('notification', {
              id: notification._id,
              title: notification.title,
              message: notification.message,
              type: notification.type,
              actionUrl: notification.actionUrl,
              createdAt: notification.createdAt
            });
          });
        }
      } catch (notificationError) {
        console.error('Failed to send notifications:', notificationError);
        // Don't fail the request creation if notifications fail
      }
    }

    res.status(201).json({
      success: true,
      message: request.status === 'draft' ? 'Request saved as draft' : 'Request submitted for approval',
      data: request
    });
  } catch (error) {
    console.error('Error creating request:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update request
router.put('/:id', auth, async (req, res) => {
  try {
    // Validate request ID
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID format'
      });
    }

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check permissions
    const canEdit = 
      req.user.role === 'admin' ||
      req.user.role === 'manager' ||
      (req.user.role === 'editor' && ['pending-approval', 'pending-revision'].includes(request.status)) ||
      (req.user.role === 'requester' && request.requester.toString() === req.user._id.toString() && ['draft', 'pending-revision'].includes(request.status));

    if (!canEdit) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to edit this request'
      });
    }

    // Prevent certain fields from being modified
    const restrictedFields = ['_id', 'requester', 'createdAt', 'approvalDate'];
    restrictedFields.forEach(field => {
      if (req.body[field]) {
        delete req.body[field];
      }
    });

    // If requester is updating from draft to pending-approval
    if (req.user.role === 'requester' && 
        request.status === 'draft' && 
        req.body.status === 'pending-approval') {
      req.body.status = 'pending-approval';
    }

    Object.assign(request, req.body);
    await request.save();

    // Populate fields for response
    await request.populate('requester', 'firstName lastName email');

    res.json({
      success: true,
      message: 'Request updated successfully',
      data: request
    });
  } catch (error) {
    console.error('Error updating request:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Submit request for approval
router.post('/:id/submit', auth, authorize('requester'), async (req, res) => {
  try {
    // Validate request ID
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID format'
      });
    }

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check permissions
    if (request.requester.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only submit your own requests'
      });
    }

    // Check if request can be submitted
    if (request.status !== 'draft' && request.status !== 'pending-revision') {
      return res.status(400).json({
        success: false,
        message: `Cannot submit request with status: ${request.status}`
      });
    }

    request.status = 'pending-approval';
    request.submittedAt = new Date();
    await request.save();

    // Notify approvers
    try {
      const approvers = await User.find({
        role: { $in: ['editor', 'manager'] },
        department: request.category
      });

      const notifications = approvers.map(approver => 
        new Notification({
          userId: approver._id,
          title: 'Request Submitted for Approval',
          message: `Request "${request.title}" has been submitted for approval`,
          type: 'approval',
          category: 'info',
          relatedEntity: {
            entityType: 'request',
            entityId: request._id
          },
          actionUrl: `/dashboard/requests/${request._id}`
        })
      );

      await Promise.all(notifications.map(notification => notification.save()));
      
      // Emit socket notifications if available
      if (req.app.get('io')) {
        const io = req.app.get('io');
        notifications.forEach(notification => {
          io.to(`user-${notification.userId}`).emit('notification', {
            id: notification._id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            actionUrl: notification.actionUrl,
            createdAt: notification.createdAt
          });
        });
      }
    } catch (notificationError) {
      console.error('Failed to send notifications:', notificationError);
      // Continue even if notifications fail
    }

    res.json({
      success: true,
      message: 'Request submitted for approval',
      data: request
    });
  } catch (error) {
    console.error('Error submitting request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Approve/Reject request
router.post('/:id/approve', auth, authorize('editor', 'manager'), async (req, res) => {
  try {
    const { action, notes } = req.body;
    
    // Validate input
    if (!['approve', 'reject', 'revision'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "approve", "reject", or "revision"'
      });
    }

    // Validate request ID
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID format'
      });
    }

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    if (request.status !== 'pending-approval') {
      return res.status(400).json({
        success: false,
        message: `Cannot ${action} request with status: ${request.status}`
      });
    }

    // Update request based on action
    if (action === 'approve') {
      request.status = 'approved';
      request.approvalDate = new Date();
      request.editor = req.user._id;
      request.approvalNotes = notes;
    } else if (action === 'reject') {
      request.status = 'rejected';
      request.rejectionReason = notes;
      request.editor = req.user._id;
      request.rejectionDate = new Date();
    } else if (action === 'revision') {
      request.status = 'pending-revision';
      request.revisionNotes = notes;
      request.editor = req.user._id;
    }

    await request.save();

    // Populate requester for notification
    await request.populate('requester', 'firstName lastName email');

    // Create notification for requester
    try {
      const notification = new Notification({
        userId: request.requester._id,
        title: `Request ${action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Needs Revision'}`,
        message: `Your request "${request.title}" has been ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'marked for revision'}`,
        type: 'approval',
        category: action === 'approve' ? 'success' : action === 'reject' ? 'error' : 'warning',
        relatedEntity: {
          entityType: 'request',
          entityId: request._id
        },
        actionUrl: `/dashboard/requests/${request._id}`
      });
      
      await notification.save();
      
      // Emit socket notification if available
      if (req.app.get('io')) {
        const io = req.app.get('io');
        io.to(`user-${request.requester._id}`).emit('notification', {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          category: notification.category,
          actionUrl: notification.actionUrl,
          createdAt: notification.createdAt
        });
      }
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
      // Continue even if notification fails
    }

    res.json({
      success: true,
      message: `Request ${action} successfully`,
      data: request
    });
  } catch (error) {
    console.error('Error processing approval:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process approval',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Add comment to request
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { text } = req.body;
    
    // Validate comment text
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment text is required'
      });
    }

    // Validate request ID
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID format'
      });
    }

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check if user has permission to comment
    const canComment = 
      req.user.role === 'admin' ||
      req.user.role === 'manager' ||
      req.user.role === 'editor' ||
      request.requester.toString() === req.user._id.toString() ||
      (request.assignedTo && request.assignedTo.toString() === req.user._id.toString());

    if (!canComment) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to comment on this request'
      });
    }

    const comment = {
      user: req.user._id,
      text: text.trim(),
      createdAt: new Date()
    };

    request.comments.push(comment);
    await request.save();

    // Populate request for notification
    await request.populate('requester', 'firstName lastName')
                .populate('editor', 'firstName lastName');

    // Notify other participants
    try {
      const participants = new Set();
      
      // Add requester
      if (request.requester) {
        participants.add(request.requester._id.toString());
      }
      
      // Add editor if exists
      if (request.editor) {
        participants.add(request.editor._id.toString());
      }
      
      // Add all commenters
      request.comments.forEach(c => {
        if (c.user && c.user._id) {
          participants.add(c.user._id.toString());
        }
      });
      
      // Remove current user
      participants.delete(req.user._id.toString());
      
      // Create notifications for all participants
      const notifications = Array.from(participants).map(participantId => 
        new Notification({
          userId: participantId,
          title: 'New Comment',
          message: `${req.user.firstName} ${req.user.lastName} commented on request "${request.title}"`,
          type: 'message',
          category: 'info',
          relatedEntity: {
            entityType: 'request',
            entityId: request._id
          },
          actionUrl: `/dashboard/requests/${request._id}`
        })
      );

      if (notifications.length > 0) {
        await Promise.all(notifications.map(notification => notification.save()));
        
        // Emit socket notifications if available
        if (req.app.get('io')) {
          const io = req.app.get('io');
          notifications.forEach(notification => {
            io.to(`user-${notification.userId}`).emit('notification', {
              id: notification._id,
              title: notification.title,
              message: notification.message,
              type: notification.type,
              actionUrl: notification.actionUrl,
              createdAt: notification.createdAt
            });
          });
        }
      }
    } catch (notificationError) {
      console.error('Failed to send comment notifications:', notificationError);
      // Continue even if notifications fail
    }

    // Populate user info in the response
    const populatedComment = {
      ...comment.toObject ? comment.toObject() : comment,
      user: {
        _id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        avatar: req.user.avatar
      }
    };

    res.json({
      success: true,
      message: 'Comment added successfully',
      data: populatedComment
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add comment',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get request statistics
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Filter based on user role
    const matchFilter = {
      createdAt: { $gte: thirtyDaysAgo }
    };

    if (req.user.role === 'requester') {
      matchFilter.requester = req.user._id;
    }

    const stats = await Request.aggregate([
      {
        $match: matchFilter
      },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
                pending: { $sum: { $cond: [{ $in: ['$status', ['pending-approval', 'pending-revision']] }, 1, 0] } },
                rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } }
              }
            }
          ],
          byCategory: [
            {
              $group: {
                _id: '$category',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } }
          ],
          byPriority: [
            {
              $group: {
                _id: '$priority',
                count: { $sum: 1 }
              }
            },
            { $sort: { count: -1 } }
          ],
          dailyTrend: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } },
            { $limit: 30 }
          ]
        }
      }
    ]);

    const result = {
      overview: stats[0]?.overview[0] || { 
        total: 0, 
        approved: 0, 
        pending: 0, 
        rejected: 0, 
        completed: 0, 
        draft: 0 
      },
      byCategory: stats[0]?.byCategory || [],
      byPriority: stats[0]?.byPriority || [],
      dailyTrend: stats[0]?.dailyTrend || []
    };

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete request (soft delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    // Validate request ID
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID format'
      });
    }

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check permissions
    const canDelete = 
      req.user.role === 'admin' ||
      (req.user.role === 'requester' && 
       request.requester.toString() === req.user._id.toString() && 
       request.status === 'draft');

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this request'
      });
    }

    // Soft delete - mark as archived
    request.status = 'archived';
    request.archivedAt = new Date();
    request.archivedBy = req.user._id;
    await request.save();

    res.json({
      success: true,
      message: 'Request archived successfully',
      data: request
    });
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update request status - Reporter submission specific
// Update request status (General endpoint)
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status, submittedAt } = req.body;
    
    // Validate status - UPDATED to include 'submitted' and match your enum
    const validStatuses = ['draft', 'pending', 'approved', 'rejected', 'in_progress', 'submitted', 'completed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Validate request ID
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID format'
      });
    }

    const request = await Request.findById(req.params.id);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check permissions based on user role
    const userRole = req.user.role;
    let canUpdate = false;
    let errorMessage = '';

    // Reporter specific logic
    if (userRole === 'reporter') {
      if (status === 'submitted') {
        // Check if reporter is assigned to this request
        if (!request.assignedReporter || 
            request.assignedReporter.reporterId.toString() !== req.user._id.toString()) {
          errorMessage = 'You are not assigned to this request';
        } 
        // Check if current status allows submission
        else if (request.status !== 'in_progress') {
          errorMessage = `Cannot submit request with current status: ${request.status}`;
        }
        else {
          canUpdate = true;
        }
      } else {
        errorMessage = 'Reporters can only change status to "submitted"';
      }
    } 
    // Other roles
    else if (userRole === 'admin' || userRole === 'manager') {
      canUpdate = true; // Admins and managers can change any status
    } 
    else if (userRole === 'editor') {
      if (['approved', 'rejected', 'completed'].includes(status)) {
        canUpdate = true;
      } else {
        errorMessage = 'Editors can only change status to approved, rejected, or completed';
      }
    }
    else if (userRole === 'requester') {
      if (status === 'pending' && 
          request.status === 'draft' &&
          request.requester.toString() === req.user._id.toString()) {
        canUpdate = true;
      } else {
        errorMessage = 'You can only submit your own draft requests';
      }
    }

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: errorMessage || 'You do not have permission to update this request status'
      });
    }

    // Update status and handle related fields
    const oldStatus = request.status;
    request.status = status;
    
    // Set timestamps based on status
    if (status === 'submitted') {
      request.submittedAt = submittedAt ? new Date(submittedAt) : new Date();
      request.reporterSubmittedAt = new Date();
      
      // Ensure progress is marked as ready
      if (request.progress !== 'ready') {
        request.progress = 'ready';
      }
    } 
    else if (status === 'completed') {
      request.completedAt = new Date();
    } 
    else if (status === 'approved') {
      request.approvalDate = new Date();
      if (userRole === 'editor') {
        request.editor = req.user._id;
      }
    }
    else if (status === 'rejected') {
      request.rejectionDate = new Date();
      if (userRole === 'editor') {
        request.editor = req.user._id;
      }
    }
    else if (status === 'in_progress' && oldStatus === 'approved') {
      request.acceptedAt = new Date();
    }
    
    request.lastUpdated = new Date();
    await request.save();

    // Populate for response
    await request.populate('requester', 'firstName lastName email')
                .populate('editor', 'firstName lastName email');

    // Send notifications based on status change
    try {
      await sendStatusChangeNotifications(request, oldStatus, req.user, req.app.get('io'));
    } catch (notificationError) {
      console.error('Failed to send notifications:', notificationError);
      // Don't fail the request if notifications fail
    }

    res.json({
      success: true,
      message: `Status updated to ${status} successfully`,
      data: request
    });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Helper function for sending notifications
async function sendStatusChangeNotifications(request, oldStatus, user, io) {
  try {
    let title = '';
    let message = '';
    let recipients = [];
    let category = 'info';
    
    const userName = `${user.firstName} ${user.lastName}`;
    
    // Determine notification based on status change
    switch (request.status) {
      case 'submitted':
        title = 'Assignment Submitted for Review';
        message = `${userName} has submitted assignment "${request.title}" for review`;
        category = 'info';
        
        // Notify editor (if assigned) or all editors
        if (request.editor) {
          recipients.push(request.editor);
        } else {
          // Find editors in the same category
          const editors = await User.find({
            role: 'editor',
            department: request.category
          });
          recipients.push(...editors.map(e => e._id));
        }
        break;
        
      case 'completed':
        title = 'Assignment Completed';
        message = `${userName} has marked assignment "${request.title}" as completed`;
        category = 'success';
        
        // Notify editor and requester
        if (request.editor) recipients.push(request.editor);
        if (request.requester) recipients.push(request.requester._id);
        break;
        
      case 'approved':
        title = 'Request Approved';
        message = `${userName} has approved request "${request.title}"`;
        category = 'success';
        
        // Notify requester
        if (request.requester) recipients.push(request.requester._id);
        break;
        
      case 'rejected':
        title = 'Request Rejected';
        message = `${userName} has rejected request "${request.title}"`;
        category = 'error';
        
        // Notify requester
        if (request.requester) recipients.push(request.requester._id);
        break;
        
      case 'in_progress':
        if (oldStatus === 'approved') {
          title = 'Reporter Assigned';
          message = `${userName} has accepted assignment "${request.title}"`;
          category = 'info';
          
          // Notify editor
          if (request.editor) recipients.push(request.editor);
        }
        break;
    }
    
    // Create and send notifications to all recipients
    if (recipients.length > 0 && title && message) {
      const notifications = recipients.map(recipientId => 
        new Notification({
          userId: recipientId,
          title,
          message,
          type: 'status-change',
          category: category,
          relatedEntity: {
            entityType: 'request',
            entityId: request._id
          },
          actionUrl: `/dashboard/requests/${request._id}`
        })
      );
      
      // Save notifications
      await Promise.all(notifications.map(n => n.save()));
      
      // Send socket notifications if available
      if (io) {
        notifications.forEach(notification => {
          io.to(`user-${notification.userId}`).emit('notification', {
            id: notification._id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            category: notification.category,
            actionUrl: notification.actionUrl,
            createdAt: notification.createdAt
          });
        });
      }
    }
  } catch (error) {
    console.error('Error in sendStatusChangeNotifications:', error);
    // Silently fail - notifications shouldn't break the main request
  }
}
module.exports = router;