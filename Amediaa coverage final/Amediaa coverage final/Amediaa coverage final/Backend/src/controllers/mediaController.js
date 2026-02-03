const MediaFile = require('../models/mediafile');
const Assignment = require('../models/assignment');
const User = require('../models/user');
const { uploadToCloudinary, uploadMultipleToCloudinary, extractFileMetadata, validateFile, cleanupTempFiles } = require('../utils/upload');
const { sendNotification } = require('../utils/notificationService');
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');
const path = require('path');

// @desc    Upload media file
// @route   POST /api/media/upload
// @access  Private (Reporter, Crew, Editor, Admin)
exports.uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { assignment, fileType, description, tags } = req.body;

    // Validate required fields
    if (!assignment) {
      return res.status(400).json({
        success: false,
        error: 'Assignment ID is required'
      });
    }

    // Get assignment
    const assignmentDoc = await Assignment.findById(assignment)
      .populate('event', 'title eventId')
      .populate('assignee', 'firstName lastName');

    if (!assignmentDoc) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    // Check if user is authorized to upload for this assignment
    const isAssignee = assignmentDoc.assignee._id.toString() === req.user.id;
    const isEditorOrAdmin = ['editor', 'admin'].includes(req.user.role);

    if (!isAssignee && !isEditorOrAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to upload media for this assignment'
      });
    }

    // Validate file
    const validation = validateFile(req.file);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'File validation failed',
        details: validation.errors
      });
    }

    // Extract metadata
    const metadata = extractFileMetadata(req.file);

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.path, {
      resource_type: fileType === 'video' ? 'video' : 'image',
      folder: `amhara-media/assignments/${assignment}`,
      use_filename: true,
      unique_filename: true,
      overwrite: false
    });

    // Create media file record
    const mediaFile = await MediaFile.create({
      originalName: req.file.originalname,
      fileName: metadata.fileName,
      fileType: fileType || metadata.type,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: uploadResult.url,
      cloudinaryId: uploadResult.publicId,
      assignment,
      uploadedBy: req.user.id,
      description,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      metadata: {
        location: req.body.location ? JSON.parse(req.body.location) : null,
        deviceInfo: req.body.deviceInfo ? JSON.parse(req.body.deviceInfo) : null,
        dimensions: uploadResult.width && uploadResult.height ? {
          width: uploadResult.width,
          height: uploadResult.height
        } : null,
        duration: uploadResult.duration || null
      },
      reviewStatus: 'pending'
    });

    // Update assignment with media reference
    assignmentDoc.progressUpdates.push({
      type: 'media',
      content: `Uploaded ${fileType || metadata.type}: ${req.file.originalname}`,
      mediaUrl: uploadResult.url,
      timestamp: new Date()
    });

    await assignmentDoc.save();

    // Send notification to editors for review
    const editors = await User.find({
      role: { $in: ['editor', 'admin'] },
      isActive: true,
      department: assignmentDoc.assignee.department
    }).select('_id');

    for (const editor of editors) {
      await sendNotification({
        recipient: editor._id,
        type: 'content_uploaded',
        title: 'New Media Uploaded for Review',
        message: `New ${fileType || metadata.type} uploaded for assignment "${assignmentDoc.event.title}"`,
        data: {
          mediaFileId: mediaFile.fileId,
          assignmentId: assignmentDoc.assignmentId,
          eventId: assignmentDoc.event.eventId,
          uploadedBy: req.user.id,
          fileType: mediaFile.fileType,
          description
        }
      });
    }

    // Log audit
    await AuditLog.create({
      action: 'upload',
      entity: 'media_file',
      entityId: mediaFile.fileId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        assignmentId: assignmentDoc.assignmentId,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: mediaFile.fileType
      }
    });

    res.status(201).json({
      success: true,
      data: mediaFile,
      message: 'Media uploaded successfully'
    });

  } catch (error) {
    logger.error('Upload media error:', error);
    
    // Clean up temporary file if it exists
    if (req.file && req.file.path) {
      cleanupTempFiles([req.file]);
    }

    res.status(500).json({
      success: false,
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Upload multiple media files
// @route   POST /api/media/upload-multiple
// @access  Private (Reporter, Crew, Editor, Admin)
exports.uploadMultipleMedia = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded'
      });
    }

    const { assignment, fileType, description, tags } = req.body;

    // Validate required fields
    if (!assignment) {
      cleanupTempFiles(req.files);
      return res.status(400).json({
        success: false,
        error: 'Assignment ID is required'
      });
    }

    // Get assignment
    const assignmentDoc = await Assignment.findById(assignment)
      .populate('event', 'title eventId')
      .populate('assignee', 'firstName lastName');

    if (!assignmentDoc) {
      cleanupTempFiles(req.files);
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    // Check if user is authorized
    const isAssignee = assignmentDoc.assignee._id.toString() === req.user.id;
    const isEditorOrAdmin = ['editor', 'admin'].includes(req.user.role);

    if (!isAssignee && !isEditorOrAdmin) {
      cleanupTempFiles(req.files);
      return res.status(403).json({
        success: false,
        error: 'Not authorized to upload media for this assignment'
      });
    }

    // Validate all files
    const validationResults = req.files.map(file => validateFile(file));
    const invalidFiles = validationResults.filter(result => !result.isValid);

    if (invalidFiles.length > 0) {
      cleanupTempFiles(req.files);
      return res.status(400).json({
        success: false,
        error: 'Some files failed validation',
        invalidFiles: invalidFiles.map((result, index) => ({
          fileName: req.files[index].originalname,
          errors: result.errors
        }))
      });
    }

    // Upload all files to Cloudinary
    const uploadResults = await uploadMultipleToCloudinary(req.files);

    // Create media file records
    const mediaFiles = await Promise.all(
      uploadResults.map(async (result, index) => {
        const file = req.files[index];
        const metadata = extractFileMetadata(file);

        return await MediaFile.create({
          originalName: file.originalname,
          fileName: metadata.fileName,
          fileType: fileType || metadata.type,
          mimeType: file.mimetype,
          size: file.size,
          url: result.url,
          cloudinaryId: result.publicId,
          assignment,
          uploadedBy: req.user.id,
          description: description || `Uploaded ${file.originalname}`,
          tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
          metadata: {
            dimensions: result.width && result.height ? {
              width: result.width,
              height: result.height
            } : null,
            duration: result.duration || null
          },
          reviewStatus: 'pending'
        });
      })
    );

    // Update assignment
    assignmentDoc.progressUpdates.push({
      type: 'media',
      content: `Uploaded ${mediaFiles.length} files`,
      timestamp: new Date(),
      isImportant: true
    });

    await assignmentDoc.save();

    // Send notification to editors
    const editors = await User.find({
      role: { $in: ['editor', 'admin'] },
      isActive: true,
      department: assignmentDoc.assignee.department
    }).select('_id');

    for (const editor of editors) {
      await sendNotification({
        recipient: editor._id,
        type: 'content_uploaded',
        title: 'Multiple Media Files Uploaded',
        message: `${mediaFiles.length} files uploaded for assignment "${assignmentDoc.event.title}"`,
        data: {
          assignmentId: assignmentDoc.assignmentId,
          eventId: assignmentDoc.event.eventId,
          fileCount: mediaFiles.length,
          uploadedBy: req.user.id
        }
      });
    }

    // Log audit
    await AuditLog.create({
      action: 'upload',
      entity: 'media_file',
      entityId: 'batch_upload',
      user: req.user.id,
      userRole: req.user.role,
      details: {
        assignmentId: assignmentDoc.assignmentId,
        fileCount: mediaFiles.length,
        fileNames: mediaFiles.map(mf => mf.originalName)
      }
    });

    res.status(201).json({
      success: true,
      data: mediaFiles,
      message: `${mediaFiles.length} files uploaded successfully`
    });

  } catch (error) {
    logger.error('Upload multiple media error:', error);
    
    // Clean up temporary files
    if (req.files && req.files.length > 0) {
      cleanupTempFiles(req.files);
    }

    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get all media files
// @route   GET /api/media
// @access  Private
exports.getMediaFiles = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'uploadedAt',
      sortOrder = 'desc',
      fileType,
      reviewStatus,
      assignment,
      uploadedBy,
      startDate,
      endDate,
      search,
      tags
    } = req.query;

    // Build query
    const query = {};

    // Role-based filtering
    if (req.user.role === 'reporter' || req.user.role === 'crew') {
      // Can only see their own uploaded files or files from their assignments
      const userAssignments = await Assignment.find({ assignee: req.user.id }).select('_id');
      query.$or = [
        { uploadedBy: req.user.id },
        { assignment: { $in: userAssignments.map(a => a._id) } }
      ];
    }

    // Filter by file type
    if (fileType) {
      query.fileType = { $in: fileType.split(',') };
    }

    // Filter by review status
    if (reviewStatus) {
      query.reviewStatus = { $in: reviewStatus.split(',') };
    }

    // Filter by assignment
    if (assignment) {
      query.assignment = assignment;
    }

    // Filter by uploaded by
    if (uploadedBy) {
      query.uploadedBy = uploadedBy;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.uploadedAt = {};
      if (startDate) query.uploadedAt.$gte = new Date(startDate);
      if (endDate) query.uploadedAt.$lte = new Date(endDate);
    }

    // Filter by tags
    if (tags) {
      query.tags = { $all: tags.split(',').map(tag => tag.trim()) };
    }

    // Text search
    if (search) {
      query.$or = [
        { originalName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'transcript.text': { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [mediaFiles, total] = await Promise.all([
      MediaFile.find(query)
        .populate('assignment', 'assignmentId')
        .populate('uploadedBy', 'firstName lastName email')
        .populate('reviewWorkflow.reviewer', 'firstName lastName')
        .populate('assignment.event', 'title eventId')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      MediaFile.countDocuments(query)
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      data: mediaFiles,
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
    logger.error('Get media files error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get single media file
// @route   GET /api/media/:id
// @access  Private
exports.getMediaFile = async (req, res) => {
  try {
    const mediaFile = await MediaFile.findById(req.params.id)
      .populate('assignment', 'assignmentId event assignee')
      .populate('uploadedBy', 'firstName lastName email phone department')
      .populate('reviewWorkflow.reviewer', 'firstName lastName email')
      .populate('relatedFiles', 'originalName fileType url')
      .populate({
        path: 'assignment',
        populate: {
          path: 'event',
          select: 'title eventId schedule'
        }
      });

    if (!mediaFile) {
      return res.status(404).json({
        success: false,
        error: 'Media file not found'
      });
    }

    // Check authorization
    const isUploader = mediaFile.uploadedBy._id.toString() === req.user.id;
    const isEditorOrAdmin = ['editor', 'admin'].includes(req.user.role);
    
    // Check if user is assignee for this media file's assignment
    let isAssignee = false;
    if (mediaFile.assignment && mediaFile.assignment.assignee) {
      isAssignee = mediaFile.assignment.assignee.toString() === req.user.id;
    }

    if (!isUploader && !isAssignee && !isEditorOrAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this media file'
      });
    }

    // Increment view count
    mediaFile.viewCount += 1;
    await mediaFile.save();

    res.status(200).json({
      success: true,
      data: mediaFile
    });

  } catch (error) {
    logger.error('Get media file error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Update media file
// @route   PUT /api/media/:id
// @access  Private (Uploader, Editor, Admin)
exports.updateMediaFile = async (req, res) => {
  try {
    const mediaFile = await MediaFile.findById(req.params.id);

    if (!mediaFile) {
      return res.status(404).json({
        success: false,
        error: 'Media file not found'
      });
    }

    // Check authorization
    const isUploader = mediaFile.uploadedBy.toString() === req.user.id;
    const isEditorOrAdmin = ['editor', 'admin'].includes(req.user.role);

    if (!isUploader && !isEditorOrAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this media file'
      });
    }

    // Store old data for audit
    const oldData = { ...mediaFile.toObject() };

    const updates = {};
    const allowedFields = [
      'description', 'tags', 'categories', 'usageRights', 'transcript'
    ];

    // Filter allowed fields
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Update media file
    Object.assign(mediaFile, updates);
    await mediaFile.save();

    // Log audit
    await AuditLog.create({
      action: 'update',
      entity: 'media_file',
      entityId: mediaFile.fileId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        before: oldData,
        after: mediaFile.toObject(),
        changes: this.calculateChanges(oldData, updates)
      }
    });

    res.status(200).json({
      success: true,
      data: mediaFile,
      message: 'Media file updated successfully'
    });

  } catch (error) {
    logger.error('Update media file error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Delete media file
// @route   DELETE /api/media/:id
// @access  Private (Uploader, Editor, Admin)
exports.deleteMediaFile = async (req, res) => {
  try {
    const mediaFile = await MediaFile.findById(req.params.id);

    if (!mediaFile) {
      return res.status(404).json({
        success: false,
        error: 'Media file not found'
      });
    }

    // Check authorization
    const isUploader = mediaFile.uploadedBy.toString() === req.user.id;
    const isEditorOrAdmin = ['editor', 'admin'].includes(req.user.role);

    if (!isUploader && !isEditorOrAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this media file'
      });
    }

    // Check if file is approved (might need special permission to delete)
    if (mediaFile.reviewStatus === 'approved' && !isEditorOrAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Approved media files can only be deleted by editors or admins'
      });
    }

    // Store data for audit before deletion
    const mediaFileData = mediaFile.toObject();

    // Delete from Cloudinary (optional - might want to keep for audit)
    // const cloudinary = require('../config/cloudinary');
    // await cloudinary.uploader.destroy(mediaFile.cloudinaryId);

    // Delete from database
    await mediaFile.deleteOne();

    // Log audit
    await AuditLog.create({
      action: 'delete',
      entity: 'media_file',
      entityId: mediaFileData.fileId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        before: mediaFileData
      }
    });

    res.status(200).json({
      success: true,
      message: 'Media file deleted successfully'
    });

  } catch (error) {
    logger.error('Delete media file error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Review media file
// @route   POST /api/media/:id/review
// @access  Private (Editor, Admin)
exports.reviewMediaFile = async (req, res) => {
  try {
    const { action, comments, version } = req.body;

    const mediaFile = await MediaFile.findById(req.params.id)
      .populate('uploadedBy', 'firstName lastName email')
      .populate('assignment', 'assignmentId event assignee');

    if (!mediaFile) {
      return res.status(404).json({
        success: false,
        error: 'Media file not found'
      });
    }

    // Check if user is editor or admin
    if (!['editor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only editors and admins can review media files'
      });
    }

    // Add to review workflow
    const reviewEntry = {
      reviewer: req.user.id,
      action,
      comments,
      timestamp: new Date(),
      version: version || mediaFile.currentVersion
    };

    mediaFile.reviewWorkflow.push(reviewEntry);

    // Update review status based on action
    let newStatus;
    let notificationMessage;

    switch (action) {
      case 'approved':
        newStatus = 'approved';
        notificationMessage = `Your media file has been approved${comments ? ': ' + comments : ''}`;
        break;
      case 'rejected':
        newStatus = 'rejected';
        notificationMessage = `Your media file requires changes${comments ? ': ' + comments : ''}`;
        break;
      case 'requested_revision':
        newStatus = 'needs_revision';
        notificationMessage = `Revisions requested for your media file${comments ? ': ' + comments : ''}`;
        break;
      default:
        newStatus = 'under_review';
        notificationMessage = `Your media file has been reviewed${comments ? ': ' + comments : ''}`;
    }

    mediaFile.reviewStatus = newStatus;

    // If requesting revision, increment version
    if (action === 'requested_revision') {
      mediaFile.currentVersion += 1;
      mediaFile.versions.push({
        version: mediaFile.currentVersion,
        fileId: mediaFile.fileId,
        url: mediaFile.url,
        uploadedAt: new Date(),
        changes: `Revision requested: ${comments}`
      });
    }

    await mediaFile.save();

    // Send notification to uploader
    await sendNotification({
      recipient: mediaFile.uploadedBy._id,
      type: 'content_reviewed',
      title: 'Media File Reviewed',
      message: notificationMessage,
      data: {
        mediaFileId: mediaFile.fileId,
        originalName: mediaFile.originalName,
        action,
        comments,
        reviewer: req.user.id,
        newStatus
      }
    });

    // Log audit
    await AuditLog.create({
      action: 'review',
      entity: 'media_file',
      entityId: mediaFile.fileId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        action,
        comments,
        newStatus,
        version: mediaFile.currentVersion
      }
    });

    res.status(200).json({
      success: true,
      data: {
        reviewEntry,
        newStatus,
        currentVersion: mediaFile.currentVersion
      },
      message: 'Review submitted successfully'
    });

  } catch (error) {
    logger.error('Review media file error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Download media file
// @route   GET /api/media/:id/download
// @access  Private
exports.downloadMediaFile = async (req, res) => {
  try {
    const mediaFile = await MediaFile.findById(req.params.id);

    if (!mediaFile) {
      return res.status(404).json({
        success: false,
        error: 'Media file not found'
      });
    }

    // Check authorization
    const isUploader = mediaFile.uploadedBy.toString() === req.user.id;
    const isEditorOrAdmin = ['editor', 'admin'].includes(req.user.role);
    
    // Check if user is assignee for this media file's assignment
    let isAssignee = false;
    if (mediaFile.assignment) {
      const assignment = await Assignment.findById(mediaFile.assignment);
      if (assignment && assignment.assignee.toString() === req.user.id) {
        isAssignee = true;
      }
    }

    if (!isUploader && !isAssignee && !isEditorOrAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to download this media file'
      });
    }

    // Check if file is approved (only approved files can be downloaded by non-editors)
    if (mediaFile.reviewStatus !== 'approved' && !isEditorOrAdmin && !isUploader) {
      return res.status(403).json({
        success: false,
        error: 'Only approved media files can be downloaded'
      });
    }

    // Increment download count
    mediaFile.downloadCount += 1;
    await mediaFile.save();

    // Log audit
    await AuditLog.create({
      action: 'download',
      entity: 'media_file',
      entityId: mediaFile.fileId,
      user: req.user.id,
      userRole: req.user.role,
      details: {
        fileName: mediaFile.originalName,
        fileSize: mediaFile.size,
        downloadCount: mediaFile.downloadCount
      }
    });

    // Redirect to Cloudinary URL or serve file
    res.status(200).json({
      success: true,
      data: {
        downloadUrl: mediaFile.url,
        fileName: mediaFile.originalName,
        fileSize: mediaFile.size,
        mimeType: mediaFile.mimeType
      },
      message: 'Download ready'
    });

  } catch (error) {
    logger.error('Download media file error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// @desc    Get media statistics
// @route   GET /api/media/statistics
// @access  Private (Editor, Admin)
exports.getMediaStatistics = async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;

    const matchStage = {};
    
    if (startDate || endDate) {
      matchStage.uploadedAt = {};
      if (startDate) matchStage.uploadedAt.$gte = new Date(startDate);
      if (endDate) matchStage.uploadedAt.$lte = new Date(endDate);
    }

    const statistics = await MediaFile.aggregate([
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
        $facet: {
          totalFiles: [{ $count: 'count' }],
          byFileType: [
            { $group: { _id: '$fileType', count: { $sum: 1 }, totalSize: { $sum: '$size' } } }
          ],
          byReviewStatus: [
            { $group: { _id: '$reviewStatus', count: { $sum: 1 } } }
          ],
          byDepartment: [
            { 
              $group: { 
                _id: '$uploaderInfo.department', 
                count: { $sum: 1 },
                totalSize: { $sum: '$size' }
              } 
            }
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
                approvedCount: {
                  $sum: { $cond: [{ $eq: ['$reviewStatus', 'approved'] }, 1, 0] }
                }
              }
            },
            { $sort: { fileCount: -1 } },
            { $limit: 10 }
          ],
          storageUsage: [
            {
              $group: {
                _id: null,
                totalSize: { $sum: '$size' },
                averageSize: { $avg: '$size' },
                fileCount: { $sum: 1 }
              }
            },
            {
              $project: {
                totalSizeGB: { $divide: ['$totalSize', 1024 * 1024 * 1024] },
                averageSizeMB: { $divide: ['$averageSize', 1024 * 1024] },
                fileCount: 1
              }
            }
          ],
          dailyUploadTrend: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$uploadedAt' } },
                count: { $sum: 1 },
                totalSize: { $sum: '$size' }
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
    logger.error('Get media statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
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
