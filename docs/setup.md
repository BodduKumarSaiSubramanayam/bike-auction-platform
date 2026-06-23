# Vutto | Setup & Execution Guide

This document describes how to boot and run the Vutto Bike Auction Platform on your local environment.

---

## 1. Prerequisites

Because Vutto uses Node's native SQLite, Server-Sent Events, and browser-native ES Modules, you do **not** need to install any external database engines (like MySQL/PostgreSQL), key-value stores (like Redis), or compile libraries.

The only software required is:
- **Node.js** (version 22.5.0 or higher is required for built-in SQLite support). On the Antigravity sandbox, `agy-node` is used which maps to **Node.js v24.14.0**.

---

## 2. Booting the Application

Since there are no third-party package dependencies, there is **no need to run npm install**! You can start the server immediately.

1.  Open your terminal/command prompt.
2.  Navigate to the project root directory:
    ```bash
    cd "c:\Users\sai kumar\OneDrive\Desktop\vutto"
    ```
3.  Start the web application server:
    ```bash
    agy-node server/index.js
    ```
4.  Once started, the console will print:
    ```text
    [2026-06-22T09:44:49Z] INFO: Database schema initialized.
    [2026-06-22T09:44:49Z] INFO: Starting background Auction Lifecycle Service...
    [2026-06-22T09:44:49Z] INFO: Bike Auction Platform Server running at http://localhost:5000
    [2026-06-22T09:44:49Z] INFO: Serving static files from directory: C:\Users\sai kumar\OneDrive\Desktop\vutto\public
    ```
5.  Open your browser and navigate to: [http://localhost:5000](http://localhost:5000)

---

## 3. Seeded Accounts for Testing

The database automatically initializes and populates itself with test users and active/upcoming/closed auctions. Use the credentials below to log in:

### Administrator Account
*   **Role**: Create auctions, cancel active listings, view real-time latency graphs, stream server logs console.
*   **Email**: `admin@bikeauction.com`
*   **Password**: `Admin123!`

### Buyer Accounts
*   **Role**: Place live bids on active auctions, view countdown clocks, track wallet credit balances.
*   **Email 1**: `buyer1@bikeauction.com`
*   **Password 1**: `Buyer123!`
*   **Balance 1**: $75,000 (Simulated cash)

*   **Email 2**: `buyer2@bikeauction.com`
*   **Password 2**: `Buyer123!`
*   **Balance 2**: $60,000 (Simulated cash)

---

## 4. Running Automated Integration Tests

Vutto features an integration test suite built with Node's native `node:test` runner.

To run the automated tests:
1.  From the project root directory, run:
    ```bash
    agy-node --test server/tests/auth.test.js server/tests/auctions.test.js
    ```
2.  The test runner will spawn isolated, temporary SQLite test databases and print the final report:
    ```text
    ✔ Auction and Live Bidding Service Integration (7322.4064ms)
    ✔ Auth System Integration (212.1119ms)
    ℹ tests 15
    ℹ pass 15
    ℹ fail 0
    ```
