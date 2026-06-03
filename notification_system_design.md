# Stage 1

## Notification System - REST API Design

Doc for the frontend team — endpoints, request/response shapes, and how real-time works.

---

### Auth

All requests need:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

No token = 401.

---

### Endpoints

**GET** `/api/notifications` — get all, supports `?page=1&limit=20&read=false`

**GET** `/api/notifications/:id` — single notification

**PATCH** `/api/notifications/:id/read` — mark one as read, body: `{ "read": true }`

**PATCH** `/api/notifications/read-all` — mark all read, no body

**DELETE** `/api/notifications/:id` — delete one

**GET** `/api/notifications/unread-count` — for the bell badge

---

### Response shapes

Get all:
```json
{
  "status": "success",
  "data": {
    "notifications": [
      {
        "id": "notif_001",
        "userId": "user_123",
        "type": "info",
        "title": "New message",
        "message": "You have a new message from Ayesha.",
        "read": false,
        "createdAt": "2026-03-24T10:16:45.789Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 8 }
  }
}
```

Mark as read:
```json
{
  "status": "success",
  "message": "Notification marked as read",
  "data": { "id": "notif_001", "read": true, "updatedAt": "2026-03-24T11:00:00.000Z" }
}
```

Unread count:
```json
{ "status": "success", "data": { "unreadCount": 3 } }
```

Errors always look like:
```json
{ "status": "error", "message": "Notification not found" }
```

HTTP codes: 200, 400, 401, 404, 500.

---

### Notification object

`id`, `userId`, `type` (info/alert/warning/success), `title`, `message`, `read` (boolean), `createdAt`, `updatedAt`

---

### Real-time

Using WebSockets (Socket.IO). After login the client connects and authenticates with the token. Server maps the socket to that user. When a notification is created, it's pushed directly — no polling.

Connection:
```
ws://your-domain.com/notifications?token=<access_token>
```

Server emits `new_notification` event:
```json
{
  "id": "notif_003",
  "userId": "user_123",
  "type": "info",
  "title": "New login detected",
  "message": "Someone logged in from Chrome on Windows.",
  "read": false,
  "createdAt": "2026-03-24T12:00:00.000Z"
}
```

Client side:
```javascript
socket.on("new_notification", (notification) => {
  // update bell badge and notification list
});
```
