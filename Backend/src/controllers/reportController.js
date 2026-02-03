const Report = require('../models/report');
const CoverageRequest = require('../models/coveragerequest');
const Event = require('../models/event');
const Assignment = require('../models/assignment');
const MediaFile = require('../models/mediafile');
const Resource = require('../models/resource');
const User = require('../models/user');
const { sendNotification } = require('../utils/notificationService');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// @desc    Generate coverage report
// @route   POST /api/reports/coverage
// @access  Private (Editor, Admin)
exports.generateCoverageReport = async (req, res) => {
  try {
    const {
      title = 'Coverage Report',
      period,
      filters = {},
      format = 'html'
    } = req.body;

    // Set default period if not provided
    const defaultPeriod = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      endDate: new Date(),
      timezone: 'Africa/Addis_Ababa'
    };

    const reportPeriod = period || defaultPeriod;

    // Create report record
    const report = await Report.create({
      title,
      type: 'coverage_metrics',
      generatedBy: req.user.id,
      period: reportPeriod,
      filters,
      format,
      status: 'generating'
    });

    // Generate report data in background
    process.nextTick(async () => {
      try {
        const startTime = Date.now();

        // Build query based on filters
        const query = {
          createdAt: {
            $gte: new Date(reportPeriod.startDate),
            $lte: new Date(reportPeriod.endDate)
          }
        };

        // Apply filters
        if (filters.departments && filters.departments.length > 0) {
          const usersInDepartments = await User.find({
            department: { $in: filters.departments }
          }).select('_id');
          
          query.requester = { $in: usersInDepartments.map(u => u._id) };
        }

        if (filters.categories && filters.categories.length > 0) {
          query.category = { $in: filters.categories };
        }

        if (filters.priorities && filters.priorities.length > 0) {
          query.priority = { $in: filters.priorities };
        }

        if (filters.statuses && filters.statuses.length > 0) {
          query.status = { $in: filters.statuses };
        }

        // Get coverage data
        const coverageData = await CoverageRequest.aggregate([
          { $match: query },
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
            $lookup: {
              from: 'events',
              localField: '_id',
              foreignField: 'coverageRequest',
              as: 'events'
            }
          },
          {
            $facet: {
              summary: [
                {
                  $group: {
                    _id: null,
                    totalRequests: { $sum: 1 },
                    totalApproved: {
                      $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                    },
                    totalCompleted: {
                      $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    averageProcessingTime: {
                      $avg: {
                        $cond: [
                          { $and: [
                            { $ne: ['$status', 'draft'] },
                            { $ne: ['$status', 'submitted'] }
                          ]},
                          { $divide: [
                            { $subtract: ['$updatedAt', '$createdAt'] },
                            1000 * 60 * 60 // Convert to hours
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
                    count: { $sum: 1 }
                  }
                },
                { $sort: { _id: 1 } }
              ],
              topRequesters: [
                {
                  $group: {
                    _id: '$requester',
                    name: { $first: '$requesterInfo.firstName' },
                    lastName: { $first: '$requesterInfo.lastName' },
                    department: { $first: '$requesterInfo.department' },
                    requestCount: { $sum: 1 },
                    approvedCount: {
                      $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                    }
                  }
                },
                { $sort: { requestCount: -1 } },
                { $limit: 10 }
              ],
              slaPerformance: [
                { $match: { slaDeadline: { $exists: true } } },
                {
                  $addFields: {
                    slaMet: {
                      $cond: [
                        { $and: [
                          { $eq: ['$status', 'completed'] },
                          { $lte: ['$completionDate', '$slaDeadline'] }
                        ]},
                        true,
                        false
                      ]
                    }
                  }
                },
                {
                  $group: {
                    _id: '$slaMet',
                    count: { $sum: 1 },
                    averageTime: {
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

        // Get event data
        const eventData = await Event.aggregate([
          {
            $match: {
              'schedule.start': {
                $gte: new Date(reportPeriod.startDate),
                $lte: new Date(reportPeriod.endDate)
              }
            }
          },
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
            $facet: {
              eventSummary: [
                {
                  $group: {
                    _id: null,
                    totalEvents: { $sum: 1 },
                    completedEvents: {
                      $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    averageDuration: {
                      $avg: {
                        $divide: [
                          { $subtract: ['$schedule.end', '$schedule.start'] },
                          1000 * 60 * 60
                        ]
                      }
                    }
                  }
                }
              ],
              eventsByStatus: [
                { $group: { _id: '$status', count: { $sum: 1 } } }
              ],
              eventsByCategory: [
                { $group: { _id: '$requestInfo.category', count: { $sum: 1 } } }
              ]
            }
          }
        ]);

        // Get assignment data
        const assignmentData = await Assignment.aggregate([
          {
            $match: {
              createdAt: {
                $gte: new Date(reportPeriod.startDate),
                $lte: new Date(reportPeriod.endDate)
              }
            }
          },
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
              assignmentSummary: [
                {
                  $group: {
                    _id: null,
                    totalAssignments: { $sum: 1 },
                    completedAssignments: {
                      $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    averageCompletionTime: {
                      $avg: {
                        $cond: [
                          { $eq: ['$status', 'completed'] },
                          {
                            $divide: [
                              { $subtract: ['$updatedAt', '$createdAt'] },
                              1000 * 60 * 60
                            ]
                          },
                          null
                        ]
                      }
                    }
                  }
                }
              ],
              assignmentsByStatus: [
                { $group: { _id: '$status', count: { $sum: 1 } } }
              ],
              assignmentsByRole: [
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
                    completedCount: { $sum: 1 },
                    averageRating: { $avg: '$feedback.fromManager.rating' }
                  }
                },
                { $sort: { completedCount: -1 } },
                { $limit: 10 }
              ]
            }
          }
        ]);

        // Compile report data
        const reportData = {
          summary: {
            period: reportPeriod,
            generatedAt: new Date(),
            generationTime: Date.now() - startTime
          },
          coverage: coverageData[0],
          events: eventData[0],
          assignments: assignmentData[0],
          insights: this.generateInsights(coverageData[0], eventData[0], assignmentData[0])
        };

        // Generate file based on format
        let fileUrl;
        let fileSize;

        if (format === 'excel') {
          const { url, size } = await this.generateExcelReport(reportData, report.reportId);
          fileUrl = url;
          fileSize = size;
        } else if (format === 'pdf') {
          const { url, size } = await this.generatePDFReport(reportData, report.reportId);
          fileUrl = url;
          fileSize = size;
        } else {
          // For HTML format, store data directly
          fileUrl = null;
          fileSize = JSON.stringify(reportData).length;
        }

        // Update report with data and file info
        report.data = reportData;
        report.fileUrl = fileUrl;
        report.fileSize = fileSize;
        report.status = 'completed';
        report.generationTime = Date.now() - startTime;

        await report.save();

        // Send notification to report generator
        await sendNotification({
          recipient: req.user.id,
          type: 'report_ready',
          title: 'Report Generated',
          message: `Your coverage report "${title}" has been generated successfully.`,
          data: {
            reportId: report.reportId,
            format,
            generationTime: report.generationTime
          }
        });

        // Log audit
        await AuditLog.create({
          action: 'generate',
          entity: 'report',
          entityId: report.reportId,
          user: req.user.id,
          userRole: req.user.role,
          details: {
            reportType: 'coverage_metrics',
            period: reportPeriod,
            filters,
            generationTime: report.generationTime
          }
        });

      } catch (error) {
        logger.error('Report generation error:', error);
        
        // Update report status to failed
        report.status = 'failed';
        report.data = { error: error.message };
        await report.save();
      }
    });

    res.status(202).json({
      success: true,
      data: {
        reportId: report.reportId,
        status: 'generating',
        message: 'Report generation started. You will be notified when it is ready.'
      }
    });

  } catch (error) {
    logger.error('Generate coverage report error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get all reports
// @route   GET /api/reports
// @access  Private
exports.getReports = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      generatedBy,
      startDate,
      endDate,
      search
    } = req.query;

    // Build query
    const query = {};

    // Filter by type
    if (type) {
      query.type = { $in: type.split(',') };
    }

    // Filter by status
    if (status) {
      query.status = { $in: status.split(',') };
    }

    // Filter by generatedBy
    if (generatedBy) {
      query.generatedBy = generatedBy;
    } else if (req.user.role !== 'admin') {
      // Non-admins can only see their own reports or public reports
      query.$or = [
        { generatedBy: req.user.id },
        { 'accessControl.isPublic': true },
        { 
          'accessControl.allowedUsers': req.user.id,
          'accessControl.allowedUsers.0': { $exists: true }
        },
        {
          'accessControl.allowedRoles': req.user.role,
          'accessControl.allowedRoles.0': { $exists: true }
        }
      ];
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
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { reportId: { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      Report.find(query)
        .populate('generatedBy', 'firstName lastName email')
        .populate('schedule.recipients', 'firstName lastName email')
        .populate('accessControl.allowedUsers', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Report.countDocuments(query)
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      data: reports,
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
    logger.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get single report
// @route   GET /api/reports/:id
// @access  Private
exports.getReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('generatedBy', 'firstName lastName email department')
      .populate('viewedBy.user', 'firstName lastName')
      .populate('downloadedBy.user', 'firstName lastName');

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    // Check access control
    const canAccess = this.checkReportAccess(report, req.user);
    if (!canAccess) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this report'
      });
    }

    // Record view
    const alreadyViewed = report.viewedBy.some(
      view => view.user.toString() === req.user.id
    );

    if (!alreadyViewed) {
      report.viewedBy.push({
        user: req.user.id,
        viewedAt: new Date()
      });
      await report.save();
    }

    res.status(200).json({
      success: true,
      data: report
    });

  } catch (error) {
    logger.error('Get report error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Download report
// @route   GET /api/reports/:id/download
// @access  Private
exports.downloadReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    // Check access control
    const canAccess = this.checkReportAccess(report, req.user);
    if (!canAccess) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to download this report'
      });
    }

    // Check if report has file
    if (!report.fileUrl && report.format !== 'html') {
      return res.status(404).json({
        success: false,
        error: 'Report file not available'
      });
    }

    // Record download
    const alreadyDownloaded = report.downloadedBy.some(
      download => download.user.toString() === req.user.id
    );

    if (!alreadyDownloaded) {
      report.downloadedBy.push({
        user: req.user.id,
        downloadedAt: new Date()
      });
      await report.save();
    }

    // Log audit
    await AuditLog.create({
      action: 'download',
      entity: 'report',
      entityId: report.reportId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        reportTitle: report.title,
        format: report.format,
        fileSize: report.fileSize
      }
    });

    // Return download information
    res.status(200).json({
      success: true,
      data: {
        downloadUrl: report.fileUrl,
        fileName: `${report.reportId}.${report.format}`,
        fileSize: report.fileSize,
        format: report.format,
        title: report.title
      },
      message: 'Download ready'
    });

  } catch (error) {
    logger.error('Download report error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Delete report
// @route   DELETE /api/reports/:id
// @access  Private (Admin, Report Owner)
exports.deleteReport = async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    // Check authorization
    const isOwner = report.generatedBy.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this report'
      });
    }

    // Store data for audit before deletion
    const reportData = report.toObject();

    // Delete report
    await report.deleteOne();

    // Log audit
    await AuditLog.create({
      action: 'delete',
      entity: 'report',
      entityId: reportData.reportId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        before: reportData
      }
    });

    res.status(200).json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    logger.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Create scheduled report
// @route   POST /api/reports/schedule
// @access  Private (Admin, Editor)
exports.scheduleReport = async (req, res) => {
  try {
    const {
      title,
      type,
      frequency,
      recipients,
      filters,
      format = 'pdf',
      nextRun
    } = req.body;

    // Validate frequency
    const validFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({
        success: false,
        error: `Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`
      });
    }

    // Calculate next run if not provided
    let nextRunDate = nextRun ? new Date(nextRun) : new Date();
    
    // Set to tomorrow for daily, next week for weekly, etc.
    switch (frequency) {
      case 'daily':
        nextRunDate.setDate(nextRunDate.getDate() + 1);
        break;
      case 'weekly':
        nextRunDate.setDate(nextRunDate.getDate() + 7);
        break;
      case 'monthly':
        nextRunDate.setMonth(nextRunDate.getMonth() + 1);
        break;
      case 'quarterly':
        nextRunDate.setMonth(nextRunDate.getMonth() + 3);
        break;
      case 'yearly':
        nextRunDate.setFullYear(nextRunDate.getFullYear() + 1);
        break;
    }

    // Set time to 6:00 AM
    nextRunDate.setHours(6, 0, 0, 0);

    // Create scheduled report
    const report = await Report.create({
      title,
      type,
      generatedBy: req.user.id,
      schedule: {
        isScheduled: true,
        frequency,
        nextRun: nextRunDate,
        recipients: recipients || [req.user.id]
      },
      filters,
      format,
      status: 'completed' // Will be regenerated on schedule
    });

    // Log audit
    await AuditLog.create({
      action: 'create',
      entity: 'report_schedule',
      entityId: report.reportId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        frequency,
        nextRun: nextRunDate,
        recipients: recipients?.length || 1
      }
    });

    res.status(201).json({
      success: true,
      data: report,
      message: `Report scheduled for ${frequency} generation`
    });

  } catch (error) {
    logger.error('Schedule report error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get report statistics
// @route   GET /api/reports/statistics
// @access  Private (Admin, Editor)
exports.getReportStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {};
    
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const statistics = await Report.aggregate([
      { $match: matchStage },
      {
        $facet: {
          totalReports: [{ $count: 'count' }],
          byType: [
            { $group: { _id: '$type', count: { $sum: 1 } } }
          ],
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ],
          byFormat: [
            { $group: { _id: '$format', count: { $sum: 1 } } }
          ],
          topGenerators: [
            {
              $lookup: {
                from: 'users',
                localField: 'generatedBy',
                foreignField: '_id',
                as: 'generatorInfo'
              }
            },
            { $unwind: '$generatorInfo' },
            {
              $group: {
                _id: '$generatedBy',
                name: { $first: '$generatorInfo.firstName' },
                lastName: { $first: '$generatorInfo.lastName' },
                department: { $first: '$generatorInfo.department' },
                reportCount: { $sum: 1 }
              }
            },
            { $sort: { reportCount: -1 } },
            { $limit: 10 }
          ],
          scheduledReports: [
            { $match: { 'schedule.isScheduled': true } },
            { $count: 'count' }
          ],
          usageStats: [
            {
              $project: {
                viewCount: { $size: '$viewedBy' },
                downloadCount: { $size: '$downloadedBy' },
                generationTime: 1
              }
            },
            {
              $group: {
                _id: null,
                totalViews: { $sum: '$viewCount' },
                totalDownloads: { $sum: '$downloadCount' },
                avgGenerationTime: { $avg: '$generationTime' },
                reportCount: { $sum: 1 }
              }
            },
            {
              $project: {
                avgViewsPerReport: { $divide: ['$totalViews', '$reportCount'] },
                avgDownloadsPerReport: { $divide: ['$totalDownloads', '$reportCount'] },
                avgGenerationTime: 1,
                totalViews: 1,
                totalDownloads: 1,
                reportCount: 1
              }
            }
          ],
          dailyTrend: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 },
                avgGenerationTime: { $avg: '$generationTime' }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: statistics[0]
    });

  } catch (error) {
    logger.error('Get report statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Generate resource utilization report
// @route   POST /api/reports/resources
// @access  Private (Admin, Editor)
exports.generateResourceReport = async (req, res) => {
  try {
    // Similar to generateCoverageReport but for resources
    // Implement resource-specific report generation
    res.status(200).json({
      success: true,
      message: 'Resource report generation endpoint'
    });

  } catch (error) {
    logger.error('Generate resource report error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Generate performance analytics report
// @route   POST /api/reports/performance
// @access  Private (Admin)
exports.generatePerformanceReport = async (req, res) => {
  try {
    // Similar to generateCoverageReport but for performance analytics
    // Implement performance-specific report generation
    res.status(200).json({
      success: true,
      message: 'Performance report generation endpoint'
    });

  } catch (error) {
    logger.error('Generate performance report error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// Helper function to generate Excel report
exports.generateExcelReport = async (reportData, reportId) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Coverage Report');

    // Add headers
    worksheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 }
    ];

    // Add summary data
    worksheet.addRow({ metric: 'Report Period', value: `${reportData.summary.period.startDate} to ${reportData.summary.period.endDate}` });
    worksheet.addRow({ metric: 'Generated At', value: reportData.summary.generatedAt.toLocaleString() });
    worksheet.addRow({ metric: 'Generation Time', value: `${reportData.summary.generationTime}ms` });
    worksheet.addRow({}); // Empty row

    // Add coverage summary
    if (reportData.coverage.summary && reportData.coverage.summary.length > 0) {
      worksheet.addRow({ metric: 'COVERAGE SUMMARY', value: '' }).font = { bold: true };
      const summary = reportData.coverage.summary[0];
      worksheet.addRow({ metric: 'Total Requests', value: summary.totalRequests });
      worksheet.addRow({ metric: 'Approved Requests', value: summary.totalApproved });
      worksheet.addRow({ metric: 'Completed Requests', value: summary.totalCompleted });
      worksheet.addRow({ metric: 'Average Processing Time (hours)', value: summary.averageProcessingTime?.toFixed(2) || 'N/A' });
      worksheet.addRow({});
    }

    // Save to file
    const fileName = `reports/${reportId}.xlsx`;
    const filePath = path.join(__dirname, '../../', fileName);
    
    // Ensure directory exists
    const fs = require('fs');
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await workbook.xlsx.writeFile(filePath);

    // Return file info
    const stats = fs.statSync(filePath);
    return {
      url: `/reports/${reportId}.xlsx`,
      size: stats.size
    };

  } catch (error) {
    logger.error('Generate Excel report error:', error);
    throw error;
  }
};

// Helper function to generate PDF report
exports.generatePDFReport = async (reportData, reportId) => {
  try {
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    
    const fileName = `reports/${reportId}.pdf`;
    const filePath = path.join(__dirname, '../../', fileName);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create PDF document
    const doc = new PDFDocument();
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Add content to PDF
    doc.fontSize(20).text('Coverage Report', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(12).text(`Period: ${reportData.summary.period.startDate} to ${reportData.summary.period.endDate}`);
    doc.text(`Generated: ${reportData.summary.generatedAt.toLocaleString()}`);
    doc.moveDown();

    // Add summary
    if (reportData.coverage.summary && reportData.coverage.summary.length > 0) {
      doc.fontSize(14).text('Summary', { underline: true });
      const summary = reportData.coverage.summary[0];
      doc.fontSize(10).text(`Total Requests: ${summary.totalRequests}`);
      doc.text(`Approved Requests: ${summary.totalApproved}`);
      doc.text(`Completed Requests: ${summary.totalCompleted}`);
      doc.moveDown();
    }

    // End and close
    doc.end();

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        const stats = fs.statSync(filePath);
        resolve({
          url: `/reports/${reportId}.pdf`,
          size: stats.size
        });
      });

      writeStream.on('error', reject);
    });

  } catch (error) {
    logger.error('Generate PDF report error:', error);
    throw error;
  }
};

// Helper function to generate insights
exports.generateInsights = (coverageData, eventData, assignmentData) => {
  const insights = [];

  // Coverage insights
  if (coverageData.summary && coverageData.summary.length > 0) {
    const summary = coverageData.summary[0];
    
    // Approval rate insight
    const approvalRate = (summary.totalApproved / summary.totalRequests) * 100;
    if (approvalRate < 60) {
      insights.push({
        type: 'negative',
        text: `Low approval rate: ${approvalRate.toFixed(1)}%. Consider reviewing request criteria.`,
        metric: 'approval_rate',
        value: approvalRate
      });
    } else if (approvalRate > 90) {
      insights.push({
        type: 'positive',
        text: `High approval rate: ${approvalRate.toFixed(1)}%. Good alignment with coverage needs.`,
        metric: 'approval_rate',
        value: approvalRate
      });
    }

    // Processing time insight
    if (summary.averageProcessingTime > 24) {
      insights.push({
        type: 'negative',
        text: `High average processing time: ${summary.averageProcessingTime.toFixed(1)} hours. Consider streamlining approval workflow.`,
        metric: 'processing_time',
        value: summary.averageProcessingTime
      });
    }
  }

  // Event insights
  if (eventData.eventSummary && eventData.eventSummary.length > 0) {
    const eventSummary = eventData.eventSummary[0];
    
    // Completion rate insight
    const completionRate = (eventSummary.completedEvents / eventSummary.totalEvents) * 100;
    if (completionRate < 80) {
      insights.push({
        type: 'negative',
        text: `Low event completion rate: ${completionRate.toFixed(1)}%. Review event planning and resource allocation.`,
        metric: 'event_completion_rate',
        value: completionRate
      });
    }
  }

  // Assignment insights
  if (assignmentData.assignmentSummary && assignmentData.assignmentSummary.length > 0) {
    const assignmentSummary = assignmentData.assignmentSummary[0];
    
    // Completion rate insight
    const assignmentCompletionRate = (assignmentSummary.completedAssignments / assignmentSummary.totalAssignments) * 100;
    if (assignmentCompletionRate < 70) {
      insights.push({
        type: 'negative',
        text: `Low assignment completion rate: ${assignmentCompletionRate.toFixed(1)}%. Review assignment workload and support.`,
        metric: 'assignment_completion_rate',
        value: assignmentCompletionRate
      });
    }
  }

  // Add recommendation
  if (insights.length === 0) {
    insights.push({
      type: 'positive',
      text: 'All metrics are within acceptable ranges. Continue current practices.',
      metric: 'overall_performance',
      value: 'good'
    });
  } else {
    insights.push({
      type: 'recommendation',
      text: 'Review detailed metrics and consider process improvements where indicated.',
      metric: 'recommendation',
      value: 'process_review'
    });
  }

  return insights;
};

// Helper function to check report access
exports.checkReportAccess = (report, user) => {
  // Admin can access all reports
  if (user.role === 'admin') {
    return true;
  }

  // Report owner can access
  if (report.generatedBy.toString() === user.id) {
    return true;
  }

  // Check public access
  if (report.accessControl?.isPublic) {
    return true;
  }

  // Check allowed users
  if (report.accessControl?.allowedUsers?.some(u => u.toString() === user.id)) {
    return true;
  }

  // Check allowed roles
  if (report.accessControl?.allowedRoles?.includes(user.role)) {
    return true;
  }

  return false;
};
