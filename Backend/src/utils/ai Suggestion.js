const User = require('../models/user');
const Resource = require('../models/resource');
const Assignment = require('../models/assignment');
const axios = require('axios');

class AISuggestionService {
  constructor() {
    this.apiKey = process.env.AI_API_KEY;
    this.apiUrl = process.env.AI_SERVICE_URL;
  }

  /**
   * Suggest reporters based on event details
   */
  async suggestReporters(eventDetails) {
    const { category, location, startTime, priority } = eventDetails;

    try {
      // Get available reporters
      const availableReporters = await User.find({
        role: 'reporter',
        availabilityStatus: 'available',
        isActive: true,
        expertise: category // Match expertise with event category
      });

      // If AI service is available, use it for intelligent matching
      if (this.apiKey && this.apiUrl) {
        return await this.getAISuggestions(availableReporters, eventDetails);
      }

      // Fallback to rule-based suggestions
      return this.getRuleBasedSuggestions(availableReporters, eventDetails);
    } catch (error) {
      console.error('Error suggesting reporters:', error);
      return [];
    }
  }

  /**
   * Get AI-based suggestions using external API
   */
  async getAISuggestions(reporters, eventDetails) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/chat/completions`,
        {
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an expert media assignment manager. Suggest the best reporters for coverage events based on their expertise, location, and availability.'
            },
            {
              role: 'user',
              content: `Event details: ${JSON.stringify(eventDetails)}\n\nAvailable reporters: ${JSON.stringify(reporters.map(r => ({
                id: r._id,
                name: r.fullName,
                expertise: r.expertise,
                languages: r.languages,
                location: r.currentLocation
              })))}`
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return this.parseAISuggestions(response.data);
    } catch (error) {
      console.error('AI suggestion API error:', error);
      return this.getRuleBasedSuggestions(reporters, eventDetails);
    }
  }

  /**
   * Rule-based fallback suggestions
   */
  getRuleBasedSuggestions(reporters, eventDetails) {
    const { category, location, priority } = eventDetails;

    // Score each reporter based on various factors
    const scoredReporters = reporters.map(reporter => {
      let score = 0;

      // Expertise match (40%)
      if (reporter.expertise && reporter.expertise.includes(category)) {
        score += 40;
      }

      // Location proximity (30%)
      if (reporter.currentLocation && location.coordinates) {
        const distance = this.calculateDistance(
          reporter.currentLocation.coordinates,
          location.coordinates
        );
        score += Math.max(0, 30 - (distance / 10)); // Decrease score with distance
      }

      // Language match (20%)
      if (reporter.languages && reporter.languages.includes('Amharic')) {
        score += 10;
      }
      if (reporter.languages && reporter.languages.includes('English')) {
        score += 10;
      }

      // Workload consideration (10%)
      // TODO: Fetch reporter's current assignments count
      score += 10; // Base score

      return {
        reporter,
        score,
        reason: this.generateSuggestionReason(reporter, eventDetails, score)
      };
    });

    // Sort by score descending
    return scoredReporters.sort((a, b) => b.score - a.score);
  }

  /**
   * Suggest resources based on requirements
   */
  async suggestResources(requirements) {
    const { equipmentNeeded, vehicleNeeded, location, startTime, endTime } = requirements;

    try {
      const suggestions = {};

      // Suggest equipment
      if (equipmentNeeded && equipmentNeeded.length > 0) {
        suggestions.equipment = await this.suggestEquipment(equipmentNeeded, location, startTime, endTime);
      }

      // Suggest vehicles
      if (vehicleNeeded) {
        suggestions.vehicles = await this.suggestVehicles(location, startTime, endTime);
      }

      return suggestions;
    } catch (error) {
      console.error('Error suggesting resources:', error);
      return {};
    }
  }

  async suggestEquipment(equipmentTypes, location, startTime, endTime) {
    const availableEquipment = await Resource.find({
      type: 'equipment',
      subType: { $in: equipmentTypes },
      availabilityStatus: 'available',
      $or: [
        { 'bookingSchedule': { $size: 0 } },
        {
          'bookingSchedule': {
            $not: {
              $elemMatch: {
                start: { $lt: endTime },
                end: { $gt: startTime },
                status: { $in: ['confirmed', 'tentative'] }
              }
            }
          }
        }
      ]
    });

    // Score equipment based on condition, location, and features
    return availableEquipment.map(equipment => ({
      equipment,
      score: this.scoreEquipment(equipment, location),
      reason: `Available ${equipment.subType} in good condition`
    })).sort((a, b) => b.score - a.score);
  }

  async suggestVehicles(location, startTime, endTime) {
    const availableVehicles = await Resource.find({
      type: 'vehicle',
      availabilityStatus: 'available',
      $or: [
        { 'bookingSchedule': { $size: 0 } },
        {
          'bookingSchedule': {
            $not: {
              $elemMatch: {
                start: { $lt: endTime },
                end: { $gt: startTime },
                status: { $in: ['confirmed', 'tentative'] }
              }
            }
          }
        }
      ]
    });

    // Score vehicles based on condition, fuel level, and location
    return availableVehicles.map(vehicle => ({
      vehicle,
      score: this.scoreVehicle(vehicle, location),
      reason: `Available ${vehicle.subType} with ${vehicle.operationalStatus?.fuelLevel || 0}% fuel`
    })).sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  calculateDistance(coord1, coord2) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
  }

  toRad(degrees) {
    return degrees * (Math.PI/180);
  }

  scoreEquipment(equipment, location) {
    let score = 50; // Base score

    // Maintenance status (20%)
    if (equipment.maintenance && equipment.maintenance.nextMaintenance) {
      const daysUntilMaintenance = Math.ceil(
        (equipment.maintenance.nextMaintenance - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilMaintenance > 30) score += 20;
      else if (daysUntilMaintenance > 7) score += 10;
    }

    // Location proximity (20%)
    if (equipment.currentLocation && location.coordinates) {
      const distance = this.calculateDistance(
        equipment.currentLocation.coordinates,
        location.coordinates
      );
      score += Math.max(0, 20 - (distance / 5));
    }

    // Condition (10%)
    if (!equipment.operationalStatus?.issues || equipment.operationalStatus.issues.length === 0) {
      score += 10;
    }

    return score;
  }

  scoreVehicle(vehicle, location) {
    let score = 50; // Base score

    // Fuel level (20%)
    const fuelLevel = vehicle.operationalStatus?.fuelLevel || 0;
    score += (fuelLevel / 5); // 20 points for 100% fuel

    // Maintenance status (15%)
    if (vehicle.maintenance && vehicle.maintenance.nextMaintenance) {
      const daysUntilMaintenance = Math.ceil(
        (vehicle.maintenance.nextMaintenance - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilMaintenance > 30) score += 15;
      else if (daysUntilMaintenance > 7) score += 7;
    }

    // Location proximity (15%)
    if (vehicle.currentLocation && location.coordinates) {
      const distance = this.calculateDistance(
        vehicle.currentLocation.coordinates,
        location.coordinates
      );
      score += Math.max(0, 15 - (distance / 5));
    }

    return score;
  }

  generateSuggestionReason(reporter, eventDetails, score) {
    const reasons = [];

    if (reporter.expertise && reporter.expertise.includes(eventDetails.category)) {
      reasons.push(`Expert in ${eventDetails.category}`);
    }

    if (reporter.languages && reporter.languages.includes('Amharic')) {
      reasons.push('Fluent in Amharic');
    }

    if (reporter.currentLocation) {
      reasons.push('Location data available');
    }

    if (score > 80) {
      reasons.push('Highly suitable match');
    } else if (score > 60) {
      reasons.push('Good match');
    }

    return reasons.join(', ');
  }

  parseAISuggestions(aiResponse) {
    // Parse AI response and convert to structured suggestions
    try {
      const content = aiResponse.choices[0].message.content;
      const suggestions = JSON.parse(content);
      return suggestions;
    } catch (error) {
      console.error('Error parsing AI suggestions:', error);
      return [];
    }
  }
}

module.exports = new AISuggestionService();