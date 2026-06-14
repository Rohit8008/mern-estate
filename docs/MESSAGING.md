# Real-Time Messaging

## Overview

| Concern | Mechanism |
|---|---|
| Transport | Socket.IO over WebSockets |
| Authentication | JWT from httpOnly cookie — verified in `io.use()` middleware |
| Encryption | AES-256-GCM, v2 format — static key derived once at startup |
| Storage | MongoDB `Message` model |
| Rate limiting | 30 messages/minute per user (in-memory Map with TTL eviction) |
| Listing context | Optional `listingId` — property details appended to message |

---

## Encryption

**File:** `backend/utils/encryption.js`

### V2 Format (Current)

```
v2:<hex(iv[12] + authTag[16] + ciphertext)>

Key:  scryptSync(MESSAGE_ENCRYPTION_KEY, 'static-salt', 32)  — computed ONCE at module load
IV:   12-byte random per message (correct for GCM)
Algo: AES-256-GCM
```

The key is derived once via `scryptSync` at module startup, not per message. This eliminates the event loop blocking from the legacy per-message `pbkdf2Sync`.

### Legacy Format (Decryption Only)

Old messages stored before the v2 migration use a PBKDF2-based format:
```
<hex(salt[64] + iv[16] + authTag[16] + ciphertext)>
```
The legacy path is supported in `decryptMessageWithKey()` to ensure existing message history remains readable.

### Public API

```js
import { encryptMessageWithKey, decryptMessageWithKey, isEncrypted } from './utils/encryption.js';

encryptMessageWithKey(plaintext)   // → "v2:..." string
decryptMessageWithKey(ciphertext)  // → plaintext (handles both v2 and legacy)
isEncrypted(text)                  // → boolean
```

---

## Socket.IO Authentication

**File:** `backend/socket.js`

All Socket.IO connections are authenticated via `io.use()` middleware before any event handler runs:

```
io.use(async (socket, next) => {
  1. Parse httpOnly cookies from socket.handshake.headers.cookie
  2. Extract access_token cookie
  3. jwt.verify(token, config.jwt.secret, { issuer, audience })
  4. User.findById(decoded.id).select('status')
  5. Reject if user not found or status !== 'active'
  6. socket.userId = String(decoded.id)
  next()
})
```

Unauthenticated connections receive `Error('Unauthorized')` and are dropped.

---

## Socket Events

### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `message:new` | `{ message }` | New message received |
| `message:read` | `{ messageId }` | Message marked as read |
| `conversation:updated` | `{ conversation }` | Thread last-message updated |
| `listing:created` | `{ listing }` | Listing created (to relevant employees) |
| `listing:updated` | `{ listing }` | Listing updated |
| `listing:deleted` | `{ listingId }` | Listing deleted |
| `listing:assigned` | `{ listing }` | Agent assigned |
| `listing:unassigned` | `{ listing, agentId }` | Agent removed |
| `owner:updated` | `{ owner }` | Owner changed |

### Client → Server Events

All message sends go through the REST API (`POST /api/messages/send`), not directly over the socket. The socket is used for presence tracking and receiving pushed notifications.

---

## REST API

**Base path:** `/api/messages`  
**File:** `backend/routes/message.route.js`

All endpoints require authentication (`verifyToken`).

| Method | Path | Description |
|---|---|---|
| `POST` | `/send` | Send an encrypted message |
| `GET` | `/thread/:otherId` | Get conversation with another user |
| `GET` | `/conversations` | All conversations with last message |
| `GET` | `/inbox` | Received messages |
| `GET` | `/sent` | Sent messages |
| `POST` | `/read` | Mark messages as read |
| `GET` | `/online-users` | Currently online user IDs |

### POST `/send` Body

```json
{
  "receiverId": "string",
  "content": "string",
  "listingId": "string (optional)"
}
```

When `listingId` is provided, the server appends property details (name, price, address) to the message content before encryption.

---

## Message Model

**File:** `backend/models/message.model.js`

| Field | Type | Notes |
|---|---|---|
| `senderId` | String | User ID (string ref) |
| `receiverId` | String | User ID (string ref) |
| `content` | String | AES-256-GCM encrypted ciphertext |
| `isEncrypted` | Boolean | Always `true` for new messages |
| `read` | Boolean | Default `false` |
| `listingId` | String | Optional — associated property |
| `createdAt` | Date | |

---

## Rate Limiting

Messages are rate-limited at 30/minute per user via an in-memory `Map`:

```
key: userId
value: { count, windowStart }
```

Entries are evicted by a `setInterval` cleanup (`.unref()`d so it doesn't block process exit).

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `MESSAGE_ENCRYPTION_KEY` | Required. 32-byte hex string. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Missing `MESSAGE_ENCRYPTION_KEY` is caught at startup by `requiredEnvVars` — the server exits early rather than crashing on the first message send.

---

## Key Files

| File | Role |
|---|---|
| `backend/socket.js` | Socket.IO init + JWT auth middleware |
| `backend/server.js` | `setupSocket()` — event handlers |
| `backend/utils/encryption.js` | AES-256-GCM encrypt/decrypt, v2 + legacy formats |
| `backend/controllers/message.controller.js` | Send, read, thread, conversations |
| `backend/routes/message.route.js` | Route wiring |
| `backend/models/message.model.js` | Message schema |
| `frontend/src/pages/Messages.jsx` | Chat UI |
