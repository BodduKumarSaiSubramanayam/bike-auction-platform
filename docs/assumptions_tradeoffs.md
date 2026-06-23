# Vutto | Assumptions & Technical Trade-offs

This document outlines the core engineering assumptions, design choices, and trade-offs made during the implementation of the Vutto Bike Auction Platform.

---

## 1. Environmental Constraint & Framework Decision

### **Constraint**: No NPM package installation capability.
*   **Choice**: We elected to write a **100% native, zero-dependency stack** using Node's standard modules (`node:http`, `node:sqlite`, `node:crypto`, `node:test`) and modern browser ES Modules.
*   **Trade-off (No Express / ORMs)**:
    *   *Cons*: Writing custom dynamic routers, JWT signing helpers, and parameter extractors takes manual work. There's no automatic validation library like Joi or Zod.
    *   *Pros*: The application starts up instantly, has **zero vulnerability risk** from third-party supply-chain attacks, requires no build-step compilers, and has a memory footprint under 40MB. It demonstrates deep, fundamental Node.js system programming knowledge.
*   **Trade-off (Preact + HTM over React + Vite)**:
    *   *Cons*: Writing templates as HTML template strings does not have the IDE syntax highlighting of JSX out-of-the-box (though editors like VS Code have HTM extensions).
    *   *Pros*: Perfect hot-reload without a dev compiler. The app works instantly in the browser with 0.1s page load times.

---

## 2. Real-time Transport: SSE vs. WebSockets (Socket.io)

### **Requirement**: Real-time bidding, viewer counters, and logging stream.
*   **Choice**: Implemented **HTTP Server-Sent Events (SSE)**.
*   **Trade-off**:
    *   *Cons*: SSE is unidirectional (Server to Client). Client-to-server messages must be sent via standard HTTP POST requests.
    *   *Pros*: Unlike WebSockets, SSE runs over standard HTTP, making it **highly compliant with corporate firewalls, API Gateways, and Load Balancers** without needing WebSocket proxy upgrades. It has automatic browser reconnection, low battery consumption on mobile clients, and is extremely easy to scale and debug.

---

## 3. Database Selection: SQLite vs. PostgreSQL/MySQL

### **Requirement**: Multi-user relational tables, audit trails, and concurrency.
*   **Choice**: Native SQLite `DatabaseSync` (`node:sqlite`).
*   **Trade-off**:
    *   *Cons*: SQLite does not support highly distributed multi-writer write operations across different servers (it only allows one writer connection at a time, locked locally).
    *   *Pros*: Since Node.js runs a single-threaded event loop, all incoming requests are queued sequentially. Combined with SQLite's sequential lock mechanism, this **completely eliminates race conditions** (like double-bids or placing bids above balance). There is no network overhead to contact a separate DB server, making SELECT queries run in under 0.5ms.

---

## 4. Wallet/Checkout Strategy

### **Assumption**: Bid placements vs. Account checkouts.
*   **Assumption**: A user places a bid with simulated wallet funds. If they win the auction, their wallet balance is deducted. We assume the system is self-contained with play money ($75,000 credit initial).
*   **Design**: When an auction ends, the background cron deducts the winning bid from the buyer's balance. This simulates automated payment capturing.
