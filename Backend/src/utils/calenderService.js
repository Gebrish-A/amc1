const Event = require('../models/Event');
const CoverageRequest = require('../models/CoverageRequest');
const { sendNotification } = require('./notificationService');
const logger = require('./logger');

class CalendarService {
  constructor() {
    this.timezone = 'Africa/Addis_Ababa';
  }

  /**
   * Get calendar events with filters
   */
  async getCalendarEvents(options = {}) {
    const {
      startDate,
      endDate,
      userId,
      department,
      category,
      priority,
      status = ['scheduled', 'in_progress']
    } = options;

    const query = {
      status: { $in: status },
      'schedule.start': { $gte: new Date(startDate || new Date()) }
    };

    if (endDate) {
      query['schedule.end'] = { $lte: new Date(endDate) };
    }

    if (department) {
      query.department = department;
    }

    if (category) {
      query.category = category;
    }

    if (priority) {
      query.priority = priority;
    }

    try {
      const events = await Event.find(query)
        .populate('coverageRequest', 'title category priority')
        .populate('assignedResources.resource', 'name type subType')
        .populate('assignedResources.resource.assignedTo', 'firstName lastName')
        .sort({ 'schedule.start': 1 })
        .lean();

      // Format events for calendar display
      return this.formatCalendarEvents(events, userId);
    } catch (error) {
      logger.error('Error fetching calendar events:', error);
      throw error;
    }
  }

  /**
   * Format events for calendar display
   */
  formatCalendarEvents(events, userId = null) {
    return events.map(event => ({
      id: event._id,
      eventId: event.eventId,
      title: event.title,
      description: event.description,
      start: event.schedule.start,
      end: event.schedule.end,
      location: event.location,
      category: event.coverageRequest?.category,
      priority: event.coverageRequest?.priority,
      status: event.status,
      color: this.getEventColor(event),
      textColor: this.getTextColor(event),
      assignedToMe: userId ? this.isAssignedToUser(event, userId) : false,
      resources: event.assignedResources?.length || 0,
      allDay: this.isAllDayEvent(event),
      extendedProps: {
        eventId: event.eventId,
        coverageRequestId: event.coverageRequest?._id,
        resources: event.assignedResources,
        notes: event.notes,
        checklist: event.checklist,
        incidents: event.incidents
      }
    }));
  }

  /**
   * Check if event is assigned to specific user
   */
  isAssignedToUser(event, userId) {
    if (!event.assignedResources) return false;
    
    return event.assignedResources.some(allocation => 
      allocation.resource?.assignedTo?._id.toString() === userId.toString()
    );
  }

  /**
   * Get event color based on priority/status
   */
  getEventColor(event) {
    const priority = event.coverageRequest?.priority;
    const status = event.status;

    if (status === 'cancelled') return '#95a5a6';
    if (status === 'completed') return '#27ae60';
    if (status === 'in_progress') return '#3498db';
    if (status === 'delayed') return '#e74c3c';

    switch (priority) {
      case 'high': return '#e74c3c';
      case 'medium': return '#f39c12';
      case 'low': return '#2ecc71';
      default: return '#3498db';
    }
  }

  /**
   * Get text color based on background
   */
  getTextColor(event) {
    const color = this.getEventColor(event);
    // Simple luminance calculation
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  /**
   * Check if event is all-day
   */
  isAllDayEvent(event) {
    if (!event.schedule.start || !event.schedule.end) return false;
    
    const start = new Date(event.schedule.start);
    const end = new Date(event.schedule.end);
    const duration = end.getTime() - start.getTime();
    
    // Consider event all-day if duration is 24 hours or more
    return duration >= 24 * 60 * 60 * 1000;
  }

  /**
   * Schedule event from coverage request
   */
  async scheduleEvent(coverageRequestId, scheduleOptions) {
    try {
      const coverageRequest = await CoverageRequest.findById(coverageRequestId)
        .populate('requester');
      
      if (!coverageRequest) {
        throw new Error('Coverage request not found');
      }

      if (coverageRequest.status !== 'approved') {
        throw new Error('Coverage request must be approved before scheduling');
      }

      const {
        start,
        end,
        setupTime,
        tearDownTime,
        timezone = this.timezone
      } = scheduleOptions;

      // Check for scheduling conflicts
      const conflicts = await this.checkSchedulingConflicts({
        start,
        end,
        location: coverageRequest.location
      });

      if (conflicts.length > 0) {
        return {
          success: false,
          conflicts,
          message: 'Scheduling conflicts detected'
        };
      }

      // Create event
      const event = await Event.create({
        coverageRequest: coverageRequestId,
        title: coverageRequest.title,
        description: coverageRequest.description,
        location: coverageRequest.location,
        schedule: {
          start,
          end,
          setupTime,
          tearDownTime,
          timezone
        },
        status: 'scheduled',
        metadata: {
          createdBy: coverageRequest.requester._id,
          revision: 1
        }
      });

      // Update coverage request status
      coverageRequest.status = 'scheduled';
      await coverageRequest.save();

      // Send notifications
      await sendNotification({
        recipient: coverageRequest.requester._id,
        type: 'event_reminder',
        title: 'Event Scheduled',
        message: `Your coverage request "${coverageRequest.title}" has been scheduled for ${new Date(start).toLocaleString()}`,
        data: {
          requestId: coverageRequest.requestId,
          eventId: event.eventId,
          startTime: start
        }
      });

      logger.info(`Event scheduled: ${event.eventId} for request ${coverageRequest.requestId}`);

      return {
        success: true,
        event,
        message: 'Event scheduled successfully'
      };

    } catch (error) {
      logger.error('Error scheduling event:', error);
      throw error;
    }
  }

  /**
   * Check for scheduling conflicts
   */
  async checkSchedulingConflicts(scheduleOptions) {
    const { start, end, location } = scheduleOptions;
    const conflicts = [];

    // Check time conflicts with existing events
    const timeConflicts = await Event.find({
      status: { $in: ['scheduled', 'in_progress'] },
      $or: [
        { 'schedule.start': { $lt: end, $gte: start } },
        { 'schedule.end': { $gt: start, $lte: end } },
        { 
          'schedule.start': { $lte: start },
          'schedule.end': { $gte: end }
        }
      ]
    }).populate('coverageRequest', 'title priority');

    if (timeConflicts.length > 0) {
      conflicts.push({
        type: 'time_conflict',
        events: timeConflicts.map(event => ({
          eventId: event.eventId,
          title: event.title,
          start: event.schedule.start,
          end: event.schedule.end,
          priority: event.coverageRequest?.priority
        }))
      });
    }

    // Check location conflicts (if location is provided)
    if (location && location.coordinates) {
      const locationConflicts = await Event.find({
        status: { $in: ['scheduled', 'in_progress'] },
        'location.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: location.coordinates
            },
            $maxDistance: 5000 // 5km radius
          }
        },
        'schedule.start': { $lt: end },
        'schedule.end': { $gt: start }
      });

      if (locationConflicts.length > 0) {
        conflicts.push({
          type: 'location_conflict',
          events: locationConflicts.map(event => ({
            eventId: event.eventId,
            title: event.title,
            location: event.location,
            distance: this.calculateDistance(
              location.coordinates,
              event.location.coordinates
            )
          }))
        });
      }
    }

    return conflicts;
  }

  /**
   * Calculate distance between coordinates
   */
  calculateDistance(coord1, coord2) {
    if (!coord1 || !coord2) return null;
    
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRad(degrees) {
    return degrees * (Math.PI/180);
  }

  /**
   * Reschedule event
   */
  async rescheduleEvent(eventId, newSchedule) {
    try {
      const event = await Event.findById(eventId);
      
      if (!event) {
        throw new Error('Event not found');
      }

      if (event.status === 'completed') {
        throw new Error('Cannot reschedule completed event');
      }

      // Check for conflicts with new schedule
      const conflicts = await this.checkSchedulingConflicts({
        start: newSchedule.start,
        end: newSchedule.end,
        location: event.location
      });

      if (conflicts.length > 0) {
        return {
          success: false,
          conflicts,
          message: 'Rescheduling conflicts detected'
        };
      }

      // Store old schedule for audit
      const oldSchedule = { ...event.schedule };

      // Update event schedule
      event.schedule = {
        ...event.schedule,
        ...newSchedule
      };
      event.metadata.revision += 1;

      await event.save();

      // Send notifications to assigned resources
      if (event.assignedResources && event.assignedResources.length > 0) {
        for (const allocation of event.assignedResources) {
          if (allocation.resource?.assignedTo) {
            await sendNotification({
              recipient: allocation.resource.assignedTo,
              type: 'assignment_updated',
              title: 'Event Rescheduled',
              message: `Event "${event.title}" has been rescheduled to ${new Date(newSchedule.start).toLocaleString()}`,
              data: {
                eventId: event.eventId,
                oldStart: oldSchedule.start,
                newStart: newSchedule.start
              }
            });
          }
        }
      }

      logger.info(`Event rescheduled: ${event.eventId}`);

      return {
        success: true,
        event,
        message: 'Event rescheduled successfully'
      };

    } catch (error) {
      logger.error('Error rescheduling event:', error);
      throw error;
    }
  }

  /**
   * Get upcoming events for user
   */
  async getUpcomingEvents(userId, limit = 10) {
    try {
      const events = await Event.find({
        status: { $in: ['scheduled', 'in_progress'] },
        'schedule.start': { $gte: new Date() },
        'assignedResources.resource.assignedTo': userId
      })
      .populate('coverageRequest', 'title category priority')
      .sort({ 'schedule.start': 1 })
      .limit(limit)
      .lean();

      return events;
    } catch (error) {
      logger.error('Error fetching upcoming events:', error);
      throw error;
    }
  }

  /**
   * Send event reminders
   */
  async sendEventReminders(hoursBefore = 24) {
    try {
      const reminderTime = new Date(Date.now() + (hoursBefore * 60 * 60 * 1000));
      
      const events = await Event.find({
        status: 'scheduled',
        'schedule.start': { 
          $gte: new Date(),
          $lte: reminderTime
        }
      })
      .populate('assignedResources.resource.assignedTo')
      .populate('coverageRequest', 'title');

      let remindersSent = 0;

      for (const event of events) {
        const assignedUsers = event.assignedResources
          .map(allocation => allocation.resource?.assignedTo)
          .filter(user => user);

        for (const user of assignedUsers) {
          await sendNotification({
            recipient: user._id,
            type: 'event_reminder',
            title: 'Upcoming Event',
            message: `Reminder: Event "${event.coverageRequest?.title}" starts in ${hoursBefore} hours`,
            data: {
              eventId: event.eventId,
              startTime: event.schedule.start,
              location: event.location
            },
            channels: user.notificationPreferences || ['in_app', 'email']
          });
        }

        remindersSent += assignedUsers.length;
      }

      logger.info(`Sent ${remindersSent} event reminders for ${events.length} events`);
      
      return {
        events: events.length,
        remindersSent
      };
    } catch (error) {
      logger.error('Error sending event reminders:', error);
      throw error;
    }
  }

  /**
   * Get event statistics
   */
  async getEventStatistics(timeRange = 'month') {
    try {
      let startDate;
      const endDate = new Date();

      switch (timeRange) {
        case 'day':
          startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
        default:
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      const stats = await Event.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $facet: {
            totalEvents: [{ $count: 'count' }],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            byCategory: [
              { $lookup: {
                  from: 'coveragerequests',
                  localField: 'coverageRequest',
                  foreignField: '_id',
                  as: 'request'
                }
              },
              { $unwind: '$request' },
              { $group: { _id: '$request.category', count: { $sum: 1 } } }
            ],
            completedOnTime: [
              { $match: { status: 'completed' } },
              { $lookup: {
                  from: 'coveragerequests',
                  localField: 'coverageRequest',
                  foreignField: '_id',
                  as: 'request'
                }
              },
              { $unwind: '$request' },
              {
                $addFields: {
                  onTime: {
                    $cond: [
                      { $and: [
                        { $lte: ['$schedule.end', '$request.slaDeadline'] },
                        { $request: { $ne: null } }
                      ]},
                      true,
                      false
                    ]
                  }
                }
              },
              { $group: { _id: '$onTime', count: { $sum: 1 } } }
            ]
          }
        }
      ]);

      return stats[0];
    } catch (error) {
      logger.error('Error getting event statistics:', error);
      throw error;
    }
  }
}

module.exports = new CalendarService();