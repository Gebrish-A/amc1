const CoverageRequest = require('../models/CoverageRequest');
const Event = require('../models/Event');
const Assignment = require('../models/assignment');
const MediaFile = require('../models/mediafile');
const Resource = require('../models/resource');
const User = require('../models/user');
const logger = require('./logger');

class AnalyticsService {
  constructor() {
    this.timeRanges = {
      today: () => ({
        start: new Date().setHours(0, 0, 0, 0),
        end: new Date()
      }),
      yesterday: () => ({
        start: new Date(Date.now() - 24 * 60 * 60 * 1000).setHours(0, 0, 0, 0),
        end: new Date(Date.now() - 24 * 60 * 60 * 1000).setHours(23, 59, 59, 999)
      }),
      last7days: () => ({
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date()
      }),
      last30days: () => ({
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date()
      }),
      thisMonth: () => {
        const now = new Date();
        return {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: now
        };
      },
      lastMonth: () => {
        const now = new Date();
        return {
          start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
          end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
        };
      }
    };
  }

  /**
   * Get comprehensive analytics dashboard
   */
  async getDashboardAnalytics(timeRange = 'last30days', department = null) {
    try {
      const timeRangeFn = this.timeRanges[timeRange] || this.timeRanges.last30days;
      const { start, end } = timeRangeFn();

      const matchStage = {
        createdAt: { $gte: new Date(start), $lte: new Date(end) }
      };

      if (department) {
        matchStage.department = department;
      }

      const [
        coverageAnalytics,
        eventAnalytics,
        assignmentAnalytics,
        mediaAnalytics,
        resourceAnalytics,
        userAnalytics,
        kpis
      ] = await Promise.all([
        this.getCoverageAnalytics(start, end, department),
        this.getEventAnalytics(start, end, department),
        this.getAssignmentAnalytics(start, end, department),
        this.getMediaAnalytics(start, end, department),
        this.getResourceAnalytics(start, end),
        this.getUserAnalytics(start, end, department),
        this.getKPIs(start, end, department)
      ]);

      return {
        timeRange: {
          name: timeRange,
          start: new Date(start),
          end: new Date(end)
        },
        department,
        coverage: coverageAnalytics,
        events: eventAnalytics,
        assignments: assignmentAnalytics,
        media: mediaAnalytics,
        resources: resourceAnalytics,
        users: userAnalytics,
        kpis,
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error('Get dashboard analytics error:', error);
      throw error;
    }
  }

  /**
   * Get coverage analytics
   */
  async getCoverageAnalytics(start, end, department = null) {
    const matchStage = {
      createdAt: { $gte: new Date(start), $lte: new Date(end) }
    };

    if (department) {
      const usersInDepartment = await User.find({ department }).select('_id');
      matchStage.requester = { $in: usersInDepartment.map(u => u._id) };
    }

    const analytics = await CoverageRequest.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'requester',
          foreignField: '_id',
          as: 'requesterInfo'
        }
      },
      { $unwind: '$requesterInfo' },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                approved: {
                  $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                },
                completed: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                },
                rejected: {
                  $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
                },
                avgProcessingTime: {
                  $avg: {
                    $cond: [
                      { $in: ['$status', ['approved', 'rejected', 'completed']] },
                      { $divide: [
                        { $subtract: ['$updatedAt', '$createdAt'] },
                        1000 * 60 * 60
                      ]},
                      null
                    ]
                  }
                }
              }
            }
          ],
          byCategory: [
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          byPriority: [
            { $group: { _id: '$priority', count: { $sum: 1 } } }
          ],
          byDepartment: [
            { $group: { _id: '$requesterInfo.department', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          dailyTrend: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 },
                approved: {
                  $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                }
              }
            },
            { $sort: { _id: 1 } },
            { $limit: 30 }
          ],
          topRequesters: [
            {
              $group: {
                _id: '$requester',
                name: { $first: '$requesterInfo.firstName' },
                lastName: { $first: '$requesterInfo.lastName' },
                department: { $first: '$requesterInfo.department' },
                count: { $sum: 1 },
                approvedCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                },
                avgProcessingTime: {
                  $avg: {
                    $cond: [
                      { $in: ['$status', ['approved', 'rejected', 'completed']] },
                      { $divide: [
                        { $subtract: ['$updatedAt', '$createdAt'] },
                        1000 * 60 * 60
                      ]},
                      null
                    ]
                  }
                }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          slaPerformance: [
            { $match: { slaDeadline: { $exists: true } } },
            {
              $addFields: {
                slaStatus: {
                  $cond: [
                    { $and: [
                      { $eq: ['$status', 'completed'] },
                      { $lte: ['$completionDate', '$slaDeadline'] }
                    ]},
                    'met',
                    'missed'
                  ]
                }
              }
            },
            {
              $group: {
                _id: '$slaStatus',
                count: { $sum: 1 },
                avgTimeToComplete: {
                  $avg: {
                    $divide: [
                      { $subtract: ['$completionDate', '$createdAt'] },
                      1000 * 60 * 60
                    ]
                  }
                }
              }
            }
          ]
        }
      }
    ]);

    return analytics[0];
  }

  /**
   * Get event analytics
   */
  async getEventAnalytics(start, end, department = null) {
    const matchStage = {
      'schedule.start': { $gte: new Date(start), $lte: new Date(end) }
    };

    const analytics = await Event.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'coveragerequests',
          localField: 'coverageRequest',
          foreignField: '_id',
          as: 'requestInfo'
        }
      },
      { $unwind: '$requestInfo' },
      {
        $lookup: {
          from: 'users',
          localField: 'requestInfo.requester',
          foreignField: '_id',
          as: 'requesterInfo'
        }
      },
      { $unwind: '$requesterInfo' },
      {
        $match: department ? { 'requesterInfo.department': department } : {}
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                completed: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                },
                inProgress: {
                  $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
                },
                cancelled: {
                  $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                },
                avgDuration: {
                  $avg: {
                    $divide: [
                      { $subtract: ['$schedule.end', '$schedule.start'] },
                      1000 * 60 * 60
                    ]
                  }
                },
                avgResourcesPerEvent: {
                  $avg: { $size: '$assignedResources' }
                }
              }
            }
          ],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          byCategory: [
            { $group: { _id: '$requestInfo.category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          byLocation: [
            { $match: { 'location.address': { $exists: true } } },
            {
              $group: {
                _id: '$location.address',
                count: { $sum: 1 },
                city: { $first: '$location.city' }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          timeline: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$schedule.start' } },
                count: { $sum: 1 },
                completed: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                }
              }
            },
            { $sort: { _id: 1 } },
            { $limit: 30 }
          ],
          incidentAnalysis: [
            { $match: { incidents: { $exists: true, $ne: [] } } },
            { $unwind: '$incidents' },
            {
              $group: {
                _id: '$incidents.type',
                count: { $sum: 1 },
                avgSeverity: {
                  $avg: {
                    $switch: {
                      branches: [
                        { case: { $eq: ['$incidents.severity', 'low'] }, then: 1 },
                        { case: { $eq: ['$incidents.severity', 'medium'] }, then: 2 },
                        { case: { $eq: ['$incidents.severity', 'high'] }, then: 3 },
                        { case: { $eq: ['$incidents.severity', 'critical'] }, then: 4 }
                      ],
                      default: 0
                    }
                  }
                }
              }
            },
            { $sort: { count: -1 } }
          ]
        }
      }
    ]);

    return analytics[0];
  }

  /**
   * Get assignment analytics
   */
  async getAssignmentAnalytics(start, end, department = null) {
    const matchStage = {
      createdAt: { $gte: new Date(start), $lte: new Date(end) }
    };

    const analytics = await Assignment.aggregate([
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
        $match: department ? { 'assigneeInfo.department': department } : {}
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                completed: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                },
                inProgress: {
                  $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
                },
                declined: {
                  $sum: { $cond: [{ $eq: ['$status', 'declined'] }, 1, 0] }
                },
                avgCompletionTime: {
                  $avg: {
                    $cond: [
                      { $eq: ['$status', 'completed'] },
                      {
                        $divide: [
                          { $subtract: ['$schedule.end', '$schedule.start'] },
                          1000 * 60 * 60
                        ]
                      },
                      null
                    ]
                  }
                },
                avgRating: { $avg: '$feedback.fromManager.rating' }
              }
            }
          ],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          byRole: [
            { $group: { _id: '$role', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          byDepartment: [
            { $group: { _id: '$assigneeInfo.department', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          performanceMetrics: [
            { $match: { 'performanceMetrics.totalScore': { $exists: true } } },
            {
              $group: {
                _id: null,
                avgTotalScore: { $avg: '$performanceMetrics.totalScore' },
                avgPunctuality: { $avg: '$performanceMetrics.punctuality' },
                avgQuality: { $avg: '$performanceMetrics.quality' },
                avgCompleteness: { $avg: '$performanceMetrics.completeness' },
                avgCollaboration: { $avg: '$performanceMetrics.collaboration' }
              }
            }
          ],
          topPerformers: [
            { $match: { status: 'completed' } },
            {
              $group: {
                _id: '$assignee',
                name: { $first: '$assigneeInfo.firstName' },
                lastName: { $first: '$assigneeInfo.lastName' },
                department: { $first: '$assigneeInfo.department' },
                completedCount: { $sum: 1 },
                avgRating: { $avg: '$feedback.fromManager.rating' },
                avgCompletionTime: {
                  $avg: {
                    $divide: [
                      { $subtract: ['$schedule.end', '$schedule.start'] },
                      1000 * 60 * 60
                    ]
                  }
                },
                totalScore: { $avg: '$performanceMetrics.totalScore' }
              }
            },
            { $sort: { totalScore: -1 } },
            { $limit: 15 }
          ],
          workloadDistribution: [
            {
              $group: {
                _id: '$assignee',
                name: { $first: '$assigneeInfo.firstName' },
                lastName: { $first: '$assigneeInfo.lastName' },
                totalAssignments: { $sum: 1 },
                activeAssignments: {
                  $sum: { $cond: [
                    { $in: ['$status', ['accepted', 'in_progress']] }, 1, 0
                  ]}
                }
              }
            },
            { $sort: { totalAssignments: -1 } },
            { $limit: 20 }
          ]
        }
      }
    ]);

    return analytics[0];
  }

  /**
   * Get media analytics
   */
  async getMediaAnalytics(start, end, department = null) {
    const matchStage = {
      uploadedAt: { $gte: new Date(start), $lte: new Date(end) }
    };

    const analytics = await MediaFile.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'uploadedBy',
          foreignField: '_id',
          as: 'uploaderInfo'
        }
      },
      { $unwind: '$uploaderInfo' },
      {
        $match: department ? { 'uploaderInfo.department': department } : {}
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                totalSize: { $sum: '$size' },
                approved: {
                  $sum: { $cond: [{ $eq: ['$reviewStatus', 'approved'] }, 1, 0] }
                },
                pending: {
                  $sum: { $cond: [{ $eq: ['$reviewStatus', 'pending'] }, 1, 0] }
                },
                avgFileSize: { $avg: '$size' },
                totalViews: { $sum: '$viewCount' },
                totalDownloads: { $sum: '$downloadCount' }
              }
            }
          ],
          byFileType: [
            { $group: { _id: '$fileType', count: { $sum: 1 }, totalSize: { $sum: '$size' } } },
            { $sort: { count: -1 } }
          ],
          byReviewStatus: [
            { $group: { _id: '$reviewStatus', count: { $sum: 1 } } }
          ],
          byDepartment: [
            { $group: { _id: '$uploaderInfo.department', count: { $sum: 1 }, totalSize: { $sum: '$size' } } },
            { $sort: { count: -1 } }
          ],
          storageTrend: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$uploadedAt' } },
                count: { $sum: 1 },
                totalSize: { $sum: '$size' }
              }
            },
            { $sort: { _id: 1 } },
            { $limit: 30 }
          ],
          topUploaders: [
            {
              $group: {
                _id: '$uploadedBy',
                name: { $first: '$uploaderInfo.firstName' },
                lastName: { $first: '$uploaderInfo.lastName' },
                department: { $first: '$uploaderInfo.department' },
                fileCount: { $sum: 1 },
                totalSize: { $sum: '$size' },
                avgRating: { $avg: '$qualityMetrics.overallRating' },
                approvalRate: {
                  $avg: { $cond: [{ $eq: ['$reviewStatus', 'approved'] }, 100, 0] }
                }
              }
            },
            { $sort: { fileCount: -1 } },
            { $limit: 10 }
          ],
          popularContent: [
            {
              $group: {
                _id: '$_id',
                fileName: { $first: '$originalName' },
                fileType: { $first: '$fileType' },
                views: { $first: '$viewCount' },
                downloads: { $first: '$downloadCount' },
                uploadedBy: { $first: '$uploaderInfo.firstName' },
                uploadedAt: { $first: '$uploadedAt' }
              }
            },
            { $sort: { views: -1 } },
            { $limit: 10 }
          ]
        }
      }
    ]);

    return analytics[0];
  }

  /**
   * Get resource analytics
   */
  async getResourceAnalytics(start, end) {
    const matchStage = {
      createdAt: { $gte: new Date(start), $lte: new Date(end) }
    };

    const analytics = await Resource.aggregate([
      { $match: matchStage },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                available: {
                  $sum: { $cond: [{ $eq: ['$availabilityStatus', 'available'] }, 1, 0] }
                },
                assigned: {
                  $sum: { $cond: [{ $eq: ['$availabilityStatus', 'assigned'] }, 1, 0] }
                },
                inMaintenance: {
                  $sum: { $cond: [{ $eq: ['$availabilityStatus', 'maintenance'] }, 1, 0] }
                },
                totalValue: { $sum: '$depreciation.currentValue' }
              }
            }
          ],
          byType: [
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          byCategory: [
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          utilization: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                assigned: {
                  $sum: { $cond: [{ $eq: ['$availabilityStatus', 'assigned'] }, 1, 0] }
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
          maintenanceStatus: [
            { $match: { 'maintenance.nextMaintenance': { $exists: true } } },
            {
              $addFields: {
                daysUntilMaintenance: {
                  $divide: [
                    { $subtract: ['$maintenance.nextMaintenance', new Date()] },
                    1000 * 60 * 60 * 24
                  ]
                }
              }
            },
            {
              $bucket: {
                groupBy: '$daysUntilMaintenance',
                boundaries: [0, 7, 30, 90, 365],
                default: 'over_365',
                output: {
                  count: { $sum: 1 },
                  resources: { $push: { name: '$name', nextMaintenance: '$maintenance.nextMaintenance' } }
                }
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
                availabilityStatus: 1,
                lastMaintenance: '$maintenance.lastMaintenance'
              }
            }
          ]
        }
      }
    ]);

    return analytics[0];
  }

  /**
   * Get user analytics
   */
  async getUserAnalytics(start, end, department = null) {
    const matchStage = {
      createdAt: { $gte: new Date(start), $lte: new Date(end) }
    };

    if (department) {
      matchStage.department = department;
    }

    const analytics = await User.aggregate([
      { $match: matchStage },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
                inactive: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
                avgLoginCount: { $avg: '$loginCount' }
              }
            }
          ],
          byRole: [
            { $group: { _id: '$role', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          byDepartment: [
            { $group: { _id: '$department', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          byPosition: [
            { $group: { _id: '$position', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          activityTrend: [
            { $match: { lastLogin: { $exists: true } } },
            {
              $bucket: {
                groupBy: '$lastLogin',
                boundaries: [
                  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                  new Date(Date.now() - 24 * 60 * 60 * 1000),
                  new Date()
                ],
                default: 'inactive',
                output: {
                  count: { $sum: 1 },
                  users: { $push: { name: { $concat: ['$firstName', ' ', '$lastName'] }, email: '$email' } }
                }
              }
            }
          ],
          expertiseDistribution: [
            { $unwind: '$expertise' },
            { $group: { _id: '$expertise', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ]
        }
      }
    ]);

    return analytics[0];
  }

  /**
   * Get Key Performance Indicators (KPIs)
   */
  async getKPIs(start, end, department = null) {
    const [
      coverageStats,
      eventStats,
      assignmentStats,
      mediaStats,
      resourceStats,
      previousPeriodComparison
    ] = await Promise.all([
      this.getCoverageKPIs(start, end, department),
      this.getEventKPIs(start, end, department),
      this.getAssignmentKPIs(start, end, department),
      this.getMediaKPIs(start, end, department),
      this.getResourceKPIs(start, end),
      this.getPeriodComparison(start, end, department)
    ]);

    return {
      coverage: coverageStats,
      events: eventStats,
      assignments: assignmentStats,
      media: mediaStats,
      resources: resourceStats,
      comparison: previousPeriodComparison
    };
  }

  /**
   * Get coverage KPIs
   */
  async getCoverageKPIs(start, end, department = null) {
    const matchStage = {
      createdAt: { $gte: new Date(start), $lte: new Date(end) }
    };

    if (department) {
      const usersInDepartment = await User.find({ department }).select('_id');
      matchStage.requester = { $in: usersInDepartment.map(u => u._id) };
    }

    const stats = await CoverageRequest.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          approvedRequests: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          completedRequests: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          avgProcessingTime: {
            $avg: {
              $cond: [
                { $in: ['$status', ['approved', 'rejected', 'completed']] },
                { $divide: [
                  { $subtract: ['$updatedAt', '$createdAt'] },
                  1000 * 60 * 60
                ]},
                null
              ]
            }
          },
          slaComplianceRate: {
            $avg: {
              $cond: [
                { $and: [
                  { $eq: ['$status', 'completed'] },
                  { $lte: ['$completionDate', '$slaDeadline'] }
                ]},
                100,
                0
              ]
            }
          }
        }
      }
    ]);

    return stats[0] || {};
  }

  /**
   * Get event KPIs
   */
  async getEventKPIs(start, end, department = null) {
    const matchStage = {
      'schedule.start': { $gte: new Date(start), $lte: new Date(end) }
    };

    const stats = await Event.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'coveragerequests',
          localField: 'coverageRequest',
          foreignField: '_id',
          as: 'requestInfo'
        }
      },
      { $unwind: '$requestInfo' },
      {
        $lookup: {
          from: 'users',
          localField: 'requestInfo.requester',
          foreignField: '_id',
          as: 'requesterInfo'
        }
      },
      { $unwind: '$requesterInfo' },
      {
        $match: department ? { 'requesterInfo.department': department } : {}
      },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          completedEvents: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          onTimeCompletionRate: {
            $avg: {
              $cond: [
                { $and: [
                  { $eq: ['$status', 'completed'] },
                  { $lte: ['$actualTimings.finishedAt', '$schedule.end'] }
                ]},
                100,
                0
              ]
            }
          },
          avgEventDuration: {
            $avg: {
              $divide: [
                { $subtract: ['$schedule.end', '$schedule.start'] },
                1000 * 60 * 60
              ]
            }
          },
          incidentRate: {
            $avg: {
              $cond: [
                { $gt: [{ $size: '$incidents' }, 0] },
                100,
                0
              ]
            }
          }
        }
      }
    ]);

    return stats[0] || {};
  }

  /**
   * Get assignment KPIs
   */
  async getAssignmentKPIs(start, end, department = null) {
    const matchStage = {
      createdAt: { $gte: new Date(start), $lte: new Date(end) }
    };

    const stats = await Assignment.aggregate([
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
        $match: department ? { 'assigneeInfo.department': department } : {}
      },
      {
        $group: {
          _id: null,
          totalAssignments: { $sum: 1 },
          completedAssignments: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          acceptanceRate: {
            $avg: {
              $cond: [
                { $in: ['$status', ['accepted', 'in_progress', 'completed']] },
                100,
                0
              ]
            }
          },
          avgCompletionTime: {
            $avg: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                {
                  $divide: [
                    { $subtract: ['$schedule.end', '$schedule.start'] },
                    1000 * 60 * 60
                  ]
                },
                null
              ]
            }
          },
          avgQualityRating: { $avg: '$feedback.fromManager.rating' }
        }
      }
    ]);

    return stats[0] || {};
  }

  /**
   * Get media KPIs
   */
  async getMediaKPIs(start, end, department = null) {
    const matchStage = {
      uploadedAt: { $gte: new Date(start), $lte: new Date(end) }
    };

    const stats = await MediaFile.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'users',
          localField: 'uploadedBy',
          foreignField: '_id',
          as: 'uploaderInfo'
        }
      },
      { $unwind: '$uploaderInfo' },
      {
        $match: department ? { 'uploaderInfo.department': department } : {}
      },
      {
        $group: {
          _id: null,
          totalFiles: { $sum: 1 },
          totalStorageUsed: { $sum: '$size' },
          approvalRate: {
            $avg: {
              $cond: [{ $eq: ['$reviewStatus', 'approved'] }, 100, 0]
            }
          },
          avgReviewTime: {
            $avg: {
              $cond: [
                { $in: ['$reviewStatus', ['approved', 'rejected']] },
                {
                  $divide: [
                    {
                      $subtract: [
                        { $arrayElemAt: ['$reviewWorkflow.timestamp', -1] },
                        '$uploadedAt'
                      ]
                    },
                    1000 * 60 * 60
                  ]
                },
                null
              ]
            }
          },
          avgQualityScore: { $avg: '$qualityMetrics.overallRating' }
        }
      }
    ]);

    return stats[0] || {};
  }

  /**
   * Get resource KPIs
   */
  async getResourceKPIs(start, end) {
    const stats = await Resource.aggregate([
      {
        $group: {
          _id: null,
          totalResources: { $sum: 1 },
          utilizationRate: {
            $avg: {
              $cond: [
                { $eq: ['$availabilityStatus', 'assigned'] },
                100,
                0
              ]
            }
          },
          maintenanceCompliance: {
            $avg: {
              $cond: [
                { $and: [
                  { $ne: ['$maintenance.nextMaintenance', null] },
                  { $gt: ['$maintenance.nextMaintenance', new Date()] }
                ]},
                100,
                0
              ]
            }
          },
          totalAssetValue: { $sum: '$depreciation.currentValue' }
        }
      }
    ]);

    return stats[0] || {};
  }

  /**
   * Compare with previous period
   */
  async getPeriodComparison(start, end, department = null) {
    const periodDuration = end - start;
    const previousStart = new Date(start - periodDuration);
    const previousEnd = new Date(end - periodDuration);

    const [currentKPIs, previousKPIs] = await Promise.all([
      this.getKPIs(start, end, department),
      this.getKPIs(previousStart.getTime(), previousEnd.getTime(), department)
    ]);

    const comparisons = {};

    // Compare each KPI category
    Object.keys(currentKPIs).forEach(category => {
      if (category === 'comparison') return;

      comparisons[category] = {};
      Object.keys(currentKPIs[category]).forEach(kpi => {
        const current = currentKPIs[category][kpi] || 0;
        const previous = previousKPIs[category][kpi] || 0;
        
        comparisons[category][kpi] = {
          current,
          previous,
          change: previous !== 0 ? ((current - previous) / previous) * 100 : 0,
          trend: current > previous ? 'up' : current < previous ? 'down' : 'stable'
        };
      });
    });

    return comparisons;
  }

  /**
   * Generate insights and recommendations
   */
  async generateInsights(timeRange = 'last30days', department = null) {
    const analytics = await this.getDashboardAnalytics(timeRange, department);
    const insights = [];

    // Coverage insights
    if (analytics.coverage?.summary?.[0]) {
      const coverage = analytics.coverage.summary[0];
      const approvalRate = (coverage.approved / coverage.total) * 100;
      
      if (approvalRate < 60) {
        insights.push({
          type: 'warning',
          category: 'coverage',
          title: 'Low Approval Rate',
          description: `Only ${approvalRate.toFixed(1)}% of coverage requests are being approved. Consider reviewing request criteria or providing better guidance to requesters.`,
          priority: 'high',
          suggestedAction: 'Review approval criteria and provide training to requesters'
        });
      }

      if (coverage.avgProcessingTime > 24) {
        insights.push({
          type: 'warning',
          category: 'coverage',
          title: 'Slow Processing Time',
          description: `Average request processing time is ${coverage.avgProcessingTime.toFixed(1)} hours. Consider streamlining the approval workflow.`,
          priority: 'medium',
          suggestedAction: 'Implement parallel approvals for low-priority requests'
        });
      }
    }

    // Event insights
    if (analytics.events?.summary?.[0]) {
      const events = analytics.events.summary[0];
      const completionRate = (events.completed / events.total) * 100;
      
      if (completionRate < 80) {
        insights.push({
          type: 'warning',
          category: 'events',
          title: 'Low Event Completion Rate',
          description: `Only ${completionRate.toFixed(1)}% of scheduled events are being completed. Review event planning and resource allocation.`,
          priority: 'high',
          suggestedAction: 'Improve event planning and resource allocation processes'
        });
      }

      if (analytics.events.incidentAnalysis && analytics.events.incidentAnalysis.length > 0) {
        const topIncident = analytics.events.incidentAnalysis[0];
        insights.push({
          type: 'info',
          category: 'events',
          title: 'Common Incident Type',
          description: `${topIncident.count} incidents of type "${topIncident._id}" were reported. Average severity: ${topIncident.avgSeverity.toFixed(1)}/4.`,
          priority: 'low',
          suggestedAction: `Create preventive measures for ${topIncident._id} incidents`
        });
      }
    }

    // Assignment insights
    if (analytics.assignments?.summary?.[0]) {
      const assignments = analytics.assignments.summary[0];
      
      if (assignments.declined > assignments.total * 0.1) {
        insights.push({
          type: 'warning',
          category: 'assignments',
          title: 'High Assignment Decline Rate',
          description: `${((assignments.declined / assignments.total) * 100).toFixed(1)}% of assignments are being declined. Review workload distribution and assignment preferences.`,
          priority: 'medium',
          suggestedAction: 'Implement better workload balancing and assignment preferences'
        });
      }

      if (analytics.assignments.workloadDistribution) {
        const workload = analytics.assignments.workloadDistribution;
        const unevenWorkload = workload.some(w => w.activeAssignments > 5);
        
        if (unevenWorkload) {
          insights.push({
            type: 'warning',
            category: 'assignments',
            title: 'Uneven Workload Distribution',
            description: 'Some team members have significantly more active assignments than others.',
            priority: 'medium',
            suggestedAction: 'Redistribute assignments more evenly across the team'
          });
        }
      }
    }

    // Resource insights
    if (analytics.resources?.maintenanceStatus) {
      const overdueMaintenance = analytics.resources.maintenanceStatus.find(
        m => m._id === 0 || (m._id >= 0 && m._id < 7)
      );
      
      if (overdueMaintenance && overdueMaintenance.count > 0) {
        insights.push({
          type: 'critical',
          category: 'resources',
          title: 'Overdue Maintenance',
          description: `${overdueMaintenance.count} resources have overdue or imminent maintenance requirements.`,
          priority: 'high',
          suggestedAction: 'Schedule immediate maintenance for affected resources'
        });
      }
    }

    // Add positive insights if no issues found
    if (insights.length === 0) {
      insights.push({
        type: 'success',
        category: 'overall',
        title: 'All Systems Operational',
        description: 'All key metrics are within acceptable ranges. Current processes are effective.',
        priority: 'low',
        suggestedAction: 'Continue monitoring and maintain current practices'
      });
    }

    return insights;
  }
}

module.exports = new AnalyticsService();