const Notification = require('../models/notification');
const User = require('../models/user');
const { sendNotification } = require('../utils/notificationService');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      priority,
      category,
      unreadOnly = false,
      startDate,
      endDate
    } = req.query;

    // Build query
    const query = { recipient: req.user.id };

    // Filter by type
    if (type) {
      query.type = { $in: type.split(',') };
    }

    // Filter by status
    if (status) {
      query.status = { $in: status.split(',') };
    } else if (unreadOnly === 'true') {
      query.readAt = { $exists: false };
    }

    // Filter by priority
    if (priority) {
      query.priority = { $in: priority.split(',') };
    }

    // Filter by category
    if (category) {
      query.category = { $in: category.split(',') };
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({
        recipient: req.user.id,
        readAt: { $exists: false }
      })
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
        total
      },
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
    logger.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    // Check if already read
    if (notification.readAt) {
      return res.status(200).json({
        success: true,
        message: 'Notification already marked as read',
        data: notification
      });
    }

    // Mark as read
    notification.readAt = new Date();
    notification.deliveryStatus.inApp.read = true;
    notification.deliveryStatus.inApp.readAt = new Date();
    
    await notification.save();

    // Log audit
    await AuditLog.create({
      action: 'read',
      entity: 'notification',
      entityId: notification.notificationId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        notificationType: notification.type,
        title: notification.title
      }
    });

    res.status(200).json({
      success: true,
      data: notification,
      message: 'Notification marked as read'
    });

  } catch (error) {
    logger.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        recipient: req.user.id,
        readAt: { $exists: false }
      },
      {
        $set: {
          readAt: new Date(),
          'deliveryStatus.inApp.read': true,
          'deliveryStatus.inApp.readAt': new Date()
        }
      }
    );

    // Log audit
    await AuditLog.create({
      action: 'read',
      entity: 'notification',
      entityId: 'batch_read',
      user: req.user.id,
      userRole: req.user.role,
      details: {
        modifiedCount: result.modifiedCount
      }
    });

    res.status(200).json({
      success: true,
      data: {
        modifiedCount: result.modifiedCount
      },
      message: `${result.modifiedCount} notifications marked as read`
    });

  } catch (error) {
    logger.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }

    // Store data for audit before deletion
    const notificationData = notification.toObject();

    // Delete notification
    await notification.deleteOne();

    // Log audit
    await AuditLog.create({
      action: 'delete',
      entity: 'notification',
      entityId: notificationData.notificationId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        before: notificationData
      }
    });

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    logger.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Clear all notifications
// @route   DELETE /api/notifications/clear-all
// @access  Private
exports.clearAllNotifications = async (req, res) => {
  try {
    const query = { recipient: req.user.id };

    // Optional: filter by read status
    if (req.query.read === 'true') {
      query.readAt = { $exists: true };
    } else if (req.query.read === 'false') {
      query.readAt = { $exists: false };
    }

    const result = await Notification.deleteMany(query);

    // Log audit
    await AuditLog.create({
      action: 'delete',
      entity: 'notification',
      entityId: 'batch_delete',
      user: req.user.id,
      userRole: req.user.role,
      details: {
        deletedCount: result.deletedCount,
        filter: req.query.read
      }
    });

    res.status(200).json({
      success: true,
      data: {
        deletedCount: result.deletedCount
      },
      message: `${result.deletedCount} notifications cleared`
    });

  } catch (error) {
    logger.error('Clear all notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get notification preferences
// @route   GET /api/notifications/preferences
// @access  Private
exports.getPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notificationPreferences');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Default preferences if not set
    const defaultPreferences = {
      email: true,
      sms: true,
      push: true,
      inApp: true
    };

    const preferences = user.notificationPreferences || defaultPreferences;

    res.status(200).json({
      success: true,
      data: preferences
    });

  } catch (error) {
    logger.error('Get notification preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Update notification preferences
// @route   PUT /api/notifications/preferences
// @access  Private
exports.updatePreferences = async (req, res) => {
  try {
    const { email, sms, push, inApp } = req.body;

    const updates = {};
    if (email !== undefined) updates['notificationPreferences.email'] = email;
    if (sms !== undefined) updates['notificationPreferences.sms'] = sms;
    if (push !== undefined) updates['notificationPreferences.push'] = push;
    if (inApp !== undefined) updates['notificationPreferences.inApp'] = inApp;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('notificationPreferences');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Log audit
    await AuditLog.create({
      action: 'update',
      entity: 'user',
      entityId: user._id,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        field: 'notificationPreferences',
        newValue: user.notificationPreferences
      }
    });

    res.status(200).json({
      success: true,
      data: user.notificationPreferences,
      message: 'Notification preferences updated successfully'
    });

  } catch (error) {
    logger.error('Update notification preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Test notification
// @route   POST /api/notifications/test
// @access  Private (Admin, Editor)
exports.testNotification = async (req, res) => {
  try {
    // Only admins and editors can send test notifications
    if (!['admin', 'editor'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to send test notifications'
      });
    }

    const { type, channels = ['in_app'] } = req.body;

    // Send test notification to self
    const notification = await sendNotification({
      recipient: req.user.id,
      type: type || 'system_alert',
      title: 'Test Notification',
      message: 'This is a test notification from the Media Coverage Management System.',
      data: {
        test: true,
        timestamp: new Date().toISOString(),
        userId: req.user.id
      },
      channels,
      priority: 'low'
    });

    res.status(200).json({
      success: true,
      data: notification,
      message: 'Test notification sent successfully'
    });

  } catch (error) {
    logger.error('Test notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get notification statistics
// @route   GET /api/notifications/statistics
// @access  Private (Admin, Editor)
exports.getNotificationStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {};
    
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const statistics = await Notification.aggregate([
      { $match: matchStage },
      {
        $facet: {
          totalNotifications: [{ $count: 'count' }],
          byType: [
            { $group: { _id: '$type', count: { $sum: 1 } } }
          ],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          byPriority: [
            { $group: { _id: '$priority', count: { $sum: 1 } } }
          ],
          deliveryStats: [
            {
              $project: {
                emailSent: { $cond: [{ $in: ['email', '$channels'] }, 1, 0] },
                emailDelivered: { $cond: [{ $eq: ['$deliveryStatus.email.delivered', true] }, 1, 0] },
                smsSent: { $cond: [{ $in: ['sms', '$channels'] }, 1, 0] },
                smsDelivered: { $cond: [{ $eq: ['$deliveryStatus.sms.delivered', true] }, 1, 0] },
                inAppSent: { $cond: [{ $in: ['in_app', '$channels'] }, 1, 0] },
                inAppDelivered: { $cond: [{ $eq: ['$deliveryStatus.inApp.delivered', true] }, 1, 0] }
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                emailSent: { $sum: '$emailSent' },
                emailDelivered: { $sum: '$emailDelivered' },
                smsSent: { $sum: '$smsSent' },
                smsDelivered: { $sum: '$smsDelivered' },
                inAppSent: { $sum: '$inAppSent' },
                inAppDelivered: { $sum: '$inAppDelivered' }
              }
            },
            {
              $project: {
                emailDeliveryRate: {
                  $cond: [
                    { $eq: ['$emailSent', 0] },
                    0,
                    { $multiply: [{ $divide: ['$emailDelivered', '$emailSent'] }, 100] }
                  ]
                },
                smsDeliveryRate: {
                  $cond: [
                    { $eq: ['$smsSent', 0] },
                    0,
                    { $multiply: [{ $divide: ['$smsDelivered', '$smsSent'] }, 100] }
                  ]
                },
                inAppDeliveryRate: {
                  $cond: [
                    { $eq: ['$inAppSent', 0] },
                    0,
                    { $multiply: [{ $divide: ['$inAppDelivered', '$inAppSent'] }, 100] }
                  ]
                },
                total: 1,
                emailSent: 1,
                emailDelivered: 1,
                smsSent: 1,
                smsDelivered: 1,
                inAppSent: 1,
                inAppDelivered: 1
              }
            }
          ],
          dailyTrend: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 },
                readCount: {
                  $sum: { $cond: [{ $ifNull: ['$readAt', false] }, 1, 0] }
                }
              }
            },
            { $sort: { _id: 1 } }
          ],
          topRecipients: [
            {
              $lookup: {
                from: 'users',
                localField: 'recipient',
                foreignField: '_id',
                as: 'recipientInfo'
              }
            },
            { $unwind: '$recipientInfo' },
            {
              $group: {
                _id: '$recipient',
                name: { $first: '$recipientInfo.firstName' },
                lastName: { $first: '$recipientInfo.lastName' },
                department: { $first: '$recipientInfo.department' },
                notificationCount: { $sum: 1 },
                readCount: {
                  $sum: { $cond: [{ $ifNull: ['$readAt', false] }, 1, 0] }
                }
              }
            },
            { $sort: { notificationCount: -1 } },
            { $limit: 10 }
          ]
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: statistics[0]
    });

  } catch (error) {
    logger.error('Get notification statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Send custom notification
// @route   POST /api/notifications/send
// @access  Private (Admin)
exports.sendCustomNotification = async (req, res) => {
  try {
    // Only admins can send custom notifications
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can send custom notifications'
      });
    }

    const {
      recipients,
      title,
      message,
      type = 'system_alert',
      priority = 'medium',
      channels = ['in_app', 'email'],
      data
    } = req.body;

    // Validate required fields
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Recipients array is required'
      });
    }

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Title and message are required'
      });
    }

    // Send notifications to all recipients
    const notifications = [];
    const errors = [];

    for (const recipientId of recipients) {
      try {
        // Check if recipient exists
        const recipient = await User.findById(recipientId);
        if (!recipient || !recipient.isActive) {
          errors.push(`Recipient ${recipientId} not found or inactive`);
          continue;
        }

        const notification = await sendNotification({
          recipient: recipientId,
          type,
          title,
          message,
          data: {
            ...data,
            customNotification: true,
            sentBy: req.user.id,
            sentAt: new Date().toISOString()
          },
          channels: channels.filter(channel => 
            recipient.notificationPreferences?.[channel] !== false
          ),
          priority
        });

        notifications.push(notification);
      } catch (error) {
        errors.push(`Failed to send to ${recipientId}: ${error.message}`);
        logger.error(`Failed to send notification to ${recipientId}:`, error);
      }
    }

    // Log audit
    await AuditLog.create({
      action: 'create',
      entity: 'notification',
      entityId: 'custom_batch',
      user: req.user.id,
      userRole: req.user.role,
      details: {
        recipientCount: recipients.length,
        successfulCount: notifications.length,
        errorCount: errors.length,
        title,
        message,
        type,
        priority
      }
    });

    res.status(200).json({
      success: true,
      data: {
        sentCount: notifications.length,
        errorCount: errors.length,
        notifications: notifications.map(n => n.notificationId),
        errors: errors.length > 0 ? errors : undefined
      },
      message: `Notifications sent: ${notifications.length} successful, ${errors.length} failed`
    });

  } catch (error) {
    logger.error('Send custom notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};
