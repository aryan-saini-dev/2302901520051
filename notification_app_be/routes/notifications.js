var express = require('express');
var router = express.Router();

// Mock database in memory
let notifications = [
  {
    id: "notif_001",
    userId: "user_123",
    type: "info",
    title: "New message",
    message: "You have a new message from Ayesha.",
    read: false,
    createdAt: "2026-03-24T10:16:45.789Z"
  },
  {
    id: "notif_002",
    userId: "user_123",
    type: "alert",
    title: "System Update",
    message: "Your server is scheduled for maintenance in 2 hours.",
    read: false,
    createdAt: "2026-03-24T11:15:00.000Z"
  },
  {
    id: "notif_003",
    userId: "user_123",
    type: "success",
    title: "Payment Received",
    message: "Invoice #1049 has been paid successfully.",
    read: true,
    createdAt: "2026-03-24T09:00:00.000Z"
  }
];

// GET /api/notifications - Get all with pagination & filters
router.get('/', (req, res) => {
  let page = parseInt(req.query.page) || 1;
  let limit = parseInt(req.query.limit) || 20;
  let readFilter = req.query.read;

  let filtered = notifications;
  if (readFilter !== undefined) {
    let targetRead = readFilter === 'true';
    filtered = notifications.filter(n => n.read === targetRead);
  }

  // Basic pagination mock
  let startIndex = (page - 1) * limit;
  let paginated = filtered.slice(startIndex, startIndex + limit);

  res.json({
    status: "success",
    data: {
      notifications: paginated,
      pagination: {
        page: page,
        limit: limit,
        total: filtered.length
      }
    }
  });
});

// GET /api/notifications/unread-count - Unread count for the bell badge
router.get('/unread-count', (req, res) => {
  let unread = notifications.filter(n => !n.read).length;
  res.json({
    status: "success",
    data: {
      unreadCount: unread
    }
  });
});

// GET /api/notifications/:id - Get single notification
router.get('/:id', (req, res) => {
  let item = notifications.find(n => n.id === req.params.id);
  if (!item) {
    return res.status(404).json({
      status: "error",
      message: "Notification not found"
    });
  }
  res.json({
    status: "success",
    data: item
  });
});

// PATCH /api/notifications/read-all - Mark all as read
router.patch('/read-all', (req, res) => {
  notifications = notifications.map(n => ({ ...n, read: true }));
  res.json({
    status: "success",
    message: "All notifications marked as read"
  });
});

// PATCH /api/notifications/:id/read - Mark one as read
router.patch('/:id/read', (req, res) => {
  let index = notifications.findIndex(n => n.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({
      status: "error",
      message: "Notification not found"
    });
  }
  
  notifications[index].read = true;
  notifications[index].updatedAt = new Date().toISOString();

  res.json({
    status: "success",
    message: "Notification marked as read",
    data: {
      id: notifications[index].id,
      read: true,
      updatedAt: notifications[index].updatedAt
    }
  });
});

// DELETE /api/notifications/:id - Delete a notification
router.delete('/:id', (req, res) => {
  let index = notifications.findIndex(n => n.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({
      status: "error",
      message: "Notification not found"
    });
  }

  notifications.splice(index, 1);
  res.json({
    status: "success",
    message: "Notification deleted successfully"
  });
});

module.exports = router;
