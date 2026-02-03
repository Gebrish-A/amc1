const AuditLog = require('../models/AuditLog');

exports.logAction = async (req, res, next) => {
  const oldSend = res.send;
  const startTime = Date.now();

  res.send = function(data) {
    const responseTime = Date.now() - startTime;

    // Don't log if it's a health check or monitoring endpoint
    if (req.path.includes('health') || req.path.includes('metrics')) {
      return oldSend.call(this, data);
    }

    // Create audit log asynchronously
    process.nextTick(async () => {
      try {
        const auditLog = new AuditLog({
          action: req.method.toLowerCase(),
          entity: getEntityFromPath(req.path),
          entityId: req.params.id || req.body.id || 'N/A',
          user: req.user?._id || null,
          userRole: req.user?.role || 'anonymous',
          userIp: req.ip,
          userAgent: req.headers['user-agent'],
          details: {
            before: req.oldData || null,
            after: req.newData || null,
            changes: req.changes || [],
            metadata: {
              url: req.originalUrl,
              method: req.method,
              body: sanitizeData(req.body),
              query: req.query,
              params: req.params
            }
          },
          responseTime,
          statusCode: res.statusCode,
          platform: req.headers['x-platform'] || 'web',
          location: req.headers['x-location'] ? JSON.parse(req.headers['x-location']) : null,
          sessionId: req.sessionID,
          requestId: req.headers['x-request-id']
        });

        await auditLog.save();
      } catch (error) {
        console.error('Failed to save audit log:', error);
      }
    });

    return oldSend.call(this, data);
  };

  next();
};

function getEntityFromPath(path) {
  if (path.includes('/api/users')) return 'user';
  if (path.includes('/api/coverage')) return 'coverage_request';
  if (path.includes('/api/events')) return 'event';
  if (path.includes('/api/resources')) return 'resource';
  if (path.includes('/api/assignments')) return 'assignment';
  if (path.includes('/api/media')) return 'media_file';
  if (path.includes('/api/notifications')) return 'notification';
  if (path.includes('/api/reports')) return 'report';
  return 'system';
}

function sanitizeData(data) {
  if (!data || typeof data !== 'object') return data;
  
  const sanitized = { ...data };
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'creditCard', 'ssn'];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  });
  
  return sanitized;
}