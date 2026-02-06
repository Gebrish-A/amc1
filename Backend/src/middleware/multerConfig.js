const express = require('express');
const multer = require('multer');
const router = express.Router();
const requestController = require('../controllers/requestController');

// Configure multer to parse FormData (files in memory)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
}).fields([
    { name: 'nationalId', maxCount: 1 },
    { name: 'tradingLicense', maxCount: 1 },
    { name: 'proposal', maxCount: 1 }
]);

// Create new request
router.post('/', upload, requestController.createRequest);