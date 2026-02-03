const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../config/cloudinary');
const logger = require('./logger');

// Ensure upload directories exist
const createUploadDirectories = () => {
  const directories = [
    'uploads/temp',
    'uploads/images',
    'uploads/videos',
    'uploads/audio',
    'uploads/documents'
  ];

  directories.forEach(dir => {
    const dirPath = path.join(__dirname, '../../', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });
};

createUploadDirectories();

// Configure multer for local storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/temp';
    
    if (file.mimetype.startsWith('image/')) {
      uploadPath = 'uploads/images';
    } else if (file.mimetype.startsWith('video/')) {
      uploadPath = 'uploads/videos';
    } else if (file.mimetype.startsWith('audio/')) {
      uploadPath = 'uploads/audio';
    } else {
      uploadPath = 'uploads/documents';
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100MB default
    files: 10 // Maximum number of files
  }
});

/**
 * Upload file to Cloudinary
 */
const uploadToCloudinary = async (filePath, options = {}) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'amhara-media',
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true,
      ...options
    });

    // Delete local file after successful upload
    fs.unlinkSync(filePath);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      duration: result.duration
    };
  } catch (error) {
    logger.error('Cloudinary upload error:', error);
    throw error;
  }
};

/**
 * Upload multiple files
 */
const uploadMultipleToCloudinary = async (files) => {
  const uploadPromises = files.map(file => uploadToCloudinary(file.path));
  return Promise.all(uploadPromises);
};

/**
 * Generate thumbnail for video
 */
const generateThumbnail = async (videoUrl) => {
  try {
    // This would require ffmpeg or similar library
    // For now, return a placeholder
    return `${videoUrl.replace(/\.(mp4|mov|avi)$/, '')}_thumb.jpg`;
  } catch (error) {
    logger.error('Thumbnail generation error:', error);
    return null;
  }
};

/**
 * Extract metadata from file
 */
const extractFileMetadata = (file) => {
  const metadata = {
    originalName: file.originalname,
    fileName: file.filename,
    mimeType: file.mimetype,
    size: file.size,
    path: file.path
  };

  // Extract extension
  metadata.extension = path.extname(file.originalname).toLowerCase();

  // Add additional metadata based on file type
  if (file.mimetype.startsWith('image/')) {
    metadata.type = 'photo';
  } else if (file.mimetype.startsWith('video/')) {
    metadata.type = 'video';
  } else if (file.mimetype.startsWith('audio/')) {
    metadata.type = 'audio';
  } else {
    metadata.type = 'document';
  }

  return metadata;
};

/**
 * Validate file before upload
 */
const validateFile = (file, maxSizeMB = 100) => {
  const errors = [];

  // Check file size
  const maxSize = maxSizeMB * 1024 * 1024;
  if (file.size > maxSize) {
    errors.push(`File size exceeds ${maxSizeMB}MB limit`);
  }

  // Check file type
  const allowedTypes = process.env.ALLOWED_FILE_TYPES
    ? process.env.ALLOWED_FILE_TYPES.split(',')
    : [
        'image/jpeg',
        'image/png',
        'image/gif',
        'video/mp4',
        'video/mpeg',
        'audio/mpeg',
        'application/pdf'
      ];

  if (!allowedTypes.includes(file.mimetype)) {
    errors.push(`File type ${file.mimetype} not allowed`);
  }

  // Check filename for malicious patterns
  const maliciousPatterns = /\.(exe|bat|cmd|sh|php|js|html|htm)$/i;
  if (maliciousPatterns.test(file.originalname)) {
    errors.push('File type not allowed for security reasons');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Clean up temporary files
 */
const cleanupTempFiles = (files) => {
  files.forEach(file => {
    if (fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (error) {
        logger.error(`Error deleting temp file ${file.path}:`, error);
      }
    }
  });
};

module.exports = {
  upload,
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  generateThumbnail,
  extractFileMetadata,
  validateFile,
  cleanupTempFiles,
  storage
};