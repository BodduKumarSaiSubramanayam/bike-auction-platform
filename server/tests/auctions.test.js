import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { checkAuctionLifecycles } from '../services/auctionManager.js';

let server = null;
let port = 0;
let baseUrl = "";

test.before(async () => {
  // Use test mode and dynamic port mapping to avoid port conflicts
  process.env.NODE_ENV = 'test';
  process.env.TEST_DB_NAME = 'test-auctions.db';

  // Dynamically import the app so env vars are set before connection initializes
  const { app } = await import('../index.js');
  
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}/api`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Auction and Live Bidding Service Integration', async (t) => {
  let adminToken = "";
  let buyerToken = "";
  let activeAuctionId = "";
  
  const adminEmail = `admin-${crypto.randomUUID()}@test.com`;
  const buyerEmail = `buyer-${crypto.randomUUID()}@test.com`;

  // Setup roles
  await t.test('1. Setup Admin and Buyer test sessions', async () => {
    // Register Admin
    const resAdmin = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminEmail,
        password: "AdminPassword123!",
        name: "Test Admin",
        role: "ADMIN"
      })
    });
    assert.strictEqual(resAdmin.status, 201);
    const dataAdmin = await resAdmin.json();
    adminToken = dataAdmin.token;

    // Register Buyer
    const resBuyer = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: buyerEmail,
        password: "BuyerPassword123!",
        name: "Test Buyer",
        role: "BUYER"
      })
    });
    assert.strictEqual(resBuyer.status, 201);
    const dataBuyer = await resBuyer.json();
    buyerToken = dataBuyer.token;
  });

  await t.test('2. Admin should create a live auction', async () => {
    const now = Date.now();
    const startTime = new Date(now - 1000).toISOString(); // 1 second ago
    const endTime = new Date(now + 6000).toISOString();   // expires in 6 seconds (for lifecycle test)

    const res = await fetch(`${baseUrl}/auctions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        title: "Test Fast Bike",
        description: "Speedy test bike",
        make: "Yamaha",
        model: "YZF-R1",
        year: 2022,
        mileage: 1200,
        startPrice: 10000.0,
        reservePrice: 12000.0,
        increment: 500.0,
        startTime,
        endTime
      })
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.id);
    assert.strictEqual(data.status, "ACTIVE");
    activeAuctionId = data.id;
  });

  await t.test('3. Buyer bidding checks - invalid bids', async () => {
    // Bid too low (below starting price of $10,000)
    const resTooLow = await fetch(`${baseUrl}/auctions/${activeAuctionId}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerToken}`
      },
      body: JSON.stringify({ amount: 9500.0 })
    });
    assert.strictEqual(resTooLow.status, 400);
    const dataTooLow = await resTooLow.json();
    assert.match(dataTooLow.error, /Minimum required bid/);

    // Bid by Admin (should fail)
    const resAdminBid = await fetch(`${baseUrl}/auctions/${activeAuctionId}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ amount: 10500.0 })
    });
    assert.strictEqual(resAdminBid.status, 403);
  });

  await t.test('4. Buyer bidding checks - valid bid', async () => {
    const res = await fetch(`${baseUrl}/auctions/${activeAuctionId}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerToken}`
      },
      body: JSON.stringify({ amount: 10000.0 })
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    // Check if the current bid is updated
    const resDetails = await fetch(`${baseUrl}/auctions/${activeAuctionId}`);
    const details = await resDetails.json();
    assert.strictEqual(details.auction.currentBid, 10000.0);
    assert.strictEqual(details.bids.length, 1);
    assert.strictEqual(details.bids[0].amount, 10000.0);
  });

  await t.test('5. Bidding increments validation', async () => {
    // Current bid is 10,000. Increment is 500. Next minimum is 10,500.
    // Try placing a bid of 10,400 -> should fail.
    const resFail = await fetch(`${baseUrl}/auctions/${activeAuctionId}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerToken}`
      },
      body: JSON.stringify({ amount: 10400.0 })
    });
    assert.strictEqual(resFail.status, 400);

    // Place a bid of 11,000 -> should succeed.
    const resOk = await fetch(`${baseUrl}/auctions/${activeAuctionId}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${buyerToken}`
      },
      body: JSON.stringify({ amount: 11000.0 })
    });
    assert.strictEqual(resOk.status, 201);
  });

  await t.test('6. Wait and verify background lifecycle auto-finalization', async () => {
    // Wait for the remaining seconds of the auction to elapse
    console.log("Waiting for test auction to expire to check background lifecycle task...");
    await new Promise((resolve) => setTimeout(resolve, 7000));

    // Force lifecycle check manually to process state change
    checkAuctionLifecycles();

    const resDetails = await fetch(`${baseUrl}/auctions/${activeAuctionId}`);
    const details = await resDetails.json();
    
    // Status should have transitioned to ENDED
    assert.strictEqual(details.auction.status, "ENDED");
    
    // Reserve price was $12,000, highest bid was $11,000 (Reserve not met)
    // Winner should be null
    assert.strictEqual(details.auction.winnerId, null);
  });
});
