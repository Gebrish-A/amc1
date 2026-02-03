const { sendNotification } = require('./notificationService');
const User = require('../models/user');
const CoverageRequest = require('../models/CoverageRequest');
const Assignment = require('../models/assignment');
const Event = require('../models/Event');
const logger = require('./logger');

class EscalationService {
  constructor() {
    this.escalationLevels = {
      1: { delay: 2 * 60 * 60 * 1000, recipients: ['editor'] }, // 2 hours
      2: { delay: 4 * 60 * 60 * 1000, recipients: ['senior_editor'] }, // 4 hours
      3: { delay: 8 * 60 * 60 * 1000, recipients: ['department_head'] }, // 8 hours
      4: { delay: 24 * 60 * 60 * 1000, recipients: ['admin'] } // 24 hours
    };
  }

  /**
   * Check for overdue items and escalate
   */
  async checkAndEscalate() {
    try {
      logger.info('Starting escalation check...');
      
      const results = {
        coverageRequests: await this.escalateOverdueCoverageRequests(),
        assignments: await this.escalateOverdueAssignments(),
        events: await this.escalateOverdueEvents()
      };

      logger.info('Escalation check completed:', results);
      return results;
    } catch (error) {
      logger.error('Escalation check error:', error);
      throw error;
    }
  }

  /**
   * Escalate overdue coverage requests
   */
  async escalateOverdueCoverageRequests() {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find overdue approvals
    const overdueRequests = await CoverageRequest.find({
      status: 'under_review',
      'approvalWorkflow.status': 'pending',
      'approvalWorkflow.dueDate': { $lt: now }
    }).populate('approvalWorkflow.approver requester');

    let escalatedCount = 0;

    for (const request of overdueRequests) {
      const overdueApprovals = request.approvalWorkflow.filter(
        approval => approval.status === 'pending' && approval.dueDate < now
      );

      for (const approval of overdueApprovals) {
        const hoursOverdue = Math.floor((now - approval.dueDate) / (1000 * 60 * 60));
        const escalationLevel = this.getEscalationLevel(hoursOverdue);

        if (escalationLevel > 0) {
          await this.escalateCoverageRequest(request, approval, escalationLevel, hoursOverdue);
          escalatedCount++;
        }
      }
    }

    // Find requests stuck in draft for too long
    const staleDrafts = await CoverageRequest.find({
      status: 'draft',
      updatedAt: { $lt: oneDayAgo }
    }).populate('requester');

    for (const draft of staleDrafts) {
      await sendNotification({
        recipient: draft.requester._id,
        type: 'reminder',
        title: 'Draft Coverage Request',
        message: `Your draft coverage request "${draft.title}" has not been submitted in over 24 hours. Please submit or discard it.`,
        data: {
          requestId: draft.requestId,
          lastUpdated: draft.updatedAt
        }
      });
    }

    return {
      overdueRequests: overdueRequests.length,
      escalated: escalatedCount,
      staleDrafts: staleDrafts.length
    };
  }

  /**
   * Escalate overdue assignments
   */
  async escalateOverdueAssignments() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Find assignments that are past schedule but not completed
    const overdueAssignments = await Assignment.find({
      status: { $in: ['accepted', 'in_progress'] },
      'schedule.end': { $lt: now }
    }).populate('assignee assignedBy event');

    let escalatedCount = 0;

    for (const assignment of overdueAssignments) {
      const hoursOverdue = Math.floor((now - assignment.schedule.end) / (1000 * 60 * 60));
      const escalationLevel = this.getEscalationLevel(hoursOverdue);

      if (escalationLevel > 0) {
        await this.escalateAssignment(assignment, escalationLevel, hoursOverdue);
        escalatedCount++;
      }
    }

    // Find assignments not accepted in time
    const pendingAssignments = await Assignment.find({
      status: 'pending',
      createdAt: { $lt: oneHourAgo }
    }).populate('assignee assignedBy');

    for (const assignment of pendingAssignments) {
      await sendNotification({
        recipient: assignment.assignee._id,
        type: 'reminder',
        title: 'Pending Assignment',
        message: `You have a pending assignment that requires your response.`,
        data: {
          assignmentId: assignment.assignmentId,
          created: assignment.createdAt
        }
      });
    }

    return {
      overdueAssignments: overdueAssignments.length,
      escalated: escalatedCount,
      pendingReminders: pendingAssignments.length
    };
  }

  /**
   * Escalate overdue events
   */
  async escalateOverdueEvents() {
    const now = new Date();

    // Find events that are in progress past schedule
    const overdueEvents = await Event.find({
      status: 'in_progress',
      'schedule.end': { $lt: now }
    }).populate('coverageRequest assignedResources.resource.assignedTo');

    let escalatedCount = 0;

    for (const event of overdueEvents) {
      const hoursOverdue = Math.floor((now - event.schedule.end) / (1000 * 60 * 60));
      const escalationLevel = this.getEscalationLevel(hoursOverdue);

      if (escalationLevel > 0) {
        await this.escalateEvent(event, escalationLevel, hoursOverdue);
        escalatedCount++;
      }
    }

    return {
      overdueEvents: overdueEvents.length,
      escalated: escalatedCount
    };
  }

  /**
   * Escalate a coverage request
   */
  async escalateCoverageRequest(request, approval, level, hoursOverdue) {
    const escalationConfig = this.escalationLevels[level];
    if (!escalationConfig) return;

    // Get escalation recipients
    const recipients = await this.getEscalationRecipients(
      escalationConfig.recipients,
      request.requester.department
    );

    for (const recipient of recipients) {
      await sendNotification({
        recipient: recipient._id,
        type: 'escalation',
        title: `Level ${level} Escalation: Overdue Approval`,
        message: `Approval for coverage request "${request.title}" is ${hoursOverdue} hours overdue. Current approver: ${approval.approver?.fullName || 'Unknown'}`,
        data: {
          requestId: request.requestId,
          approverId: approval.approver?._id,
          hoursOverdue,
          escalationLevel: level,
          dueDate: approval.dueDate
        },
        priority: level >= 3 ? 'critical' : 'high'
      });
    }

    // Update escalation info on the approval
    approval.escalated = true;
    approval.escalationLevel = level;
    approval.escalatedAt = new Date();
    await request.save();

    logger.info(`Escalated request ${request.requestId} to level ${level}`);
  }

  /**
   * Escalate an assignment
   */
  async escalateAssignment(assignment, level, hoursOverdue) {
    const escalationConfig = this.escalationLevels[level];
    if (!escalationConfig) return;

    // Get escalation recipients
    const recipients = await this.getEscalationRecipients(
      escalationConfig.recipients,
      assignment.assignee.department
    );

    for (const recipient of recipients) {
      await sendNotification({
        recipient: recipient._id,
        type: 'escalation',
        title: `Level ${level} Escalation: Overdue Assignment`,
        message: `Assignment for event "${assignment.event?.title}" is ${hoursOverdue} hours overdue. Assignee: ${assignment.assignee.fullName}`,
        data: {
          assignmentId: assignment.assignmentId,
          assigneeId: assignment.assignee._id,
          hoursOverdue,
          escalationLevel: level,
          scheduledEnd: assignment.schedule.end
        },
        priority: level >= 3 ? 'critical' : 'high'
      });
    }

    // Update assignment escalation info
    assignment.escalation = {
      level,
      escalatedAt: new Date(),
      escalatedBy: 'system',
      reason: `Assignment overdue by ${hoursOverdue} hours`
    };
    await assignment.save();

    logger.info(`Escalated assignment ${assignment.assignmentId} to level ${level}`);
  }

  /**
   * Escalate an event
   */
  async escalateEvent(event, level, hoursOverdue) {
    const escalationConfig = this.escalationLevels[level];
    if (!escalationConfig) return;

    // Get escalation recipients
    const department = event.coverageRequest?.requester?.department || 'News';
    const recipients = await this.getEscalationRecipients(
      escalationConfig.recipients,
      department
    );

    for (const recipient of recipients) {
      await sendNotification({
        recipient: recipient._id,
        type: 'escalation',
        title: `Level ${level} Escalation: Overdue Event`,
        message: `Event "${event.title}" is ${hoursOverdue} hours overdue. Check with assigned team.`,
        data: {
          eventId: event.eventId,
          hoursOverdue,
          escalationLevel: level,
          scheduledEnd: event.schedule.end,
          assignedResources: event.assignedResources.length
        },
        priority: level >= 3 ? 'critical' : 'high'
      });
    }

    // Add incident record
    event.incidents.push({
      type: 'escalation',
      description: `Event escalated to level ${level} - ${hoursOverdue} hours overdue`,
      severity: level >= 3 ? 'high' : 'medium',
      reportedBy: 'system',
      reportedAt: new Date()
    });
    await event.save();

    logger.info(`Escalated event ${event.eventId} to level ${level}`);
  }

  /**
   * Get escalation recipients based on role and department
   */
  async getEscalationRecipients(roles, department) {
    const query = {
      role: { $in: roles },
      isActive: true
    };

    // For department-specific roles, add department filter
    if (department && roles.some(r => r.includes('department'))) {
      query.department = department;
    }

    // Map role names to actual roles in the system
    const roleMapping = {
      'editor': 'editor',
      'senior_editor': 'editor', // Assuming senior editors are also editors
      'department_head': 'editor', // Assuming department heads are editors
      'admin': 'admin'
    };

    query.role = { $in: roles.map(r => roleMapping[r] || r) };

    return await User.find(query);
  }

  /**
   * Get escalation level based on hours overdue
   */
  getEscalationLevel(hoursOverdue) {
    if (hoursOverdue >= 24) return 4;
    if (hoursOverdue >= 8) return 3;
    if (hoursOverdue >= 4) return 2;
    if (hoursOverdue >= 2) return 1;
    return 0;
  }

  /**
   * Manual escalation trigger
   */
  async manuallyEscalate(entityType, entityId, reason, targetLevel) {
    try {
      let entity;
      let escalationFunction;

      switch (entityType) {
        case 'coverage_request':
          entity = await CoverageRequest.findById(entityId)
            .populate('approvalWorkflow.approver requester');
          escalationFunction = this.escalateCoverageRequest;
          break;
        case 'assignment':
          entity = await Assignment.findById(entityId)
            .populate('assignee assignedBy event');
          escalationFunction = this.escalateAssignment;
          break;
        case 'event':
          entity = await Event.findById(entityId)
            .populate('coverageRequest assignedResources.resource.assignedTo');
          escalationFunction = this.escalateEvent;
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }

      if (!entity) {
        throw new Error(`${entityType} not found`);
      }

      await escalationFunction.call(this, entity, targetLevel, 0, reason);

      logger.info(`Manually escalated ${entityType} ${entityId} to level ${targetLevel}`);
      return { success: true, message: 'Escalation triggered' };
    } catch (error) {
      logger.error('Manual escalation error:', error);
      throw error;
    }
  }
}

module.exports = new EscalationService();