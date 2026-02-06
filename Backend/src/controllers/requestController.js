const Request = require('../models/request');
const fs = require('fs');
const path = require('path');

exports.createRequest = async (req, res) => {
    try {
        console.log('🟢 CREATE REQUEST - RAW DATA:');
        console.log('- req.body:', req.body);
        console.log('- req.files:', req.files);
        
        // Use processedData if available, otherwise use req.body
        const requestData = req.processedData || req.body;
        
        // Validate required fields
        const requiredFields = ['title', 'category', 'priority', 'description', 'date', 'address'];
        const missingFields = requiredFields.filter(field => !requestData[field]);
        
        if (missingFields.length > 0) {
            console.log('❌ Missing fields:', missingFields);
            return res.status(400).json({
                success: false,
                message: 'All required fields must be provided',
                missing: missingFields
            });
        }
        
        // ✅ STORE FILES IN MONGODB AS BUFFERS
        const documents = {};
        
        if (req.files && req.files.length > 0) {
            console.log(`📦 Processing ${req.files.length} files for MongoDB storage`);
            
            for (const file of req.files) {
                console.log(`Processing ${file.fieldname}: ${file.originalname} (${file.mimetype})`);
                
                documents[file.fieldname] = {
                    filename: file.originalname,
                    data: file.buffer, // ✅ Store the actual file data
                    contentType: file.mimetype,
                    size: file.size,
                    uploadedAt: new Date()
                };
            }
        }
        
        // Generate unique request ID
        const requestId = Request.generateRequestId();
        
        // Create new request
        const newRequest = new Request({
            title: requestData.title,
            category: requestData.category,
            priority: requestData.priority,
            description: requestData.description,
            date: requestData.date,
            address: requestData.address,
            additionalInfo: requestData.additionalInfo || '',
            status: 'pending',
            requestId,
            submittedBy: requestData.submittedBy || requestData.submitterEmail,
            submitterEmail: requestData.submitterEmail,
            submitterDepartment: requestData.submitterDepartment || 'news',
            submittedAt: new Date(),
            // ✅ Store files as buffers in MongoDB
            documents: {
                nationalId: documents.nationalId || null,
                tradingLicense: documents.tradingLicense || null,
                proposal: documents.proposal || null
            }
        });
        
        await newRequest.save();
        
        console.log('✅ New request created in MongoDB:', {
            id: newRequest._id,
            requestId: newRequest.requestId,
            title: newRequest.title,
            hasFiles: {
                nationalId: !!newRequest.documents.nationalId,
                tradingLicense: !!newRequest.documents.tradingLicense,
                proposal: !!newRequest.documents.proposal
            }
        });
        
        res.status(201).json({
            success: true,
            message: 'Request submitted successfully with files stored in database',
            data: {
                requestId: newRequest.requestId,
                status: newRequest.status,
                submittedAt: newRequest.submittedAt,
                hasFiles: {
                    nationalId: !!newRequest.documents.nationalId,
                    tradingLicense: !!newRequest.documents.tradingLicense,
                    proposal: !!newRequest.documents.proposal
                }
            }
        });
        
    } catch (error) {
        console.error('🔥 Create request error:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: Object.values(error.errors).map(err => err.message)
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to submit request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get all requests (with filtering)
exports.getRequests = async (req, res) => {
    try {
        const { 
            status, 
            category, 
            priority, 
            startDate, 
            endDate,
            submitterEmail,
            page = 1,
            limit = 10,
            sortBy = 'submittedAt',
            sortOrder = 'desc'
        } = req.query;
        
        // Build filter
        const filter = {};
        
        if (status) filter.status = status;
        if (category) filter.category = category;
        if (priority) filter.priority = priority;
        if (submitterEmail) filter.submitterEmail = submitterEmail;
        
        // Date range filter
        if (startDate || endDate) {
            filter.submittedAt = {};
            if (startDate) filter.submittedAt.$gte = new Date(startDate);
            if (endDate) filter.submittedAt.$lte = new Date(endDate);
        }
        
        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Build sort
        const sort = {};
        sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
        
        // Execute query
        const [requests, total] = await Promise.all([
            Request.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .select('-__v'),
            Request.countDocuments(filter)
        ]);
        
        res.json({
            success: true,
            data: requests,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
        
    } catch (error) {
        console.error('Get requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch requests'
        });
    }
};

// Get single request by ID
exports.getRequestById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const request = await Request.findOne({ 
            $or: [
                { _id: id },
                { requestId: id }
            ]
        }).select('-__v');
        
        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }
        
        res.json({
            success: true,
            data: request
        });
        
    } catch (error) {
        console.error('Get request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch request'
        });
    }
};

// Update request status
exports.updateRequestStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, editorNotes, assignedEditor } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }
        
        const updateData = {
            status,
            reviewedAt: status !== 'pending' ? new Date() : undefined,
            updatedAt: new Date()
        };
        
        if (editorNotes) updateData.editorNotes = editorNotes;
        if (assignedEditor) {
            updateData.assignedEditor = {
                name: assignedEditor.name,
                email: assignedEditor.email,
                assignedAt: new Date()
            };
        }
        
        const updatedRequest = await Request.findOneAndUpdate(
            { 
                $or: [
                    { _id: id },
                    { requestId: id }
                ]
            },
            updateData,
            { new: true, runValidators: true }
        ).select('-__v');
        
        if (!updatedRequest) {
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Request updated successfully',
            data: updatedRequest
        });
        
    } catch (error) {
        console.error('Update request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update request'
        });
    }
};

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
    try {
        const { submitterEmail } = req.query;
        
        const filter = {};
        if (submitterEmail) filter.submitterEmail = submitterEmail;
        
        const stats = await Request.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Get counts by priority
        const priorityStats = await Request.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$priority',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Get counts by category
        const categoryStats = await Request.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Total count
        const total = await Request.countDocuments(filter);
        
        res.json({
            success: true,
            data: {
                statusStats: stats.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                priorityStats: priorityStats.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                categoryStats: categoryStats.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                total
            }
        });
        
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics'
        });
    }
};
// Get all requests (simple version for editor dashboard)
exports.getAllRequests = async (req, res) => {
    try {
        console.log('📡 getAllRequests called - fetching all requests from database');
        
        // Get all requests without complex filtering
        const requests = await Request.find({})
            .sort('-submittedAt')
            .select('-__v');

        // LOG THE RESULTS
        console.log(`✅ Found ${requests.length} requests in database:`);
        requests.forEach((req, i) => {
            console.log(`${i + 1}. ID: ${req._id}, Title: "${req.title}", Status: ${req.status}, Submitter: ${req.submitterEmail}`);
        });

        res.json({
            success: true,
            count: requests.length,
            data: requests
        });
        
    } catch (error) {
        console.error('Get all requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch requests'
        });
    }
};