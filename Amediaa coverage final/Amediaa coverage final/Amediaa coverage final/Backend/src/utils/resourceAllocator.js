const Resource = require('../models/resource');
const Assignment = require('../models/assignment');
const { sendNotification } = require('./notificationService');
const logger = require('./logger');

class ResourceAllocator {
  constructor() {
    this.allocationStrategy = 'balanced'; // balanced, proximity_first, expertise_first
  }

  /**
   * Allocate resources for an event
   */
  async allocateResources(event, requirements) {
    try {
      const allocations = {
        personnel: [],
        equipment: [],
        vehicles: [],
        conflicts: []
      };

      // Allocate reporters and crew
      if (requirements.personnel) {
        allocations.personnel = await this.allocatePersonnel(event, requirements.personnel);
      }

      // Allocate equipment
      if (requirements.equipment) {
        allocations.equipment = await this.allocateEquipment(event, requirements.equipment);
      }

      // Allocate vehicles
      if (requirements.vehicles) {
        allocations.vehicles = await this.allocateVehicles(event, requirements.vehicles);
      }

      // Check for conflicts
      allocations.conflicts = await this.checkConflicts(allocations, event);

      // Log allocation
      logger.info(`Resources allocated for event ${event._id}:`, {
        eventId: event._id,
        allocations: Object.keys(allocations).filter(k => k !== 'conflicts'),
        conflicts: allocations.conflicts.length
      });

      return allocations;
    } catch (error) {
      logger.error('Resource allocation error:', error);
      throw error;
    }
  }

  /**
   * Allocate personnel (reporters, cameramen, etc.)
   */
  async allocatePersonnel(event, personnelRequirements) {
    const allocations = [];
    const { start, end } = event.schedule;

    for (const requirement of personnelRequirements) {
      const { role, count = 1, expertise, languages } = requirement;

      // Find available personnel
      const query = {
        type: 'personnel',
        subType: role,
        availabilityStatus: 'available',
        isActive: true,
        $or: [
          { 'bookingSchedule': { $size: 0 } },
          {
            'bookingSchedule': {
              $not: {
                $elemMatch: {
                  start: { $lt: end },
                  end: { $gt: start },
                  status: { $in: ['confirmed', 'tentative'] }
                }
              }
            }
          }
        ]
      };

      // Add expertise filter if specified
      if (expertise) {
        query.expertise = { $in: expertise };
      }

      // Add language filter if specified
      if (languages) {
        query.languages = { $in: languages };
      }

      const availablePersonnel = await Resource.find(query)
        .sort(this.getSortCriteria(event))
        .limit(count * 2); // Get more than needed for selection

      // Select best matches
      const selected = availablePersonnel.slice(0, count).map(person => ({
        resource: person._id,
        role: person.subType,
        score: this.scorePersonnel(person, event),
        allocationMethod: this.allocationStrategy
      }));

      allocations.push(...selected);

      // Update personnel availability
      for (const allocation of selected) {
        await Resource.findByIdAndUpdate(allocation.resource, {
          $push: {
            bookingSchedule: {
              event: event._id,
              start: start,
              end: end,
              status: 'tentative'
            }
          },
          availabilityStatus: 'assigned'
        });

        // Send notification to assigned personnel
        await sendNotification({
          recipient: person.assignedTo, // Assuming Resource has assignedTo field linking to User
          type: 'assignment_created',
          title: 'New Assignment',
          message: `You have been assigned to event: ${event.title}`,
          data: {
            eventId: event._id,
            eventTitle: event.title,
            startTime: start,
            role: role
          }
        });
      }
    }

    return allocations;
  }

  /**
   * Allocate equipment
   */
  async allocateEquipment(event, equipmentRequirements) {
    const allocations = [];
    const { start, end } = event.schedule;

    for (const requirement of equipmentRequirements) {
      const { type, count = 1, specifications } = requirement;

      const query = {
        type: 'equipment',
        subType: type,
        availabilityStatus: 'available',
        $or: [
          { 'bookingSchedule': { $size: 0 } },
          {
            'bookingSchedule': {
              $not: {
                $elemMatch: {
                  start: { $lt: end },
                  end: { $gt: start },
                  status: { $in: ['confirmed', 'tentative'] }
                }
              }
            }
          }
        ]
      };

      // Add specifications filter if provided
      if (specifications) {
        for (const [key, value] of Object.entries(specifications)) {
          query[`specifications.${key}`] = value;
        }
      }

      const availableEquipment = await Resource.find(query)
        .sort({ 'maintenance.nextMaintenance': 1 }) // Prefer equipment with later maintenance
        .limit(count * 2);

      const selected = availableEquipment.slice(0, count).map(equipment => ({
        resource: equipment._id,
        type: equipment.subType,
        score: this.scoreEquipment(equipment, event),
        specifications: equipment.specifications
      }));

      allocations.push(...selected);

      // Update equipment booking
      for (const allocation of selected) {
        await Resource.findByIdAndUpdate(allocation.resource, {
          $push: {
            bookingSchedule: {
              event: event._id,
              start: start,
              end: end,
              status: 'tentative'
            }
          },
          availabilityStatus: 'assigned'
        });
      }
    }

    return allocations;
  }

  /**
   * Allocate vehicles
   */
  async allocateVehicles(event, vehicleRequirements) {
    const allocations = [];
    const { start, end } = event.schedule;

    for (const requirement of vehicleRequirements) {
      const { type, count = 1, capacity } = requirement;

      const query = {
        type: 'vehicle',
        subType: type,
        availabilityStatus: 'available',
        $or: [
          { 'bookingSchedule': { $size: 0 } },
          {
            'bookingSchedule': {
              $not: {
                $elemMatch: {
                  start: { $lt: end },
                  end: { $gt: start },
                  status: { $in: ['confirmed', 'tentative'] }
                }
              }
            }
          }
        ]
      };

      // Add capacity filter if specified
      if (capacity) {
        query['specifications.capacity'] = { $gte: capacity };
      }

      const availableVehicles = await Resource.find(query)
        .sort({ 'operationalStatus.fuelLevel': -1 }) // Prefer vehicles with more fuel
        .limit(count * 2);

      const selected = availableVehicles.slice(0, count).map(vehicle => ({
        resource: vehicle._id,
        type: vehicle.subType,
        score: this.scoreVehicle(vehicle, event),
        fuelLevel: vehicle.operationalStatus?.fuelLevel || 0
      }));

      allocations.push(...selected);

      // Update vehicle booking
      for (const allocation of selected) {
        await Resource.findByIdAndUpdate(allocation.resource, {
          $push: {
            bookingSchedule: {
              event: event._id,
              start: start,
              end: end,
              status: 'tentative'
            }
          },
          availabilityStatus: 'assigned'
        });
      }
    }

    return allocations;
  }

  /**
   * Check for conflicts in allocations
   */
  async checkConflicts(allocations, event) {
    const conflicts = [];

    // Check time conflicts
    for (const personnel of allocations.personnel) {
      const existingAssignments = await Assignment.find({
        assignee: personnel.resource.assignedTo,
        'schedule.start': { $lt: event.schedule.end },
        'schedule.end': { $gt: event.schedule.start },
        status: { $in: ['accepted', 'in_progress'] }
      });

      if (existingAssignments.length > 0) {
        conflicts.push({
          type: 'time_conflict',
          resource: personnel.resource._id,
          existingAssignments,
          message: 'Personnel has overlapping assignments'
        });
      }
    }

    // Check equipment maintenance conflicts
    for (const equipment of allocations.equipment) {
      if (equipment.resource.maintenance && equipment.resource.maintenance.nextMaintenance) {
        const maintenanceDate = equipment.resource.maintenance.nextMaintenance;
        if (maintenanceDate >= event.schedule.start && maintenanceDate <= event.schedule.end) {
          conflicts.push({
            type: 'maintenance_conflict',
            resource: equipment.resource._id,
            maintenanceDate,
            message: 'Equipment scheduled for maintenance during event'
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Score personnel for allocation
   */
  scorePersonnel(personnel, event) {
    let score = 50; // Base score

    // Expertise match (30%)
    if (personnel.expertise && event.category) {
      if (personnel.expertise.includes(event.category)) {
        score += 30;
      }
    }

    // Location proximity (20%)
    if (personnel.currentLocation && event.location.coordinates) {
      const distance = this.calculateDistance(
        personnel.currentLocation.coordinates,
        event.location.coordinates
      );
      score += Math.max(0, 20 - (distance / 10));
    }

    // Availability history (10%)
    // TODO: Add availability history scoring
    score += 10;

    return score;
  }

  /**
   * Score equipment for allocation
   */
  scoreEquipment(equipment, event) {
    let score = 50; // Base score

    // Maintenance status (25%)
    if (equipment.maintenance && equipment.maintenance.nextMaintenance) {
      const daysUntilMaintenance = Math.ceil(
        (equipment.maintenance.nextMaintenance - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilMaintenance > 30) score += 25;
      else if (daysUntilMaintenance > 7) score += 15;
      else if (daysUntilMaintenance > 0) score += 5;
    }

    // Location proximity (25%)
    if (equipment.currentLocation && event.location.coordinates) {
      const distance = this.calculateDistance(
        equipment.currentLocation.coordinates,
        event.location.coordinates
      );
      score += Math.max(0, 25 - (distance / 5));
    }

    return score;
  }

  /**
   * Score vehicle for allocation
   */
  scoreVehicle(vehicle, event) {
    let score = 50; // Base score

    // Fuel level (25%)
    const fuelLevel = vehicle.operationalStatus?.fuelLevel || 0;
    score += (fuelLevel / 4); // 25 points for 100% fuel

    // Maintenance status (15%)
    if (vehicle.maintenance && vehicle.maintenance.nextMaintenance) {
      const daysUntilMaintenance = Math.ceil(
        (vehicle.maintenance.nextMaintenance - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilMaintenance > 30) score += 15;
      else if (daysUntilMaintenance > 7) score += 10;
    }

    // Location proximity (10%)
    if (vehicle.currentLocation && event.location.coordinates) {
      const distance = this.calculateDistance(
        vehicle.currentLocation.coordinates,
        event.location.coordinates
      );
      score += Math.max(0, 10 - (distance / 10));
    }

    return score;
  }

  /**
   * Calculate distance between coordinates (simplified)
   */
  calculateDistance(coord1, coord2) {
    if (!coord1 || !coord2) return 1000; // Default large distance
    
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    
    // Simple Euclidean distance (approximate)
    const dx = lon2 - lon1;
    const dy = lat2 - lat1;
    return Math.sqrt(dx * dx + dy * dy) * 111; // Convert to km (approx)
  }

  /**
   * Get sort criteria based on allocation strategy
   */
  getSortCriteria(event) {
    switch (this.allocationStrategy) {
      case 'proximity_first':
        return { 'currentLocation.lastUpdated': -1 };
      case 'expertise_first':
        return { expertise: -1 };
      case 'balanced':
      default:
        return { 'bookingSchedule': 1, 'currentLocation.lastUpdated': -1 };
    }
  }

  /**
   * Set allocation strategy
   */
  setStrategy(strategy) {
    if (['balanced', 'proximity_first', 'expertise_first'].includes(strategy)) {
      this.allocationStrategy = strategy;
    }
  }

  /**
   * Release allocated resources
   */
  async releaseResources(eventId) {
    try {
      // Update all resources assigned to this event
      await Resource.updateMany(
        {
          'bookingSchedule.event': eventId
        },
        {
          $pull: { bookingSchedule: { event: eventId } },
          $set: { availabilityStatus: 'available' }
        }
      );

      logger.info(`Released resources for event ${eventId}`);
      return true;
    } catch (error) {
      logger.error('Error releasing resources:', error);
      throw error;
    }
  }
}

module.exports = new ResourceAllocator();