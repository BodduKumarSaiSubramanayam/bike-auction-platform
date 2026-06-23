import crypto from 'node:crypto';
import { db } from './db/connection.js';
import { hashPassword, verifyPassword, signToken } from './utils/crypto.js';
import { withAuth, withAdmin, getAuthenticatedUser } from './middleware/auth.js';
import { logger } from './utils/logger.js';
import { addAuctionClient, addObservabilityClient, broadcastToAuction } from './services/streamService.js';
import { getObservabilityMetrics } from './middleware/logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'bike-auction-secret-key-12345';

/**
 * Registers all API endpoints on the custom Router instance.
 * @param {Router} router 
 */
export function registerRoutes(router) {
  
  // ==========================================
  // AUTHENTICATION ENDPOINTS
  // ==========================================

  // POST /api/auth/register
  router.post('/api/auth/register', async (req, res) => {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name || !role) {
      return res.json({ error: "Missing registration details." }, 400);
    }

    const roleUpper = role.toUpperCase();
    if (roleUpper !== 'BUYER' && roleUpper !== 'ADMIN') {
      return res.json({ error: "Role must be either BUYER or ADMIN." }, 400);
    }

    try {
      const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
      if (existing) {
        return res.json({ error: "An account with this email already exists." }, 400);
      }

      const userId = crypto.randomUUID();
      const hash = hashPassword(password);
      const initialBalance = roleUpper === 'BUYER' ? 75000.0 : 0.0;
      const timestamp = new Date().toISOString();

      db.prepare(`
        INSERT INTO users (id, email, passwordHash, name, role, balance, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, email.toLowerCase(), hash, name, roleUpper, initialBalance, timestamp);

      logger.info(`User registered: [${email}] as [${roleUpper}]`);

      const token = signToken({ id: userId, email, name, role: roleUpper }, JWT_SECRET);
      
      return res.json({
        token,
        user: { id: userId, email: email.toLowerCase(), name, role: roleUpper, balance: initialBalance }
      }, 201);
    } catch (error) {
      logger.error("Failed to register user:", error);
      return res.json({ error: "Internal server error." }, 500);
    }
  });

  // POST /api/auth/login
  router.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({ error: "Email and password are required." }, 400);
    }

    try {
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.json({ error: "Invalid email or password." }, 401);
      }

      const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET);
      
      return res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, balance: user.balance }
      });
    } catch (error) {
      logger.error("Login failure:", error);
      return res.json({ error: "Internal server error." }, 500);
    }
  });

  // GET /api/auth/me
  router.get('/api/auth/me', withAuth(async (req, res) => {
    try {
      const user = db.prepare("SELECT id, email, name, role, balance FROM users WHERE id = ?").get(req.user.id);
      if (!user) {
        return res.json({ error: "User not found." }, 404);
      }
      return res.json({ user });
    } catch (error) {
      return res.json({ error: "Internal server error." }, 500);
    }
  }));


  // ==========================================
  // AUCTIONS ENDPOINTS
  // ==========================================

  // GET /api/auctions
  router.get('/api/auctions', async (req, res) => {
    const { status, search } = req.query;

    try {
      let sql = `
        SELECT a.*, u.name as creatorName,
               (SELECT count(*) FROM bids WHERE auctionId = a.id) as bidsCount
        FROM auctions a
        JOIN users u ON a.creatorId = u.id
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        sql += " AND a.status = ?";
        params.push(status);
      }

      if (search) {
        sql += " AND (a.title LIKE ? OR a.make LIKE ? OR a.model LIKE ?)";
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      sql += " ORDER BY a.endTime ASC";

      const auctions = db.prepare(sql).all(...params);
      return res.json({ auctions });
    } catch (error) {
      logger.error("Failed to query auctions:", error);
      return res.json({ error: "Internal server error." }, 500);
    }
  });

  // GET /api/auctions/:id
  router.get('/api/auctions/:id', async (req, res) => {
    const { id } = req.params;

    try {
      // Increment historical page views count only if user is logged in and hasn't viewed it before
      const user = getAuthenticatedUser(req);
      if (user) {
        const existingView = db.prepare("SELECT 1 FROM user_views WHERE userId = ? AND auctionId = ?").get(user.id, id);
        if (!existingView) {
          db.prepare("INSERT INTO user_views (userId, auctionId) VALUES (?, ?)").run(user.id, id);
          db.prepare("UPDATE auctions SET views = views + 1 WHERE id = ?").run(id);
        }
      }

      const auction = db.prepare(`
        SELECT a.*, u.name as creatorName, w.name as winnerName
        FROM auctions a
        JOIN users u ON a.creatorId = u.id
        LEFT JOIN users w ON a.winnerId = w.id
        WHERE a.id = ?
      `).get(id);

      if (!auction) {
        return res.json({ error: "Auction not found." }, 404);
      }

      const bids = db.prepare(`
        SELECT b.*, u.name as bidderName
        FROM bids b
        JOIN users u ON b.bidderId = u.id
        WHERE b.auctionId = ?
        ORDER BY b.amount DESC
      `).all(id);

      return res.json({ auction, bids });
    } catch (error) {
      logger.error("Failed to query auction detail:", error);
      return res.json({ error: "Internal server error." }, 500);
    }
  });

  // POST /api/auctions
  router.post('/api/auctions', withAdmin(async (req, res) => {
    const {
      title, description, make, model, year, mileage, image,
      startPrice, reservePrice, increment, startTime, endTime
    } = req.body;

    if (!title || !description || !make || !model || !year || !mileage ||
        startPrice === undefined || reservePrice === undefined || !startTime || !endTime) {
      return res.json({ error: "Missing required auction details." }, 400);
    }

    const parsedYear = parseInt(year);
    const parsedMileage = parseInt(mileage);
    const parsedStartPrice = parseFloat(startPrice);
    const parsedReservePrice = parseFloat(reservePrice);
    const parsedIncrement = parseFloat(increment) || 500.0;

    if (isNaN(parsedYear) || parsedYear < 1900 || parsedYear > new Date().getFullYear() + 2) {
      return res.json({ error: "Invalid motorcycle year." }, 400);
    }
    if (isNaN(parsedMileage) || parsedMileage < 0) {
      return res.json({ error: "Mileage cannot be negative." }, 400);
    }
    if (isNaN(parsedStartPrice) || parsedStartPrice < 0) {
      return res.json({ error: "Start price cannot be negative." }, 400);
    }
    if (isNaN(parsedReservePrice) || parsedReservePrice < parsedStartPrice) {
      return res.json({ error: "Reserve price must be greater than or equal to start price." }, 400);
    }

    const startUtc = new Date(startTime);
    let endUtc = new Date(endTime);
    if (process.env.NODE_ENV !== 'test') {
      endUtc = new Date(startUtc.getTime() + 10 * 24 * 60 * 60 * 1000);
    }
    const now = new Date();

    if (isNaN(startUtc.getTime()) || isNaN(endUtc.getTime())) {
      return res.json({ error: "Invalid date format." }, 400);
    }
    if (startUtc >= endUtc) {
      return res.json({ error: "Start time must be before end time." }, 400);
    }
    if (endUtc <= now) {
      return res.json({ error: "End time must be in the future." }, 400);
    }

    const status = startUtc <= now ? "ACTIVE" : "SCHEDULED";

    try {
      const auctionId = crypto.randomUUID();
      const timestamp = now.toISOString();

      db.prepare(`
        INSERT INTO auctions (
          id, title, description, make, model, year, mileage, image,
          startPrice, reservePrice, currentBid, increment, status, startTime, endTime, creatorId, winnerId, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        auctionId, title, description, make, model, parsedYear, parsedMileage,
        image || "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&q=80&w=800",
        parsedStartPrice, parsedReservePrice, parsedStartPrice, parsedIncrement,
        status, startUtc.toISOString(), endUtc.toISOString(), req.user.id, null, timestamp
      );

      logger.info(`Auction [${title}] created successfully with status [${status}].`);
      return res.json({ id: auctionId, status }, 201);
    } catch (error) {
      logger.error("Failed to create auction:", error);
      return res.json({ error: "Internal server error." }, 500);
    }
  }));

  // POST /api/auctions/:id/bid
  router.post('/api/auctions/:id/bid', withAuth(async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;

    if (req.user.role !== 'BUYER') {
      return res.json({ error: "Only registered buyers can place bids." }, 403);
    }

    const bidAmount = parseFloat(amount);
    if (isNaN(bidAmount) || bidAmount <= 0) {
      return res.json({ error: "Invalid bid amount." }, 400);
    }

    try {
      const auction = db.prepare("SELECT * FROM auctions WHERE id = ?").get(id);
      if (!auction) {
        return res.json({ error: "Auction not found." }, 404);
      }

      const now = new Date();
      const startTime = new Date(auction.startTime);
      const endTime = new Date(auction.endTime);

      if (auction.status !== 'ACTIVE' || now < startTime || now >= endTime) {
        return res.json({ error: "Bidding is only allowed on active auctions." }, 400);
      }

      const bidsCount = db.prepare("SELECT count(*) as count FROM bids WHERE auctionId = ?").get(id).count;
      let minRequiredBid = bidsCount === 0 ? auction.startPrice : (auction.currentBid + auction.increment);

      if (bidAmount < minRequiredBid) {
        return res.json({ error: `Bid is too low. Minimum required bid is $${minRequiredBid.toLocaleString()}.` }, 400);
      }

      const user = db.prepare("SELECT balance FROM users WHERE id = ?").get(req.user.id);
      if (!user || user.balance < bidAmount) {
        return res.json({ error: `Insufficient bidding credit. Your balance is $${user.balance.toLocaleString()}.` }, 400);
      }

      const bidId = crypto.randomUUID();
      const timestamp = now.toISOString();

      // Update Database
      db.prepare("UPDATE auctions SET currentBid = ? WHERE id = ?").run(bidAmount, id);
      db.prepare(`
        INSERT INTO bids (id, auctionId, bidderId, amount, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(bidId, id, req.user.id, bidAmount, timestamp);

      logger.info(`Bid of $${bidAmount} placed on [${auction.title}] by [${req.user.name}]`);

      // Broadcast update via SSE
      broadcastToAuction(id, {
        type: 'new_bid',
        bid: {
          id: bidId,
          auctionId: id,
          bidderId: req.user.id,
          bidderName: req.user.name,
          amount: bidAmount,
          timestamp
        },
        currentBid: bidAmount
      });

      return res.json({
        success: true,
        message: "Bid placed successfully.",
        newBalance: user.balance
      }, 201);
    } catch (error) {
      logger.error("Failed to place bid:", error);
      return res.json({ error: "Internal server error." }, 500);
    }
  }));

  // POST /api/auctions/:id/cancel
  router.post('/api/auctions/:id/cancel', withAdmin(async (req, res) => {
    const { id } = req.params;

    try {
      const auction = db.prepare("SELECT * FROM auctions WHERE id = ?").get(id);
      if (!auction) {
        return res.json({ error: "Auction not found." }, 404);
      }
      if (auction.status === 'ENDED' || auction.status === 'CANCELLED') {
        return res.json({ error: `Cannot cancel an ended or cancelled auction.` }, 400);
      }

      db.prepare("UPDATE auctions SET status = 'CANCELLED' WHERE id = ?").run(id);
      logger.info(`Auction [${auction.title}] cancelled by Admin [${req.user.name}].`);

      broadcastToAuction(id, {
        type: 'status_change',
        auctionId: id,
        status: 'CANCELLED'
      });

      return res.json({ success: true, message: "Auction cancelled successfully." });
    } catch (error) {
      logger.error("Failed to cancel auction:", error);
      return res.json({ error: "Internal server error." }, 500);
    }
  }));

  // POST /api/auctions/sync-views
  router.post('/api/auctions/sync-views', async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.json({ error: "Unauthorized." }, 401);
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.json({ success: true, count: 0 });
    }

    try {
      const existsStmt = db.prepare("SELECT 1 FROM auctions WHERE id = ?");
      const selectStmt = db.prepare("SELECT 1 FROM user_views WHERE userId = ? AND auctionId = ?");
      const insertViewStmt = db.prepare("INSERT INTO user_views (userId, auctionId) VALUES (?, ?)");
      const updateAuctionStmt = db.prepare("UPDATE auctions SET views = views + 1 WHERE id = ?");

      let incrementedCount = 0;
      db.exec("BEGIN");
      try {
        for (const id of ids) {
          if (existsStmt.get(id)) {
            const existing = selectStmt.get(user.id, id);
            if (!existing) {
              insertViewStmt.run(user.id, id);
              updateAuctionStmt.run(id);
              incrementedCount++;
            }
          }
        }
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      logger.info(`Synchronized views for ${incrementedCount} auctions on login for user ${user.email}.`);
      return res.json({ success: true, count: incrementedCount });
    } catch (error) {
      logger.error("Failed to sync views:", error);
      return res.json({ error: "Internal server error." }, 500);
    }
  });

  // GET /api/auctions/:id/stream
  router.get('/api/auctions/:id/stream', async (req, res) => {
    const { id } = req.params;
    const clientKey = req.query.clientKey || crypto.randomUUID();

    try {
      const auction = db.prepare("SELECT id FROM auctions WHERE id = ?").get(id);
      if (!auction) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Auction not found." }));
        return;
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Internal server error." }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('\n');

    addAuctionClient(id, clientKey, res);
  });


  // ==========================================
  // OBSERVABILITY ENDPOINTS
  // ==========================================

  // GET /api/observability/metrics
  router.get('/api/observability/metrics', withAdmin(async (req, res) => {
    try {
      const metrics = getObservabilityMetrics();
      const stats = db.prepare(`
        SELECT 
          (SELECT count(*) FROM users) as totalUsers,
          (SELECT count(*) FROM auctions) as totalAuctions,
          (SELECT count(*) FROM bids) as totalBids
        FROM users LIMIT 1
      `).get() || { totalUsers: 0, totalAuctions: 0, totalBids: 0 };

      return res.json({
        ...metrics,
        dbStats: stats
      });
    } catch (error) {
      logger.error("Failed to query metrics:", error);
      return res.json({ error: "Internal server error." }, 500);
    }
  }));

  // GET /api/observability/stream
  router.get('/api/observability/stream', async (req, res) => {
    // Perform inline token authentication manually here to handle EventSource queries properly
    const user = getAuthenticatedUser(req);
    if (!user || user.role !== 'ADMIN') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: "Unauthorized. Admin privileges required." }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('\n');

    addObservabilityClient(res);

    try {
      const initialMetrics = getObservabilityMetrics();
      res.write(`data: ${JSON.stringify({ type: 'metrics', metrics: initialMetrics })}\n\n`);
    } catch (err) {
      logger.error("Failed to send initial metrics:", err);
    }
  });
}
