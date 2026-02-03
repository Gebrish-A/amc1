const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../utils/upload').upload;

// Apply protection to all routes
router.use(protect);

// Get all media files
router.get('/', mediaController.getMediaFiles);

// Get media statistics
router.get('/statistics', 
  authorize('editor', 'admin'),
  mediaController.getMediaStatistics
);

// Upload single media file
router.post('/upload', 
  authorize('reporter', 'crew', 'editor', 'admin'),
  upload.single('file'),
  mediaController.uploadMedia
);

// Upload multiple media files
router.post('/upload-multiple', 
  authorize('reporter', 'crew', 'editor', 'admin'),
  upload.array('files', 10),
  mediaController.uploadMultipleMedia
);

// Get single media file
router.get('/:id', mediaController.getMediaFile);

// Update media file
router.put('/:id', 
  authorize('reporter', 'crew', 'editor', 'admin'),
  mediaController.updateMediaFile
);

// Delete media file
router.delete('/:id', 
  authorize('reporter', 'crew', 'editor', 'admin'),
  mediaController.deleteMediaFile
);

// Review media file
router.post('/:id/review', 
  authorize('editor', 'admin'),
  mediaController.reviewMediaFile
);

// Download media file
router.get('/:id/download', mediaController.downloadMediaFile);

module.exports = router;