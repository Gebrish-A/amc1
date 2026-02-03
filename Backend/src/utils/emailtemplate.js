/**
 * Email templates for the Media Coverage Management System
 */

const getBaseTemplate = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Amhara Media Corporation</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
        }
        
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
        }
        
        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }
        
        .logo {
            max-width: 150px;
            margin-bottom: 20px;
        }
        
        .header h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 10px;
        }
        
        .header p {
            font-size: 14px;
            opacity: 0.9;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .message {
            margin-bottom: 30px;
        }
        
        .message h2 {
            color: #2c3e50;
            font-size: 20px;
            margin-bottom: 15px;
            font-weight: 600;
        }
        
        .message p {
            margin-bottom: 15px;
            font-size: 16px;
            color: #555;
        }
        
        .details {
            background-color: #f8f9fa;
            border-left: 4px solid #3498db;
            padding: 20px;
            margin: 25px 0;
            border-radius: 4px;
        }
        
        .details h3 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 16px;
        }
        
        .detail-item {
            margin-bottom: 10px;
            display: flex;
        }
        
        .detail-label {
            font-weight: 600;
            min-width: 120px;
            color: #555;
        }
        
        .detail-value {
            color: #333;
            flex: 1;
        }
        
        .button {
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
            color: white;
            text-decoration: none;
            border-radius: 5px;
            font-weight: 600;
            margin: 20px 0;
            transition: all 0.3s ease;
        }
        
        .button:hover {
            background: linear-gradient(135deg, #2980b9 0%, #1c5a7a 100%);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
        }
        
        .footer {
            background-color: #2c3e50;
            color: white;
            padding: 30px 20px;
            text-align: center;
        }
        
        .footer p {
            margin-bottom: 10px;
            font-size: 14px;
            opacity: 0.8;
        }
        
        .contact-info {
            margin-top: 20px;
            font-size: 13px;
            opacity: 0.7;
        }
        
        .contact-info a {
            color: #3498db;
            text-decoration: none;
        }
        
        .priority-high {
            color: #e74c3c;
            font-weight: 600;
        }
        
        .priority-medium {
            color: #f39c12;
            font-weight: 600;
        }
        
        .priority-low {
            color: #27ae60;
            font-weight: 600;
        }
        
        @media (max-width: 600px) {
            .content {
                padding: 20px 15px;
            }
            
            .header h1 {
                font-size: 20px;
            }
            
            .message h2 {
                font-size: 18px;
            }
            
            .detail-item {
                flex-direction: column;
            }
            
            .detail-label {
                margin-bottom: 5px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <img src="https://amhara-media.et/logo.png" alt="Amhara Media Corporation" class="logo">
            <h1>Amhara Media Corporation</h1>
            <p>Media Coverage Management System</p>
        </div>
        
        <div class="content">
            ${content}
        </div>
        
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Amhara Media Corporation. All rights reserved.</p>
            <p>This is an automated message from the Media Coverage Management System.</p>
            <div class="contact-info">
                <p>For support, contact: <a href="mailto:support@amhara-media.et">support@amhara-media.et</a></p>
                <p>Phone: +251 11 123 4567 | Address: Bahir Dar, Ethiopia</p>
            </div>
        </div>
    </div>
</body>
</html>
`;

module.exports = {
  /**
   * Coverage Request Submitted
   */
  coverageRequestSubmitted: (data) => {
    const {
      requestId,
      title,
      category,
      priority,
      requesterName,
      proposedDate,
      location
    } = data;

    const priorityClass = `priority-${priority}`;

    return getBaseTemplate(`
        <div class="message">
            <h2>Coverage Request Submitted</h2>
            <p>Dear ${requesterName},</p>
            <p>Your coverage request has been successfully submitted and is now awaiting approval.</p>
        </div>
        
        <div class="details">
            <h3>Request Details</h3>
            <div class="detail-item">
                <span class="detail-label">Request ID:</span>
                <span class="detail-value">${requestId}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Title:</span>
                <span class="detail-value">${title}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Category:</span>
                <span class="detail-value">${category}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Priority:</span>
                <span class="detail-value ${priorityClass}">${priority.toUpperCase()}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Proposed Date:</span>
                <span class="detail-value">${new Date(proposedDate).toLocaleString()}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Location:</span>
                <span class="detail-value">${location}</span>
            </div>
        </div>
        
        <p>You can track the status of your request through the Media Coverage Management System.</p>
        <a href="${process.env.FRONTEND_URL}/coverage/${requestId}" class="button">View Request</a>
        
        <p>An editor will review your request shortly. You will be notified when there are updates.</p>
    `);
  },

  /**
   * Coverage Request Approved
   */
  coverageRequestApproved: (data) => {
    const {
      requestId,
      title,
      approverName,
      comments,
      nextSteps
    } = data;

    return getBaseTemplate(`
        <div class="message">
            <h2>Coverage Request Approved</h2>
            <p>Good news! Your coverage request has been approved.</p>
        </div>
        
        <div class="details">
            <h3>Approval Details</h3>
            <div class="detail-item">
                <span class="detail-label">Request ID:</span>
                <span class="detail-value">${requestId}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Title:</span>
                <span class="detail-value">${title}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Approved By:</span>
                <span class="detail-value">${approverName}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Approval Date:</span>
                <span class="detail-value">${new Date().toLocaleString()}</span>
            </div>
            ${comments ? `
            <div class="detail-item">
                <span class="detail-label">Comments:</span>
                <span class="detail-value">${comments}</span>
            </div>
            ` : ''}
        </div>
        
        ${nextSteps ? `
        <div class="details">
            <h3>Next Steps</h3>
            <p>${nextSteps}</p>
        </div>
        ` : ''}
        
        <a href="${process.env.FRONTEND_URL}/coverage/${requestId}" class="button">View Request Details</a>
        
        <p>The event scheduling team will now schedule this coverage and assign resources.</p>
    `);
  },

  /**
   * Coverage Request Rejected
   */
  coverageRequestRejected: (data) => {
    const {
      requestId,
      title,
      approverName,
      rejectionReason,
      suggestions
    } = data;

    return getBaseTemplate(`
        <div class="message">
            <h2>Coverage Request Needs Revision</h2>
            <p>Your coverage request requires some changes before it can be approved.</p>
        </div>
        
        <div class="details">
            <h3>Request Details</h3>
            <div class="detail-item">
                <span class="detail-label">Request ID:</span>
                <span class="detail-value">${requestId}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Title:</span>
                <span class="detail-value">${title}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Reviewed By:</span>
                <span class="detail-value">${approverName}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Review Date:</span>
                <span class="detail-value">${new Date().toLocaleString()}</span>
            </div>
        </div>
        
        <div class="details">
            <h3>Revision Required</h3>
            <p><strong>Reason:</strong> ${rejectionReason}</p>
            ${suggestions ? `
            <p><strong>Suggestions:</strong> ${suggestions}</p>
            ` : ''}
        </div>
        
        <a href="${process.env.FRONTEND_URL}/coverage/${requestId}/edit" class="button">Revise Request</a>
        
        <p>Please make the necessary changes and resubmit your request for review.</p>
        <p>If you have any questions, please contact the editor who reviewed your request.</p>
    `);
  },

  /**
   * New Assignment Notification
   */
  newAssignment: (data) => {
    const {
      assignmentId,
      eventTitle,
      eventDate,
      location,
      role,
      reporterName,
      priority,
      checklist
    } = data;

    const priorityClass = `priority-${priority}`;

    return getBaseTemplate(`
        <div class="message">
            <h2>New Assignment</h2>
            <p>Dear ${reporterName},</p>
            <p>You have been assigned to cover an important event.</p>
        </div>
        
        <div class="details">
            <h3>Assignment Details</h3>
            <div class="detail-item">
                <span class="detail-label">Assignment ID:</span>
                <span class="detail-value">${assignmentId}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Event:</span>
                <span class="detail-value">${eventTitle}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Date & Time:</span>
                <span class="detail-value">${new Date(eventDate).toLocaleString()}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Location:</span>
                <span class="detail-value">${location}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Your Role:</span>
                <span class="detail-value">${role}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Priority:</span>
                <span class="detail-value ${priorityClass}">${priority.toUpperCase()}</span>
            </div>
        </div>
        
        ${checklist && checklist.length > 0 ? `
        <div class="details">
            <h3>Checklist</h3>
            <ul>
                ${checklist.map(item => `<li>${item}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
        
        <a href="${process.env.FRONTEND_URL}/assignments/${assignmentId}" class="button">View Assignment Details</a>
        <a href="${process.env.FRONTEND_URL}/assignments/${assignmentId}/accept" class="button" style="background: #27ae60; margin-left: 10px;">Accept Assignment</a>
        
        <p>Please review the assignment details and confirm your availability as soon as possible.</p>
        <p>If you have any questions or cannot accept this assignment, please contact your editor immediately.</p>
    `);
  },

  /**
   * Event Reminder
   */
  eventReminder: (data) => {
    const {
      eventTitle,
      eventDate,
      location,
      assignmentId,
      hoursUntil,
      preparationNotes
    } = data;

    return getBaseTemplate(`
        <div class="message">
            <h2>Event Reminder</h2>
            <p>This is a reminder for your upcoming assignment.</p>
        </div>
        
        <div class="details">
            <h3>Event Details</h3>
            <div class="detail-item">
                <span class="detail-label">Event:</span>
                <span class="detail-value">${eventTitle}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Starts In:</span>
                <span class="detail-value">${hoursUntil} hours</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Date & Time:</span>
                <span class="detail-value">${new Date(eventDate).toLocaleString()}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Location:</span>
                <span class="detail-value">${location}</span>
            </div>
        </div>
        
        ${preparationNotes ? `
        <div class="details">
            <h3>Preparation Notes</h3>
            <p>${preparationNotes}</p>
        </div>
        ` : ''}
        
        <a href="${process.env.FRONTEND_URL}/assignments/${assignmentId}" class="button">View Assignment</a>
        
        <p>Please ensure you have all necessary equipment and have reviewed all event details.</p>
        <p>Safe travels and good luck with your coverage!</p>
    `);
  },

  /**
   * SLA Alert
   */
  slaAlert: (data) => {
    const {
      requestId,
      title,
      slaDeadline,
      hoursRemaining,
      currentStatus,
      actionRequired
    } = data;

    const urgency = hoursRemaining <= 2 ? 'high' : hoursRemaining <= 12 ? 'medium' : 'low';

    return getBaseTemplate(`
        <div class="message">
            <h2 style="color: ${urgency === 'high' ? '#e74c3c' : urgency === 'medium' ? '#f39c12' : '#3498db'}">
                SLA Deadline Alert
            </h2>
            <p>This coverage request is approaching its SLA deadline.</p>
        </div>
        
        <div class="details">
            <h3>Request Details</h3>
            <div class="detail-item">
                <span class="detail-label">Request ID:</span>
                <span class="detail-value">${requestId}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Title:</span>
                <span class="detail-value">${title}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Current Status:</span>
                <span class="detail-value">${currentStatus}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">SLA Deadline:</span>
                <span class="detail-value">${new Date(slaDeadline).toLocaleString()}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Time Remaining:</span>
                <span class="detail-value" style="color: ${urgency === 'high' ? '#e74c3c' : urgency === 'medium' ? '#f39c12' : '#27ae60'}; font-weight: 600;">
                    ${hoursRemaining.toFixed(1)} hours
                </span>
            </div>
        </div>
        
        ${actionRequired ? `
        <div class="details">
            <h3>Required Action</h3>
            <p>${actionRequired}</p>
        </div>
        ` : ''}
        
        <a href="${process.env.FRONTEND_URL}/coverage/${requestId}" class="button">Take Action Now</a>
        
        <p>Please complete the required actions before the SLA deadline to avoid delays.</p>
        <p>This is an automated alert. If you believe this is in error, please contact the system administrator.</p>
    `);
  },

  /**
   * Content Review Required
   */
  contentReviewRequired: (data) => {
    const {
      mediaId,
      fileName,
      uploadedBy,
      assignmentTitle,
      uploadDate,
      comments
    } = data;

    return getBaseTemplate(`
        <div class="message">
            <h2>Content Review Required</h2>
            <p>New content has been uploaded and requires your review.</p>
        </div>
        
        <div class="details">
            <h3>Content Details</h3>
            <div class="detail-item">
                <span class="detail-label">File Name:</span>
                <span class="detail-value">${fileName}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Uploaded By:</span>
                <span class="detail-value">${uploadedBy}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Assignment:</span>
                <span class="detail-value">${assignmentTitle}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Upload Date:</span>
                <span class="detail-value">${new Date(uploadDate).toLocaleString()}</span>
            </div>
            ${comments ? `
            <div class="detail-item">
                <span class="detail-label">Uploader Comments:</span>
                <span class="detail-value">${comments}</span>
            </div>
            ` : ''}
        </div>
        
        <a href="${process.env.FRONTEND_URL}/media/${mediaId}/review" class="button">Review Content</a>
        
        <p>Please review this content as soon as possible to ensure timely publication.</p>
        <p>You can approve, reject, or request revisions through the review interface.</p>
    `);
  },

  /**
   * System Alert
   */
  systemAlert: (data) => {
    const {
      alertType,
      severity,
      message,
      component,
      timestamp,
      recommendedAction
    } = data;

    const severityColor = {
      critical: '#e74c3c',
      high: '#e67e22',
      medium: '#f39c12',
      low: '#3498db'
    }[severity] || '#95a5a6';

    return getBaseTemplate(`
        <div class="message">
            <h2 style="color: ${severityColor}">System Alert: ${alertType}</h2>
            <p>${message}</p>
        </div>
        
        <div class="details">
            <h3>Alert Details</h3>
            <div class="detail-item">
                <span class="detail-label">Severity:</span>
                <span class="detail-value" style="color: ${severityColor}; font-weight: 600;">${severity.toUpperCase()}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Component:</span>
                <span class="detail-value">${component}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Time:</span>
                <span class="detail-value">${new Date(timestamp).toLocaleString()}</span>
            </div>
        </div>
        
        ${recommendedAction ? `
        <div class="details">
            <h3>Recommended Action</h3>
            <p>${recommendedAction}</p>
        </div>
        ` : ''}
        
        <a href="${process.env.FRONTEND_URL}/admin/system-health" class="button">View System Health</a>
        
        <p>This is an automated system alert. Please investigate and take appropriate action.</p>
        <p>For technical support, contact the system administration team.</p>
    `);
  },

  /**
   * Daily Report
   */
  dailyReport: (data) => {
    const {
      date,
      totalRequests,
      approvedRequests,
      pendingRequests,
      completedEvents,
      upcomingEvents,
      resourceUtilization,
      topPerformers
    } = data;

    return getBaseTemplate(`
        <div class="message">
            <h2>Daily Coverage Report - ${new Date(date).toLocaleDateString()}</h2>
            <p>Here's your daily summary of media coverage activities.</p>
        </div>
        
        <div class="details">
            <h3>Summary Statistics</h3>
            <div class="detail-item">
                <span class="detail-label">Total Requests:</span>
                <span class="detail-value">${totalRequests}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Approved Today:</span>
                <span class="detail-value">${approvedRequests}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Pending Review:</span>
                <span class="detail-value">${pendingRequests}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Events Completed:</span>
                <span class="detail-value">${completedEvents}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Upcoming Events:</span>
                <span class="detail-value">${upcomingEvents}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Resource Utilization:</span>
                <span class="detail-value">${resourceUtilization}%</span>
            </div>
        </div>
        
        ${topPerformers && topPerformers.length > 0 ? `
        <div class="details">
            <h3>Top Performers</h3>
            <ul>
                ${topPerformers.map(performer => `
                <li><strong>${performer.name}</strong>: ${performer.metric} (${performer.department})</li>
                `).join('')}
            </ul>
        </div>
        ` : ''}
        
        <a href="${process.env.FRONTEND_URL}/reports/daily/${date}" class="button">View Detailed Report</a>
        
        <p>This report is generated automatically every day at 6:00 AM.</p>
        <p>For more detailed analytics, visit the Reports section in the system.</p>
    `);
  },

  /**
   * Password Reset
   */
  passwordReset: (data) => {
    const {
      userName,
      resetLink,
      expiresIn
    } = data;

    return getBaseTemplate(`
        <div class="message">
            <h2>Password Reset Request</h2>
            <p>Dear ${userName},</p>
            <p>We received a request to reset your password for the Media Coverage Management System.</p>
        </div>
        
        <div class="details">
            <h3>Reset Instructions</h3>
            <p>Click the button below to reset your password. This link will expire in ${expiresIn} minutes.</p>
        </div>
        
        <a href="${resetLink}" class="button">Reset Password</a>
        
        <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</p>
        <p>For security reasons, never share this link with anyone.</p>
        
        <div class="details" style="background-color: #fff3cd; border-color: #ffeaa7;">
            <h3>Security Note</h3>
            <p>Amhara Media Corporation will never ask for your password via email. Always verify the sender's email address.</p>
        </div>
    `);
  }
};