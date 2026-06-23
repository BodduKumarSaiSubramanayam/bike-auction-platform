# Vutto | Premium Motorcycle Live Auction Platform

Vutto is a production-grade, high-performance Live Auction Platform for pre-owned motorcycles. It is built as a **zero-dependency, zero-install, zero-build monorepo** designed to run out-of-the-box with a single command. 

The application utilizes native APIs introduced in modern Node.js and browser environments to provide a fast, secure, and observable real-time bidding experience.

---

## 🌟 Key Features

### 🏍️ Live & Scheduled Bidding
*   **Multiple Simultaneous Auctions**: Supports concurrent auctions tracking live, scheduled, and closed statuses.
*   **Real-time Bidding & Viewers**: Web-native **Server-Sent Events (SSE)** broadcast bid updates, increments, and unique viewer counts instantly.
*   **Micro-Animations & Audio Feedback**: Subtle visual pulses and audio chimes trigger when placing bids, winning, or being outbid.
*   **Winner Auto-Finalization**: Background lifecycle chron tracker checks schedules, computes winner (if reserve price met), captures funds, and notifies users.

### 📊 Observability & System Metrics
*   **API Telemetry Chart**: Real-time SVG line charts track request latency logs over time.
*   **Live Console Log Streaming**: Admin dashboard feeds structured JSON logs (INFO, WARN, ERROR) live from the server over SSE.
*   **Hardware Profiler**: Live charts showing system RAM heap usage (MB) and request rates.

### 🛡️ Security & Authentication
*   **Custom JWT Tokens**: Middleware parses URL query credentials (for SSE EventSource) and standard headers, verifying HMAC-SHA256 signatures.
*   **PBKDF2 Hashing**: Standard password salting + hashing using Node's cryptographic PBKDF2 function.
*   **Double-spend Prevention**: The event loop combined with SQLite's sequential file locking guarantees atomic bidding updates.

---

## 🛠️ Technology Stack

*   **Backend**: Pure Node.js (via `node:http`), custom REST & SSE router.
*   **Database**: SQLite via native `node:sqlite` (DatabaseSync API).
*   **Real-time System**: Unidirectional HTTP Server-Sent Events (SSE).
*   **Frontend**: Preact (3KB React-compliant) & HTM (Hyperscript Tagged Markup) served natively as ES Modules. Custom Tailwind-free Vanilla CSS.
*   **Automated Testing**: Integration test suite built on native `node:test` and `node:assert`.

---

## 🚀 Getting Started (Quick Run)

Vutto has **zero third-party dependencies**—no need to run `npm install`!

1.  **Start the Web Server**:
    ```bash
    agy-node server/index.js
    ```
2.  **Access the Platform**:
    Open [http://localhost:5000](http://localhost:5000) in your web browser.

### Seeded Credentials:
*   **Super Admin**: `admin@bikeauction.com` | Password: `Admin123!`
*   **Buyer 1**: `buyer1@bikeauction.com` | Password: `Buyer123!` (Balance: $75,000)
*   **Buyer 2**: `buyer2@bikeauction.com` | Password: `Buyer123!` (Balance: $60,000)

---

## 🧪 Automated Testing

Verify the platform's endpoints, JWT auth, and bidding constraint logic using Node's test runner:
```bash
agy-node --test server/tests/auth.test.js server/tests/auctions.test.js
```

---

## 📂 Documentation Directory

For deep architectural and deployment details, view:
1.  [Architecture & Design Document](file:///c:/Users/sai%20kumar/OneDrive/Desktop/vutto/docs/architecture.md)
2.  [Detailed Setup Instructions](file:///c:/Users/sai%20kumar/OneDrive/Desktop/vutto/docs/setup.md)
3.  [Production Deployment Guide](file:///c:/Users/sai%20kumar/OneDrive/Desktop/vutto/docs/deployment.md)
4.  [Assumptions & Trade-offs](file:///c:/Users/sai%20kumar/OneDrive/Desktop/vutto/docs/assumptions_tradeoffs.md)
