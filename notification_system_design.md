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

---

# Stage 3

## Query Analysis

### 1. Is the query accurate?
Yeah, the query works and is accurate. But `SELECT *` is bad practice because it fetches all columns (like payload etc) which we dont need. Also, `ORDER BY createdAt ASC` shows oldest alerts first. Usually we want descending order (`DESC`) so users see newest stuff first.

### 2. Why is it slow?
Because there is no index on the columns used in the WHERE and ORDER BY clauses. With 5 million rows, the DB does a full table scan (sequential scan) to filter by `studentID` and `isRead`, and then sorts them in memory.

### 3. What to change & Cost
We need a composite index on `(studentID, isRead, createdAt)` (or DESC if we flip the sort).
*   **Cost**: Full table scan is $O(N)$ plus sorting $O(K \log K)$ where $K$ is the filtered rows. With the index, it becomes $O(\log N)$ for lookup, and sorting cost becomes $O(1)$ since index is already sorted.

```sql
CREATE INDEX idx_student_unread_created ON notifications (studentID, isRead, createdAt ASC);
```

### 4. Indexing every column?
No, that advice is bad. 
*   **Write Overhead**: Every INSERT, UPDATE, or DELETE gets super slow because the DB has to update all those indexes.
*   **Space**: Indexes take up a lot of disk and RAM.
*   **Useless**: DB query planner can only use one or two indexes per query anyway, so single-column indexes on everything won't help composite filters.

---

## Placement Query (Last 7 Days)

To find all students who got a placement alert in the last 7 days:

```sql
SELECT DISTINCT studentID 
FROM notifications 
WHERE notificationType = 'Placement' 
  AND createdAt >= NOW() - INTERVAL '7 days';
```

---

# Stage 4

## Performance Solutions & Tradeoffs

To stop the database from crashing because of constant notification fetches on page loads, here are the main solutions we can use:

### 1. Redis Caching (In-memory Cache)
We can store the notifications list and unread count in a Redis cache for each student. When they load a page, we read from Redis first. We only query the DB if it is a cache miss.
*   **Pros**: Super fast response times (microsecond range) and takes all the read load off Postgres.
*   **Cons**: Cache invalidation is tricky. Whenever a user marks a notification as read or gets a new one, we must clear or update their cache.

### 2. WebSockets / Socket.IO (Push instead of Pull)
Instead of fetching notifications on every page transition, the frontend can fetch them once at login and store them in app state (or localstorage). For new notifications, the backend pushes them in real-time over WebSockets.
*   **Pros**: Basically eliminates DB fetch requests on page loads. Nice, real-time feel for the user.
*   **Cons**: Maintaining millions of open WebSocket connections uses a lot of server memory and requires horizontal scaling (like Redis Pub/Sub for sockets).

### 3. Read Replicas
We can set up read-only database replicas. All notification GET requests go to the replicas, and only writes (inserts, marking as read) go to the primary master database.
*   **Pros**: Very easy to scale horizontally by just adding more replica nodes. No change in app logic required.
*   **Cons**: Replication lag. If the user marks an alert as read, they might still see it as unread for a split second on reload if the replica hasn't synced yet.

### 4. HTTP Browser Caching (ETags)
Use HTTP `ETag` or `Cache-Control` headers for the `/unread-count` and list endpoints. If nothing changed, the server returns a `304 Not Modified` without querying the full table.
*   **Pros**: Standard web feature, browser handles it automatically.
*   **Cons**: Still requires hitting the backend to check if the ETag is valid (unless we cache the ETag in Redis).


---

# Stage 5

## Pseudocode Analysis & Redesign

### Shortcomings of the current implementation:
1.  **Synchronous & Blocking**: Running a loop of 50,000 students doing DB writes, email API calls, and socket pushes sequentially will block the server. If each takes 100ms, it will take over 80 minutes to finish, and the HR's HTTP request will timeout.
2.  **No Fault Tolerance**: If the email API crashes or rate-limits us at student #25,000, the whole loop fails and remaining students get nothing.
3.  **No Retry Mechanism**: For the 200 failed emails midway, we can't easily retry them without risking sending duplicate emails to the other 49,800 students.

---

### Should saving to DB and sending email happen together?
**No**. They should be decoupled. 
*   Saving to the DB is fast and crucial to record that the notification exists.
*   Sending an email calls a third-party service (like SendGrid or AWS SES) which is slow and can fail easily. 
*   If we decouple them, we can write to the DB instantly and let background workers send emails at their own pace. If an email fails, we retry just that email without affecting DB state.

---

### Redesigned Pseudocode

We will use an **asynchronous job queue** (like BullMQ or RabbitMQ) to handle the load in the background.

```python
# Express Router / Producer
function notify_all(student_ids: array, message: string):
    # 1. Bulk insert notifications into DB in one query (very fast)
    save_notifications_in_bulk(student_ids, message)
    
    # 2. Push notification jobs into a queue
    for student_id in student_ids:
        notification_queue.push({
            student_id: student_id,
            message: message,
            attempts: 0
        })
        
    # Return 202 accepted immediately so the HR doesn't wait
    return response(status=202, message="Notifications are queueing")

# Background Worker / Consumer
function process_queue_job(job):
    try:
        # Push real-time alert (non-blocking)
        push_to_app_socket(job.student_id, job.message)
        
        # Send the email
        send_email(job.student_id, job.message)
        
        mark_job_completed(job)
    except EmailError as e:
        if job.attempts < 3:
            job.attempts += 1
            # Requeue with backoff delay so we don't spam a failing server
            notification_queue.retry_with_delay(job, delay=300)
        else:
            log_failed_notification(job.student_id, e)
            mark_job_failed(job)
```


