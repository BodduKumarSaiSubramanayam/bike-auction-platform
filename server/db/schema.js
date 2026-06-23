import { db } from './connection.js';
import { hashPassword } from '../utils/crypto.js';
import crypto from 'node:crypto';

/**
 * Initializes the SQLite database schema if not already present.
 */
export function initSchema() {
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('BUYER', 'ADMIN')),
      balance REAL DEFAULT 50000.0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auctions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      mileage INTEGER NOT NULL,
      image TEXT NOT NULL,
      startPrice REAL NOT NULL,
      reservePrice REAL NOT NULL,
      currentBid REAL DEFAULT 0.0,
      increment REAL DEFAULT 500.0,
      status TEXT NOT NULL CHECK(status IN ('SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED')),
      startTime TEXT NOT NULL,
      endTime TEXT NOT NULL,
      creatorId TEXT NOT NULL,
      winnerId TEXT,
      views INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(creatorId) REFERENCES users(id),
      FOREIGN KEY(winnerId) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      auctionId TEXT NOT NULL,
      bidderId TEXT NOT NULL,
      amount REAL NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE,
      FOREIGN KEY(bidderId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL CHECK(level IN ('INFO', 'WARN', 'ERROR')),
      message TEXT NOT NULL,
      details TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_views (
      userId TEXT NOT NULL,
      auctionId TEXT NOT NULL,
      PRIMARY KEY (userId, auctionId),
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(auctionId) REFERENCES auctions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_bids_auctionId ON bids(auctionId);
    CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
  `);

  // Ensure "views" column exists in auctions table
  try {
    const tableInfo = db.prepare("PRAGMA table_info(auctions)").all();
    const hasViews = tableInfo.some(col => col.name === 'views');
    if (!hasViews) {
      db.exec("ALTER TABLE auctions ADD COLUMN views INTEGER DEFAULT 0");
      console.log("Migration: Added views column to auctions table.");
    }
  } catch (err) {
    console.error("Migration check failed:", err);
  }
}

/**
 * Seeds initial mock data for testing.
 */
export function seedData() {
  const userCheck = db.prepare("SELECT count(*) as count FROM users").get();
  if (userCheck.count > 0) {
    return; // Already seeded
  }

  console.log("Seeding mock database data...");

  // Create Users
  const adminId = crypto.randomUUID();
  const buyer1Id = crypto.randomUUID();
  const buyer2Id = crypto.randomUUID();

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, passwordHash, name, role, balance, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    adminId,
    "admin@bikeauction.com",
    hashPassword("Admin123!"),
    "Super Admin",
    "ADMIN",
    1000000.0,
    new Date().toISOString()
  );

  insertUser.run(
    buyer1Id,
    "buyer1@bikeauction.com",
    hashPassword("Buyer123!"),
    "Alex Mercer",
    "BUYER",
    75000.0,
    new Date().toISOString()
  );

  insertUser.run(
    buyer2Id,
    "buyer2@bikeauction.com",
    hashPassword("Buyer123!"),
    "Sarah Connor",
    "BUYER",
    60000.0,
    new Date().toISOString()
  );

  // Create Auctions
  const insertAuction = db.prepare(`
    INSERT INTO auctions (id, title, description, make, model, year, mileage, image, startPrice, reservePrice, currentBid, increment, status, startTime, endTime, creatorId, winnerId, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date();
  
  // 1. Live/Active Auction
  const activeAuctionId = crypto.randomUUID();
  const startActive = new Date(now.getTime() - 10 * 60 * 1000).toISOString(); // Started 10 mins ago
  const endActive = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();   // Ends in 10 days
  insertAuction.run(
    activeAuctionId,
    "2021 Ducati Panigale V4 S",
    "Stunning Ducati Panigale V4 S in pristine condition. Carbon fiber upgrades, low mileage, dealer serviced regularly. Dynamic riding modes and Ohlins suspension.",
    "Ducati",
    "Panigale V4 S",
    2021,
    4200,
    "https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&q=80&w=800",
    22000.0,
    25000.0,
    22000.0,
    500.0,
    "ACTIVE",
    startActive,
    endActive,
    adminId,
    null,
    now.toISOString()
  );

  // 2. Live/Active Auction 2 (Harley-Davidson)
  const schedAuctionId = crypto.randomUUID();
  const startSched = new Date(now.getTime() - 5 * 60 * 1000).toISOString(); // Started 5 mins ago
  const endSched = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();   // Ends in 10 days
  insertAuction.run(
    schedAuctionId,
    "2019 Harley-Davidson Iron 883",
    "Matte Black Iron 883 cruiser. Fuel-injected Evolution engine, custom Vance & Hines exhaust, comfortable solo seat. Perfect for city commuting and weekend cruises.",
    "Harley-Davidson",
    "Iron 883",
    2019,
    8900,
    "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&q=80&w=800",
    8000.0,
    9500.0,
    8000.0,
    250.0,
    "ACTIVE",
    startSched,
    endSched,
    adminId,
    null,
    now.toISOString()
  );

  // 3. Live/Active Auction 3 (Yamaha)
  const completedAuctionId = crypto.randomUUID();
  const startCompleted = new Date(now.getTime() - 20 * 60 * 1000).toISOString(); // Started 20 mins ago
  const endCompleted = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();   // Ends in 10 days
  insertAuction.run(
    completedAuctionId,
    "2020 Yamaha YZF-R6",
    "Aggressive Yamaha YZF-R6 sports bike. Race-ready performance, quick shifter, traction control. The last pure track-ready street legal machine.",
    "Yamaha",
    "YZF-R6",
    2020,
    6100,
    "https://images.unsplash.com/photo-1449426468159-d96dbf08f19f?auto=format&fit=crop&q=80&w=800",
    12000.0,
    13500.0,
    14000.0,
    200.0,
    "ACTIVE",
    startCompleted,
    endCompleted,
    adminId,
    null, // Currently active, no winner yet
    now.toISOString()
  );

  // Create mock bid history for completed auction
  const insertBid = db.prepare(`
    INSERT INTO bids (id, auctionId, bidderId, amount, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertBid.run(
    crypto.randomUUID(),
    completedAuctionId,
    buyer2Id,
    12500.0,
    new Date(now.getTime() - 2 * 60 * 60 * 1000 - 45 * 60 * 1000).toISOString()
  );

  insertBid.run(
    crypto.randomUUID(),
    completedAuctionId,
    buyer1Id,
    13000.0,
    new Date(now.getTime() - 2 * 60 * 60 * 1000 - 30 * 60 * 1000).toISOString()
  );

  insertBid.run(
    crypto.randomUUID(),
    completedAuctionId,
    buyer2Id,
    13500.0,
    new Date(now.getTime() - 2 * 60 * 60 * 1000 - 15 * 60 * 1000).toISOString()
  );

  insertBid.run(
    crypto.randomUUID(),
    completedAuctionId,
    buyer1Id,
    14000.0,
    new Date(now.getTime() - 2 * 60 * 60 * 1000 - 2 * 60 * 1000).toISOString()
  );

  // 4. Live/Active Auction 4 (BMW)
  const unsoldAuctionId = crypto.randomUUID();
  const startUnsold = new Date(now.getTime() - 30 * 60 * 1000).toISOString(); // Started 30 mins ago
  const endUnsold = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();   // Ends in 10 days
  insertAuction.run(
    unsoldAuctionId,
    "2018 BMW R1250GS Adventure",
    "Long-distance touring machine. Heated grips, full panniers luggage set, electronic suspension adjustment. Unsold as reserve price was not met.",
    "BMW",
    "R1250GS Adventure",
    2018,
    18200,
    "https://images.unsplash.com/photo-1599819811279-d5ad9cccf838?auto=format&fit=crop&q=80&w=800",
    16000.0,
    19000.0,
    17000.0,
    500.0,
    "ACTIVE",
    startUnsold,
    endUnsold,
    adminId,
    null,
    now.toISOString()
  );

  insertBid.run(
    crypto.randomUUID(),
    unsoldAuctionId,
    buyer1Id,
    16500.0,
    new Date(now.getTime() - 4 * 60 * 60 * 1000 - 30 * 60 * 1000).toISOString()
  );

  insertBid.run(
    crypto.randomUUID(),
    unsoldAuctionId,
    buyer2Id,
    17000.0,
    new Date(now.getTime() - 4 * 60 * 60 * 1000 - 10 * 60 * 1000).toISOString()
  );

  console.log("Mock database seeding completed.");
}
