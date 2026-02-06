const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const multer = require('multer');
const Request = require('../models/request'); // ✅ ADD THIS LINE

// ✅ SIMPLE MULTER CONFIGURATION (no disk storage, just parsing)
const upload = multer({
    storage: multer.memoryStorage(), // ✅ Store in memory, then save to MongoDB
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

// ✅ CREATE NEW REQUEST (handles FormData with files)
router.post('/', upload.any(), (req, res) => {
  console.log('🟢 ROUTE HIT: /api/requests');
  console.log('📦 req.body:', req.body);
  console.log('📦 req.files:', req.files);
  
  // Process files and text fields
  const processedData = {
    ...req.body,
    files: req.files ? req.files.reduce((acc, file) => {
      acc[file.fieldname] = file.originalname;
      return acc;
    }, {}) : {}
  };
  
  console.log('📦 Processed data:', processedData);
  
  // Add processed data to req for controller
  req.processedData = processedData;
  
  // Call controller
  requestController.createRequest(req, res);
});

// ✅ NEW ROUTE: Serve files directly from MongoDB
router.get('/file/:requestId/:docType', async (req, res) => {
    try {
        console.log(`📥 Serving file: ${req.params.docType} for request ${req.params.requestId}`);
        
        const request = await Request.findById(req.params.requestId);
        
        if (!request) {
            console.log('❌ Request not found');
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }
        
        const docType = req.params.docType; // 'nationalId', 'tradingLicense', or 'proposal'
        const document = request.documents[docType];
        
        if (!document || !document.data) {
            console.log(`❌ Document ${docType} not found or has no data`);
            return res.status(404).json({
                success: false,
                message: `Document ${docType} not found`
            });
        }
        
        console.log(`✅ Serving ${docType}: ${document.filename} (${document.contentType}, ${document.size} bytes)`);
        
        // Set headers and send file buffer
        res.set({
            'Content-Type': document.contentType,
            'Content-Disposition': `inline; filename="${document.filename}"`,
            'Content-Length': document.size
        });
        
        res.send(document.data);
        
    } catch (error) {
        console.error('🔥 Error serving file:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to serve file'
        });
    }
});

// ... other routes stay the same
router.get('/', requestController.getRequests);
router.get('/all', requestController.getAllRequests);
router.get('/:id', requestController.getRequestById);
router.patch('/:id/status', requestController.updateRequestStatus);
router.get('/stats/dashboard', requestController.getDashboardStats);

module.exports = router;