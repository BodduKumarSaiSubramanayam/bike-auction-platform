import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

let server = null;
let port = 0;
let BASE_URL = "";

test.before(async () => {
  // Ensure we are in test mode and set unique test database name
  process.env.NODE_ENV = 'test';
  process.env.TEST_DB_NAME = 'test-auth.db';
  
  // Dynamically import the app so env vars are set before connection initializes
  const { app } = await import('../index.js');
  
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      BASE_URL = `http://localhost:${port}/api/auth`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Auth System Integration', async (t) => {
  const testEmail = `buyer-${crypto.randomUUID()}@test.com`;
  const testPassword = "Password123!";
  let jwtToken = "";

  await t.test('1. Should fail to register user with invalid role', async () => {
    const res = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: "Test Buyer",
        role: "INVALID_ROLE"
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Role must be either BUYER or ADMIN/);
  });

  await t.test('2. Should successfully register a new Buyer with starting balance', async () => {
    const res = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: "Test Buyer",
        role: "BUYER"
      })
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.token);
    assert.strictEqual(data.user.email, testEmail);
    assert.strictEqual(data.user.role, "BUYER");
    assert.strictEqual(data.user.balance, 75000.0);
    
    // Save token for subsequent tests
    jwtToken = data.token;
  });

  await t.test('3. Should fail to register duplicate email', async () => {
    const res = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: "Another Name",
        role: "BUYER"
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /already exists/);
  });

  await t.test('4. Should successfully login with valid credentials', async () => {
    const res = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
    assert.strictEqual(data.user.email, testEmail);
  });

  await t.test('5. Should fail login with incorrect password', async () => {
    const res = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: "WrongPassword123"
      })
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.match(data.error, /Invalid email or password/);
  });

  await t.test('6. Should fetch user profile /me with valid token', async () => {
    const res = await fetch(`${BASE_URL}/me`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${jwtToken}` }
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.user.email, testEmail);
    assert.strictEqual(data.user.role, "BUYER");
  });

  await t.test('7. Should deny /me access without token', async () => {
    const res = await fetch(`${BASE_URL}/me`, {
      method: 'GET'
    });

    assert.strictEqual(res.status, 401);
  });
});
