const rolePermissions = {
  admin: {
    users: ['create', 'read', 'update', 'delete'],
    coverageRequests: ['create', 'read', 'update', 'delete', 'approve'],
    events: ['create', 'read', 'update', 'delete', 'schedule'],
    resources: ['create', 'read', 'update', 'delete', 'allocate'],
    assignments: ['create', 'read', 'update', 'delete', 'assign'],
    media: ['create', 'read', 'update', 'delete', 'review'],
    reports: ['create', 'read', 'update', 'delete', 'generate'],
    system: ['configure', 'monitor', 'audit']
  },
  editor: {
    coverageRequests: ['create', 'read', 'update', 'approve'],
    events: ['create', 'read', 'update', 'schedule'],
    resources: ['read', 'allocate'],
    assignments: ['create', 'read', 'update', 'assign'],
    media: ['create', 'read', 'update', 'review'],
    reports: ['create', 'read', 'generate']
  },
  requester: {
    coverageRequests: ['create', 'read', 'update'],
    events: ['read'],
    resources: ['read'],
    assignments: ['read'],
    media: ['create', 'read'],
    reports: ['read']
  },
  reporter: {
    assignments: ['read', 'update'],
    media: ['create', 'read'],
    events: ['read']
  },
  crew: {
    assignments: ['read', 'update'],
    media: ['create', 'read'],
    events: ['read'],
    resources: ['read']
  }
};

exports.authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: `Access denied. Required roles: ${allowedRoles.join(', ')}` 
      });
    }

    next();
  };
};

exports.checkPermission = (entity, action) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    const permissions = rolePermissions[userRole];
    if (!permissions || !permissions[entity] || !permissions[entity].includes(action)) {
      return res.status(403).json({ 
        success: false, 
        error: `Permission denied for ${action} on ${entity}` 
      });
    }

    next();
  };
};