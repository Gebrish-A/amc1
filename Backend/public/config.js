// public/js/config.js
window.API_BASE_URL = 'http://localhost:5001/api';
window.APP_CONFIG = {
    ROLES: {
        ADMIN: 'admin',
        EDITOR: 'editor',
        REPORTER: 'reporter',
        CAMERAMAN: 'cameraman',
        REQUESTER: 'requester'
    },
    ENDPOINTS: {
        LOGIN: '/auth/login',
        REGISTER: '/auth/register',
        LOGOUT: '/auth/logout',
        USERS: '/users',
        REQUESTS: '/coverage-requests',
        EVENTS: '/events',
        RESOURCES: '/resources',
        STATS: '/stats',
        PROFILE: '/profile'
    }
};

// Global API helper function
window.apiRequest = async function(endpoint, options = {}) {
    try {
        const url = endpoint.startsWith('http') ? endpoint : window.API_BASE_URL + endpoint;
        
        // Add token if available
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };
        
        const response = await fetch(url, {
            headers,
            ...options
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('❌ API Request Failed:', error);
        return { 
            success: false, 
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
};

console.log('✅ Config loaded: API Base URL =', window.API_BASE_URL);