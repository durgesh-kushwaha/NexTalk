# NexTalk — Real-Time Messaging & Calling Platform

A production-style full-stack communication application featuring instant messaging, audio calling, and video calling. Built to demonstrate modern Java backend engineering with a real-time web frontend.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [Prerequisites](#prerequisites)
6. [Quick Start](#quick-start)
7. [REST API Reference](#rest-api-reference)
8. [WebSocket & STOMP Reference](#websocket--stomp-reference)
9. [WebRTC Signaling Flow](#webrtc-signaling-flow)
10. [Security Design](#security-design)
11. [Android Integration Guide](#android-integration-guide)
12. [Configuration Reference](#configuration-reference)
13. [Scalability Considerations](#scalability-considerations)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Web Browser / Android App                     │
│                                                                  │
│  ┌──────────────────┐          ┌──────────────────────────────┐  │
│  │  HTML/CSS/JS     │          │  Android (Retrofit + OkHttp) │  │
│  │  (SockJS+STOMP)  │          │  (OkHttp WebSocket + STOMP)  │  │
│  └────────┬─────────┘          └─────────────┬────────────────┘  │
│           │                                  │                   │
└───────────┼──────────────────────────────────┼───────────────────┘
            │  REST API (HTTP/S)               │
            │  WebSocket (WS/WSS)              │
            ▼                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              NexTalk Spring Boot Server  (port 8080)             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  SecurityConfig  ──  JwtAuthFilter  ──  WebSocketAuth   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  REST Controllers          WebSocket Controllers                 │
│  ┌─────────────────┐       ┌────────────────────────────────┐   │
│  │ AuthController  │       │ SignalingController             │   │
│  │ UserController  │       │  @MessageMapping /chat/{id}    │   │
│  │ ConvController  │       │  @MessageMapping /signal       │   │
│  │ MsgController   │       └────────────────────────────────┘   │
│  └────────┬────────┘                    │                       │
│           │                             │                       │
│  Services │  (Auth, User, Message, Conversation)               │
│           │                             │                       │
│  ┌────────▼─────────────────────────────▼────────────────────┐  │
│  │              Spring Data JPA  /  Hibernate ORM             │  │
│  └────────────────────────────┬───────────────────────────────┘  │
└───────────────────────────────┼─────────────────────────────────┘
                                │  JDBC
                                ▼
                    ┌──────────────────────┐
                    │   MySQL 8.0+          │
                    │   nextalk_db          │
                    │                      │
                    │  users               │
                    │  conversations       │
                    │  conv_participants   │
                    │  messages            │
                    └──────────────────────┘

WebRTC Media Path (P2P — server is NOT involved):
  User A  ◄════════════ audio/video stream ════════════►  User B
```

---

## Technology Stack

| Layer          | Technology                              | Purpose                                      |
|----------------|-----------------------------------------|----------------------------------------------|
| Backend        | Java 17, Spring Boot 3.2                | REST API, WebSocket broker, business logic   |
| Security       | Spring Security, JWT (jjwt 0.12)        | Stateless auth, BCrypt password hashing      |
| Real-time      | Spring WebSocket, STOMP                 | Instant messaging, signaling relay           |
| ORM            | Spring Data JPA, Hibernate              | Database access with zero boilerplate SQL    |
| Database       | MySQL 8.0+                              | Persistent storage                           |
| Frontend       | HTML5, CSS3, Vanilla JavaScript         | Web UI, no framework dependency              |
| WebSocket (FE) | SockJS + @stomp/stompjs                 | Browser WebSocket with HTTP fallback         |
| Calling        | WebRTC API (browser-native)             | P2P audio and video streams                  |
| Build          | Maven (Spring Boot Maven Plugin)        | Dependency management, executable JAR        |

---

## Project Structure

```
NexTalk/
├── database/
│   └── schema.sql                          ← MySQL DDL scripts
│
├── backend/
│   ├── pom.xml                             ← Maven dependencies
│   └── src/
│       ├── main/
│       │   ├── java/com/nextalk/
│       │   │   ├── NexTalkApplication.java ← Spring Boot entry point
│       │   │   ├── config/
│       │   │   │   ├── SecurityConfig.java ← JWT + CORS + filter chain
│       │   │   │   └── WebSocketConfig.java← STOMP broker + auth interceptor
│       │   │   ├── controller/
│       │   │   │   ├── AuthController.java        ← POST /auth/register, /login
│       │   │   │   ├── UserController.java        ← GET /users, /users/{id}, /search
│       │   │   │   ├── ConversationController.java← GET/POST /conversations
│       │   │   │   ├── MessageController.java     ← GET/POST /conversations/{id}/messages
│       │   │   │   └── SignalingController.java   ← STOMP /app/chat, /app/signal
│       │   │   ├── service/
│       │   │   │   ├── AuthService.java
│       │   │   │   ├── UserService.java
│       │   │   │   ├── ConversationService.java
│       │   │   │   └── MessageService.java
│       │   │   ├── model/                  ← JPA entities
│       │   │   │   ├── User.java
│       │   │   │   ├── Conversation.java
│       │   │   │   ├── ConversationParticipant.java
│       │   │   │   └── Message.java
│       │   │   ├── repository/             ← Spring Data interfaces
│       │   │   │   ├── UserRepository.java
│       │   │   │   ├── ConversationRepository.java
│       │   │   │   └── MessageRepository.java
│       │   │   ├── dto/                    ← Request/response objects
│       │   │   │   ├── RegisterRequest.java
│       │   │   │   ├── LoginRequest.java
│       │   │   │   ├── AuthResponse.java
│       │   │   │   ├── UserDTO.java
│       │   │   │   ├── MessageDTO.java
│       │   │   │   ├── ConversationDTO.java
│       │   │   │   ├── SendMessageRequest.java
│       │   │   │   └── SignalMessage.java
│       │   │   ├── security/
│       │   │   │   ├── JwtUtils.java                ← Token creation + validation
│       │   │   │   ├── JwtAuthenticationFilter.java ← HTTP JWT filter
│       │   │   │   ├── UserDetailsServiceImpl.java  ← Spring Security bridge
│       │   │   │   └── WebSocketAuthInterceptor.java← STOMP auth interceptor
│       │   │   └── exception/
│       │   │       ├── ApiException.java
│       │   │       └── GlobalExceptionHandler.java
│       │   └── resources/
│       │       └── application.properties
│       └── test/
│           └── java/com/nextalk/
│               └── NexTalkApplicationTests.java
│
├── frontend/
│   ├── index.html       ← Login / Register page
│   ├── chat.html        ← Main chat interface
│   ├── css/
│   │   ├── auth.css     ← Login/register styles
│   │   └── chat.css     ← Chat interface styles
│   └── js/
│       ├── api.js       ← HTTP fetch utility
│       ├── auth.js      ← Login/register logic
│       ├── chat.js      ← Chat + WebSocket controller
│       └── webrtc.js    ← WebRTC calling manager
│
└── README.md
```

---

## Database Schema

```sql
users (id, username, email, password_hash, display_name, avatar_url, status, created_at)
conversations (id, type, name, created_by, created_at)
conversation_participants (id, conversation_id, user_id, joined_at, last_read_at)
messages (id, conversation_id, sender_id, content, type, sent_at, read_at)
```

**Design decisions:**
- `type ENUM('PRIVATE','GROUP')` in `conversations` allows the same schema to support both 1-to-1 and group chats
- `conversation_participants` has a `UNIQUE(conversation_id, user_id)` constraint preventing duplicate membership
- `messages` includes an index on `(conversation_id, sent_at)` for efficient paginated history queries
- `password_hash` stores BCrypt output — plaintext passwords are never persisted

---

## Prerequisites

| Requirement    | Minimum Version | Notes                        |
|----------------|-----------------|------------------------------|
| Java JDK       | 17              | LTS recommended              |
| Maven          | 3.8+            | Or use included `./mvnw`     |
| MySQL          | 8.0+            | Must be running locally      |
| Modern Browser | Chrome 90+      | For WebRTC support           |

---

## Quick Start

### 1 — Set up the database

```bash
# Log in to MySQL
mysql -u root -p

# Inside MySQL CLI:
source /path/to/NexTalk/database/schema.sql
```

### 2 — Configure the backend

Edit `backend/src/main/resources/application.properties`:

```properties
spring.datasource.url=jdbc:mysql://localhost:3306/nextalk_db?useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true
spring.datasource.username=root
spring.datasource.password=YOUR_PASSWORD_HERE

# Change this secret before any real deployment:
nextalk.jwt.secret=bmV4dGFsay1zZWNyZXQta2V5LWZvci1qd3QtYXV0aC0yMDI0LWxvbmctZW5vdWdo
nextalk.jwt.expiration=86400000
```

### 3 — Start the backend server

```bash
cd backend
./mvnw spring-boot:run
# Server starts on http://localhost:8080
```

Or build a JAR and run it:
```bash
./mvnw clean package -DskipTests
java -jar target/nextalk-server-1.0.0.jar
```

### 4 — Open the frontend

No build step is required — just open the HTML files directly:

```bash
# macOS
open frontend/index.html

# Or serve with any static server, e.g.:
npx serve frontend
# Then open http://localhost:3000
```

> **Note on CORS:** The backend allows all origins during development. When serving the frontend from a different port, this works out of the box.

### 5 — Test the app

1. Register two accounts in two browser windows/tabs
2. Log in as user A and click ✏️ → search for user B → open conversation
3. In user B's window, the conversation appears in the sidebar
4. Messages sent by A appear instantly in B's window via WebSocket
5. Click 📞 or 🎥 to initiate a call (allow microphone/camera access)

## Deploy On Vercel (Frontend)

This repository is now Vercel-ready for the frontend.

### Option A (recommended)

1. Import the repository in Vercel.
2. Keep root directory as repository root (a root `vercel.json` is already included).
3. Deploy.

### Option B

1. Set Vercel project root directory to `frontend/`.
2. Deploy as static site.

### Configure backend URL in production

The frontend supports runtime backend origin configuration. By default:

- Localhost frontend -> `http://localhost:8080`
- Non-localhost frontend -> same origin as frontend host

If your backend is hosted on a different domain, open the app once with a `backend` query param:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/?backend=https://YOUR-BACKEND-DOMAIN
```

This value is saved in `localStorage` as `nextalk_backend_origin` and used for:

- REST API (`/api`)
- SockJS/STOMP (`/ws`)
- media URLs (`/media`)

To reset backend origin mapping in browser:

```js
localStorage.removeItem('nextalk_backend_origin')
```

### Deploy Backend On Hugging Face (Docker Space)

The frontend is static and can stay on Vercel. Deploy the Java backend separately as a Docker Space.

1. Create a new Hugging Face Space with SDK set to `Docker`.
2. Use the backend folder files (`backend/pom.xml`, `backend/src`, `backend/public`, `backend/Dockerfile`).
3. The backend listens on Space port `7860` via `PORT` env var.

Required Hugging Face Space secrets:

- `MONGODB_URI` = your MongoDB Atlas URI
- `NEXTALK_JWT_SECRET` = strong random secret (base64/plain string)
- `NEXTALK_JWT_EXPIRATION` = token lifetime in ms (optional, default `86400000`)

After backend is live, expected URL format:

`https://<hf-username>-<space-name>.hf.space`

This project is preconfigured with default production backend origin:

`https://durgesh-kushwaha-nextalk.hf.space`

If you change your Space URL, override at runtime:

```js
localStorage.setItem('nextalk_backend_origin', 'https://YOUR-SPACE.hf.space')
location.reload()
```

## Install As Mobile/Desktop App (No Flutter)

The frontend now supports PWA install.

- Files added: `frontend/manifest.webmanifest`, `frontend/sw.js`, `frontend/js/pwa.js`
- App icon: `frontend/icons/icon.svg`

### How to install

1. Open the deployed URL (or local static URL) in Chrome/Safari.
2. Choose "Install App" (desktop Chrome) or "Add to Home Screen" (mobile browser).
3. Launch from home screen/app list.

### Data sync behavior

PWA and website use the same backend APIs and database, so all combinations share data:

- web -> web
- installed app (PWA) -> app
- app -> web

As long as both clients point to the same backend origin, chats/calls/users stay in sync.

---

## REST API Reference

All endpoints except `/api/auth/**` require:
```
Authorization: Bearer <JWT_TOKEN>
```

### Authentication

| Method | Endpoint             | Body                                    | Response        |
|--------|----------------------|-----------------------------------------|-----------------|
| POST   | `/api/auth/register` | `{username, email, password, displayName}` | `AuthResponse` |
| POST   | `/api/auth/login`    | `{username, password}`                  | `AuthResponse` |

**AuthResponse:**
```json
{
  "token": "eyJhbGci...",
  "type": "Bearer",
  "userId": 1,
  "username": "alice",
  "displayName": "Alice Johnson"
}
```

### Users

| Method | Endpoint                 | Description                        |
|--------|--------------------------|------------------------------------|
| GET    | `/api/users`             | All registered users (contact list)|
| GET    | `/api/users/me`          | Current authenticated user         |
| GET    | `/api/users/{id}`        | User by ID                         |
| GET    | `/api/users/search?q=`   | Search by username or display name |

### Conversations

| Method | Endpoint                        | Description                               |
|--------|---------------------------------|-------------------------------------------|
| GET    | `/api/conversations`            | User's conversations with last-message preview |
| GET    | `/api/conversations/{id}`       | Single conversation details               |
| POST   | `/api/conversations/private/{userId}` | Get or create a private chat with user |

### Messages

| Method | Endpoint                                     | Description                             |
|--------|----------------------------------------------|-----------------------------------------|
| GET    | `/api/conversations/{id}/messages`           | Message history (paginated, newest last)|
| POST   | `/api/conversations/{id}/messages`           | Send message (REST fallback path)       |

**Query params for GET messages:** `?page=0&size=50`

---

## WebSocket & STOMP Reference

### Connection

```javascript
const socket = new SockJS('http://localhost:8080/ws');
const client = new StompJs.Client({
  webSocketFactory: () => socket,
  connectHeaders: { Authorization: `Bearer ${token}` },
});
client.activate();
```

### Subscriptions

| Destination                       | Direction     | Description                              |
|-----------------------------------|---------------|------------------------------------------|
| `/topic/conversation/{id}`        | Server → Client (broadcast) | New messages in the conversation |
| `/user/queue/signals`             | Server → Client (unicast)   | WebRTC signals addressed to this user |
| `/user/queue/messages`            | Server → Client (unicast)   | System notifications (future use) |

### Publishing (Client → Server)

| Destination                 | Payload               | Description                      |
|-----------------------------|-----------------------|----------------------------------|
| `/app/chat/{conversationId}`| `{content: "text"}`   | Send a chat message              |
| `/app/signal`               | `SignalMessage` JSON  | Send a WebRTC signal             |

---

## WebRTC Signaling Flow

All signaling messages use the `SignalMessage` schema:

```json
{
  "type": "CALL_REQUEST | CALL_ACCEPTED | CALL_REJECTED | OFFER | ANSWER | ICE_CANDIDATE | CALL_ENDED",
  "fromUsername": "alice",
  "toUsername": "bob",
  "data": "<JSON string: SDP or ICE candidate>",
  "videoEnabled": true
}
```

### Step-by-step call setup

```
Alice                          Server                        Bob
  │                               │                           │
  │──── CALL_REQUEST ────────────►│──── CALL_REQUEST ────────►│
  │        {toUsername: "bob",     │                           │ [shows notification]
  │         videoEnabled: true}    │                           │
  │                               │◄─── CALL_ACCEPTED ────────│
  │◄─── CALL_ACCEPTED ────────────│                           │
  │                               │                           │
  │ [getUserMedia → createOffer]  │                           │
  │──── OFFER ───────────────────►│──── OFFER ───────────────►│
  │        {data: SDP offer}       │                           │ [getUserMedia]
  │                               │                           │ [setRemoteDesc]
  │                               │                           │ [createAnswer]
  │                               │◄─── ANSWER ───────────────│
  │◄─── ANSWER ────────────────────│                           │
  │ [setRemoteDesc]               │                           │
  │                               │                           │
  │◄────────── ICE_CANDIDATE ─────│◄──── ICE_CANDIDATE ───────│ (bidirectional)
  │──────────► ICE_CANDIDATE ─────►──── ICE_CANDIDATE ───────►│
  │                               │                           │
  │◄═══════════════ P2P Audio/Video Stream (direct) ══════════►│
  │                               │                           │
  │──── CALL_ENDED ──────────────►│──── CALL_ENDED ──────────►│
```

**STUN servers used:** `stun.l.google.com:19302` (public, free, no configuration needed)

**For production** — add TURN server credentials when users are behind strict enterprise NATs.

---

## Security Design

### Authentication

- **Mechanism:** Stateless JWT (HMAC-SHA256 / HS256)
- **Token storage:** `localStorage` in the browser (suitable for this learning project; use `httpOnly` cookies in a hardened production app)
- **Token lifetime:** 24 hours (configurable via `nextalk.jwt.expiration`)
- **Password storage:** BCrypt with default cost factor 10

### HTTP Security

- All endpoints except `/api/auth/**` and `/ws/**` require a valid JWT
- CSRF protection is disabled (appropriate for APIs using Bearer tokens, not cookies)
- CORS is configured to allow all origins during development

### WebSocket Security

- The STOMP CONNECT frame must include `Authorization: Bearer <token>`
- `WebSocketAuthInterceptor` validates the JWT and sets the Spring principal
- The `fromUsername` field in signals is always set by the server using the authenticated principal — clients cannot spoof the sender identity

### Input Validation

- All DTOs use Jakarta Bean Validation (`@NotBlank`, `@Email`, `@Size`)
- SQL injection is prevented by JPA parameterised queries
- HTML output is escaped in `chat.js` `escapeHtml()` to prevent XSS

---

## Android Integration Guide

The backend is fully compatible with Android clients — no server changes are needed.

### REST API

Use **Retrofit 2** for REST calls:

```kotlin
// build.gradle
implementation 'com.squareup.retrofit2:retrofit:2.9.0'
implementation 'com.squareup.retrofit2:converter-gson:2.9.0'
implementation 'com.squareup.okhttp3:logging-interceptor:4.10.0'

// Add JWT to every request via OkHttp Interceptor
val client = OkHttpClient.Builder()
    .addInterceptor { chain ->
        val request = chain.request().newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()
        chain.proceed(request)
    }
    .build()

// API interface
interface NexTalkApi {
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): AuthResponse

    @GET("conversations")
    suspend fun getConversations(): List<ConversationDTO>

    @GET("conversations/{id}/messages")
    suspend fun getMessages(@Path("id") id: Long): List<MessageDTO>
}
```

### WebSocket (STOMP)

Use **KROSSBOW** or **StompX** library for Android STOMP:

```kotlin
// Using OkHttp WebSocket directly with a STOMP client
implementation 'com.squareup.okhttp3:okhttp:4.10.0'
implementation 'ua.naiksoftware:stompclient:2.3.6' // or similar

val stompClient = Stomp.over(
    Stomp.ConnectionProvider.OKHTTP,
    "ws://YOUR_SERVER_IP:8080/ws/websocket"
)

stompClient.connect(
    listOf(StompHeader("Authorization", "Bearer $token"))
)

// Subscribe to conversation messages
stompClient.topic("/topic/conversation/$conversationId")
    .subscribe { frame ->
        val message = Gson().fromJson(frame.payload, MessageDTO::class.java)
        // Update RecyclerView
    }

// Subscribe to signals for calling
stompClient.topic("/user/queue/signals")
    .subscribe { frame ->
        val signal = Gson().fromJson(frame.payload, SignalMessage::class.java)
        webRTCManager.handleSignal(signal)
    }

// Send a message
stompClient.send("/app/chat/$conversationId",
    Gson().toJson(SendMessageRequest(content = "Hello!")))
```

### WebRTC on Android

Use the **official WebRTC Android library**:

```kotlin
implementation 'io.github.webrtc-sdk:android:104.5112.01'

// The signaling flow is identical to the browser — send/receive the same
// SignalMessage JSON objects via STOMP. Only the PeerConnection API differs:

val peerConnectionFactory = PeerConnectionFactory.builder().createPeerConnectionFactory()
val peerConnection = peerConnectionFactory.createPeerConnection(iceServers, observer)

// ICE servers (same as browser)
val iceServers = listOf(
    PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
)
```

---

## Configuration Reference

| Property                        | Default                         | Description                          |
|---------------------------------|---------------------------------|--------------------------------------|
| `server.port`                   | `8080`                          | HTTP server port                     |
| `spring.datasource.url`         | (MySQL localhost)               | Database JDBC URL                    |
| `spring.datasource.username`    | `root`                          | Database user                        |
| `spring.datasource.password`    | *(set this)*                    | Database password                    |
| `spring.jpa.hibernate.ddl-auto` | `update`                        | Schema strategy (use `validate` in prod) |
| `nextalk.jwt.secret`            | *(Base64, min 32 decoded bytes)*| JWT signing secret — **change this** |
| `nextalk.jwt.expiration`        | `86400000` (24 hours)           | JWT TTL in milliseconds              |

### Generating a secure JWT secret

```bash
# Generate a cryptographically secure 64-byte secret and Base64-encode it
openssl rand -base64 64
# Copy the output into application.properties as nextalk.jwt.secret
```

---

## Scalability Considerations

The current design is a **single-server deployment**. To scale horizontally:

1. **Replace the in-memory STOMP broker** with an external broker (RabbitMQ or ActiveMQ):
   ```java
   // In WebSocketConfig.java, replace:
   config.enableSimpleBroker("/topic", "/user");
   // With:
   config.enableStompBrokerRelay("/topic", "/user")
         .setRelayHost("rabbitmq-host")
         .setRelayPort(61613);
   ```

2. **Externalise JWT signing key** — move `nextalk.jwt.secret` to a secrets manager (AWS Secrets Manager, HashiCorp Vault)

3. **Add a TURN server** — for WebRTC connections behind enterprise NATs that block peer-to-peer UDP

4. **Database connection pooling** — HikariCP is already configured; increase `maximum-pool-size` and add read replicas for heavy read traffic

5. **Message pagination** — already implemented (page/size params on `/messages`); add cursor-based pagination for very large conversations

---

## License

This project is built as a learning demonstration. Free to use and modify.
