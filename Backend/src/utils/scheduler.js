const cron = require('node-cron');
const Event = require('../models/Event');
const CoverageRequest = require('../models/CoverageRequest');
const Notification = require('../models/Notification');
const { sendNotification } = require('./notificationService');
const calendarService = require('./calendarService');
const logger = require('./logger');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  /**
   * Start all scheduled tasks
   */
  start() {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    try {
      // Schedule event reminders (every hour)
      this.scheduleEventReminders();
      
      // Schedule SLA alerts (every 30 minutes)
      this.scheduleSLAAlerts();
      
      // Schedule overdue request notifications (daily at 9 AM)
      this.scheduleOverdueNotifications();
      
      // Schedule report generation (daily at 6 AM)
      this.scheduleReportGeneration();
      
      // Schedule system health checks (every 10 minutes)
      this.scheduleHealthChecks();
      
      // Schedule database cleanup (daily at 2 AM)
      this.scheduleDatabaseCleanup();

      this.isRunning = true;
      logger.info('Scheduler service started successfully');
    } catch (error) {
      logger.error('Failed to start scheduler:', error);
      throw error;
    }
  }

  /**
   * Stop all scheduled tasks
   */
  stop() {
    for (const [name, job] of this.jobs) {
      job.stop();
      logger.info(`Stopped job: ${name}`);
    }
    
    this.jobs.clear();
    this.isRunning = false;
    logger.info('Scheduler service stopped');
  }

  /**
   * Schedule event reminders
   */
  scheduleEventReminders() {
    // Run every hour at minute 0
    const job = cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Running event reminder job...');
        
        // Send reminders for events starting in 24 hours
        await calendarService.sendEventReminders(24);
        
        // Send reminders for events starting in 1 hour
        await calendarService.sendEventReminders(1);
        
        logger.info('Event reminder job completed');
      } catch (error) {
        logger.error('Error in event reminder job:', error);
      }
    });

    this.jobs.set('event_reminders', job);
    logger.info('Scheduled event reminders');
  }

  /**
   * Schedule SLA alerts
   */
  scheduleSLAAlerts() {
    // Run every 30 minutes
    const job = cron.schedule('*/30 * * * *', async () => {
      try {
        logger.info('Running SLA alert job...');
        
        const now = new Date();
        const alertThreshold = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // 2 hours from now
        
        // Find coverage requests with approaching SLA deadlines
        const urgentRequests = await CoverageRequest.find({
          status: { $in: ['approved', 'scheduled', 'in_progress'] },
          slaDeadline: { 
            $lte: alertThreshold,
            $gt: now
          }
        }).populate('requester currentApprover');
        
        for (const request of urgentRequests) {
          const hoursLeft = (request.slaDeadline - now) / (1000 * 60 * 60);
          
          if (hoursLeft <= 2) {
            // Send critical alerts
            const recipients = [
              request.requester._id,
              request.currentApprover
            ].filter(Boolean);
            
            for (const recipient of recipients) {
              await sendNotification({
                recipient,
                type: 'sla_alert',
                title: 'Urgent: SLA Deadline Approaching',
                message: `Coverage request "${request.title}" has ${hoursLeft.toFixed(1)} hours remaining until SLA deadline`,
                data: {
                  requestId: request.requestId,
                  slaDeadline: request.slaDeadline,
                  hoursRemaining: hoursLeft,
                  priority: 'high'
                },
                priority: 'critical',
                channels: ['in_app', 'email', 'sms']
              });
            }
          }
        }
        
        logger.info(`SLA alert job completed. Found ${urgentRequests.length} urgent requests`);
      } catch (error) {
        logger.error('Error in SLA alert job:', error);
      }
    });

    this.jobs.set('sla_alerts', job);
    logger.info('Scheduled SLA alerts');
  }

  /**
   * Schedule overdue notifications
   */
  scheduleOverdueNotifications() {
    // Run daily at 9 AM
    const job = cron.schedule('0 9 * * *', async () => {
      try {
        logger.info('Running overdue notification job...');
        
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        // Find overdue approvals
        const overdueApprovals = await CoverageRequest.find({
          status: 'under_review',
          'approvalWorkflow.status': 'pending',
          'approvalWorkflow.dueDate': { $lt: new Date() }
        }).populate('approvalWorkflow.approver');
        
        for (const request of overdueApprovals) {
          const overdueApprovers = request.approvalWorkflow.filter(
            approval => approval.status === 'pending' && approval.dueDate < new Date()
          );
          
          for (const approval of overdueApprovers) {
            // Notify approver
            await sendNotification({
              recipient: approval.approver._id,
              type: 'escalation',
              title: 'Overdue Approval Required',
              message: `Approval for "${request.title}" is overdue by ${Math.ceil((new Date() - approval.dueDate) / (1000 * 60 * 60 * 24))} days`,
              data: {
                requestId: request.requestId,
                dueDate: approval.dueDate,
                daysOverdue: Math.ceil((new Date() - approval.dueDate) / (1000 * 60 * 60 * 24))
              },
              priority: 'high'
            });
            
            // Escalate to supervisor if overdue by more than 2 days
            if ((new Date() - approval.dueDate) > 2 * 24 * 60 * 60 * 1000) {
              // TODO: Get supervisor from user hierarchy
              logger.warn(`Approval for request ${request.requestId} overdue by more than 2 days, needs escalation`);
            }
          }
        }
        
        // Find overdue assignments
        const overdueAssignments = await Event.find({
          status: { $in: ['scheduled', 'in_progress'] },
          'schedule.end': { $lt: new Date() }
        }).populate('assignedResources.resource.assignedTo');
        
        for (const event of overdueAssignments) {
          const assignedUsers = event.assignedResources
            .map(allocation => allocation.resource?.assignedTo)
            .filter(Boolean);
          
          for (const user of assignedUsers) {
            await sendNotification({
              recipient: user._id,
              type: 'escalation',
              title: 'Overdue Assignment',
              message: `Assignment for event "${event.title}" is overdue`,
              data: {
                eventId: event.eventId,
                scheduledEnd: event.schedule.end
              },
              priority: 'medium'
            });
          }
        }
        
        logger.info(`Overdue notification job completed. Found ${overdueApprovals.length} overdue approvals and ${overdueAssignments.length} overdue assignments`);
      } catch (error) {
        logger.error('Error in overdue notification job:', error);
      }
    });

    this.jobs.set('overdue_notifications', job);
    logger.info('Scheduled overdue notifications');
  }

  /**
   * Schedule report generation
   */
  scheduleReportGeneration() {
    // Run daily at 6 AM
    const job = cron.schedule('0 6 * * *', async () => {
      try {
        logger.info('Running scheduled report generation...');
        
        // Generate daily coverage report
        // This would call your report generation service
        // await reportService.generateDailyReport();
        
        logger.info('Scheduled report generation completed');
      } catch (error) {
        logger.error('Error in scheduled report generation:', error);
      }
    });

    this.jobs.set('report_generation', job);
    logger.info('Scheduled report generation');
  }

  /**
   * Schedule system health checks
   */
  scheduleHealthChecks() {
    // Run every 10 minutes
    const job = cron.schedule('*/10 * * * *', async () => {
      try {
        logger.info('Running system health check...');
        
        const healthCheck = {
          timestamp: new Date(),
          database: await this.checkDatabaseHealth(),
          diskSpace: await this.checkDiskSpace(),
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime(),
          activeUsers: await this.getActiveUserCount(),
          pendingNotifications: await Notification.countDocuments({ status: 'pending' }),
          pendingRequests: await CoverageRequest.countDocuments({ status: 'under_review' })
        };
        
        // Log health status
        logger.info('System health check:', healthCheck);
        
        // Send alert if any critical issues
        if (!healthCheck.database.connected || healthCheck.diskSpace.percent > 90) {
          await this.sendSystemAlert(healthCheck);
        }
        
      } catch (error) {
        logger.error('Error in system health check:', error);
      }
    });

    this.jobs.set('health_checks', job);
    logger.info('Scheduled system health checks');
  }

  /**
   * Schedule database cleanup
   */
  scheduleDatabaseCleanup() {
    // Run daily at 2 AM
    const job = cron.schedule('0 2 * * *', async () => {
      try {
        logger.info('Running database cleanup...');
        
        const cleanupThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
        
        // Clean up old notifications (keep for 30 days)
        const deletedNotifications = await Notification.deleteMany({
          createdAt: { $lt: cleanupThreshold },
          status: { $in: ['read', 'sent'] }
        });
        
        // Archive old completed events (older than 90 days)
        const archivedEvents = await Event.updateMany(
          {
            status: 'completed',
            updatedAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
          },
          {
            $set: { isArchived: true }
          }
        );
        
        logger.info(`Database cleanup completed. Deleted ${deletedNotifications.deletedCount} notifications, archived ${archivedEvents.modifiedCount} events`);
      } catch (error) {
        logger.error('Error in database cleanup:', error);
      }
    });

    this.jobs.set('database_cleanup', job);
    logger.info('Scheduled database cleanup');
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth() {
    try {
      // Simple database connection check
      const Event = require('../models/Event');
      await Event.findOne().limit(1);
      
      return {
        connected: true,
        responseTime: Date.now() // You can add actual timing logic
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Check disk space (simplified)
   */
  async checkDiskSpace() {
    // This is a simplified example
    // In production, use a proper disk space checking library
    return {
      percent: 75, // Example value
      free: '50GB',
      total: '200GB'
    };
  }

  /**
   * Get active user count (last 24 hours)
   */
  async getActiveUserCount() {
    const User = require('../models/user');
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return await User.countDocuments({
      lastLogin: { $gte: last24Hours }
    });
  }

  /**
   * Send system alert
   */
  async sendSystemAlert(healthCheck) {
    // Get system administrators
    const User = require('../models/user');
    const admins = await User.find({ role: 'admin', isActive: true });
    
    for (const admin of admins) {
      await sendNotification({
        recipient: admin._id,
        type: 'system_alert',
        title: 'System Health Alert',
        message: `System health check detected issues: ${JSON.stringify(healthCheck)}`,
        data: healthCheck,
        priority: 'high',
        channels: ['email', 'in_app']
      });
    }
  }

  /**
   * Schedule one-time task
   */
  scheduleTask(name, date, task) {
    const now = new Date();
    const delay = date.getTime() - now.getTime();
    
    if (delay <= 0) {
      logger.warn(`Cannot schedule task ${name} in the past`);
      return;
    }
    
    const timeout = setTimeout(async () => {
      try {
        logger.info(`Running scheduled task: ${name}`);
        await task();
        logger.info(`Completed scheduled task: ${name}`);
      } catch (error) {
        logger.error(`Error in scheduled task ${name}:`, error);
      } finally {
        this.jobs.delete(name);
      }
    }, delay);
    
    this.jobs.set(name, { clear: () => clearTimeout(timeout) });
    logger.info(`Scheduled one-time task: ${name} for ${date}`);
  }

  /**
   * Cancel scheduled task
   */
  cancelTask(name) {
    const job = this.jobs.get(name);
    if (job) {
      if (job.clear) job.clear();
      if (job.stop) job.stop();
      this.jobs.delete(name);
      logger.info(`Cancelled task: ${name}`);
      return true;
    }
    return false;
  }

  /**
   * List all scheduled jobs
   */
  listJobs() {
    return Array.from(this.jobs.keys());
  }
}

module.exports = new SchedulerService();