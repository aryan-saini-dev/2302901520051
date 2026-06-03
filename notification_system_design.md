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

---

# Stage 2

## Persistent Storage & Database Choice
I suggest using **PostgreSQL**.
*   **Why**: Notifications are tied to users, so standard relations make sense. PostgreSQL also supports `JSONB` which lets us store flexible metadata (like sender info, deep links, button actions) without needing a full NoSQL database.
*   **ACID compliance**: Ensures read/unread statuses are updated reliably without race conditions.

---

## DB Schema

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- info, alert, etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    payload JSONB, -- custom metadata
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes to keep queries fast
CREATE INDEX idx_user_read_created ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX idx_user_unread ON notifications (user_id) WHERE is_read = FALSE;
```

---

## Scaling Problems & Solutions

*   **Slow Queries**: Loading millions of notifications slows down. *Fix*: Use composite/partial indexes (see schema above) and read replicas.
*   **Write Bottlenecks**: Bursts of notifications can block the DB. *Fix*: Use a queue (Redis/RabbitMQ) to batch writes.
*   **Storage Bloat**: Too much historical data. *Fix*: Run a cron job to delete or archive read notifications older than 30 days.
*   **Bell Badge Count Spam**: App polls unread count endpoint constantly. *Fix*: Cache the unread count in Redis.

---

## SQL Queries

### 1. Fetch Paginated Notifications for a User
```sql
SELECT * FROM notifications 
WHERE user_id = :userId AND (:isRead IS NULL OR is_read = :isRead)
ORDER BY created_at DESC 
LIMIT :limit OFFSET :offset;
```

### 2. Fetch Single Notification
```sql
SELECT * FROM notifications WHERE id = :id AND user_id = :userId;
```

### 3. Mark Single Notification as Read
```sql
UPDATE notifications SET is_read = TRUE WHERE id = :id AND user_id = :userId RETURNING *;
```

### 4. Mark All as Read
```sql
UPDATE notifications SET is_read = TRUE WHERE user_id = :userId AND is_read = FALSE;
```

### 5. Delete Notification
```sql
DELETE FROM notifications WHERE id = :id AND user_id = :userId;
```

### 6. Get Unread Count
```sql
SELECT COUNT(*) FROM notifications WHERE user_id = :userId AND is_read = FALSE;
```
