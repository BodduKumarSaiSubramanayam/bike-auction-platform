import { db } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { broadcastAuctionStatus } from './streamService.js';

let checkIntervalId = null;

/**
 * Checks for auctions scheduled to start or expire, transitions their statuses, and broadcasts updates.
 */
export function checkAuctionLifecycles() {
  const now = new Date().toISOString();

  // 1. SCHEDULED -> ACTIVE
  try {
    const upcomingAuctions = db.prepare(`
      SELECT * FROM auctions 
      WHERE status = 'SCHEDULED' AND startTime <= ?
    `).all(now);

    if (upcomingAuctions.length > 0) {
      const activateStmt = db.prepare("UPDATE auctions SET status = 'ACTIVE' WHERE id = ?");
      
      for (const auction of upcomingAuctions) {
        activateStmt.run(auction.id);
        logger.info(`Auction [${auction.title}] is now LIVE (ACTIVE).`);
        broadcastAuctionStatus(auction.id, 'ACTIVE');
      }
    }
  } catch (error) {
    logger.error("Error transitioning scheduled auctions to active:", error);
  }

  // 2. ACTIVE -> ENDED
  try {
    const runningAuctions = db.prepare(`
      SELECT * FROM auctions 
      WHERE status = 'ACTIVE' AND endTime <= ?
    `).all(now);

    if (runningAuctions.length > 0) {
      const endStmt = db.prepare("UPDATE auctions SET status = 'ENDED', winnerId = ? WHERE id = ?");
      
      for (const auction of runningAuctions) {
        // Fetch the highest bid
        const highestBid = db.prepare(`
          SELECT b.*, u.name as bidderName FROM bids b
          JOIN users u ON b.bidderId = u.id
          WHERE b.auctionId = ?
          ORDER BY b.amount DESC LIMIT 1
        `).get(auction.id);

        let winnerId = null;
        let winnerName = null;
        let finalPrice = auction.currentBid;

        if (highestBid && highestBid.amount >= auction.reservePrice) {
          // Reserve price met!
          winnerId = highestBid.bidderId;
          winnerName = highestBid.bidderName;
          finalPrice = highestBid.amount;
          
          endStmt.run(winnerId, auction.id);
          logger.info(`Auction [${auction.title}] ended. Sold to ${winnerName} for $${finalPrice}.`);
          
          // Deduct from winner's balance (simulated checkout transaction)
          try {
            db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(finalPrice, winnerId);
            logger.info(`Deducted $${finalPrice} from user [${winnerName}] balance.`);
          } catch (balanceErr) {
            logger.error(`Failed to deduct balance for user [${winnerName}]:`, balanceErr);
          }
        } else {
          // Unsold (No bids or reserve not met)
          endStmt.run(null, auction.id);
          const highestBidAmt = highestBid ? highestBid.amount : 0.0;
          logger.info(`Auction [${auction.title}] ended UNSOLD. Reserve was $${auction.reservePrice}, highest bid was $${highestBidAmt}.`);
        }

        broadcastAuctionStatus(auction.id, 'ENDED', {
          winnerId,
          winnerName,
          finalPrice
        });
      }
    }
  } catch (error) {
    logger.error("Error finalizing expired active auctions:", error);
  }
}

/**
 * Start the background polling timer (runs every 5 seconds).
 */
export function startAuctionLifecycleService() {
  if (checkIntervalId) return;
  
  logger.info("Starting background Auction Lifecycle Service...");
  
  // Run once immediately on start
  checkAuctionLifecycles();
  
  // Check every 5 seconds
  checkIntervalId = setInterval(checkAuctionLifecycles, 5000);
}

/**
 * Stop the background polling timer.
 */
export function stopAuctionLifecycleService() {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
    logger.info("Stopped background Auction Lifecycle Service.");
  }
}
