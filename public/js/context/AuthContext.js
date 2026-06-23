import { useState, useEffect } from 'https://esm.sh/preact/hooks';

// We can export variables/states directly
export let authState = {
  user: null,
  token: null,
  loading: true,
  listeners: new Set(),
  
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  },
  
  notify() {
    this.listeners.forEach(cb => cb({ ...this }));
  }
};

/**
 * Initializes authentication state from localStorage.
 */
export async function initAuth() {
  const token = localStorage.getItem('vutto_token');
  if (!token) {
    authState.loading = false;
    authState.notify();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.status === 200) {
      const data = await res.json();
      authState.user = data.user;
      authState.token = token;
    } else {
      // Token expired or invalid
      localStorage.removeItem('vutto_token');
    }
  } catch (err) {
    console.error("Auth init failure:", err);
  } finally {
    authState.loading = false;
    authState.notify();
  }
}

/**
 * Refreshes user details (balance, wallet, etc.).
 */
export async function refreshUser() {
  if (!authState.token) return;
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${authState.token}` }
    });
    if (res.status === 200) {
      const data = await res.json();
      authState.user = data.user;
      authState.notify();
    }
  } catch (err) {
    console.error("Failed to refresh user:", err);
  }
}

/**
 * Synchronizes viewed bikes in localStorage with the backend.
 */
export async function syncViewedBikes(token) {
  try {
    const viewed = JSON.parse(localStorage.getItem('vutto_viewed_bikes') || '[]');
    if (viewed.length === 0) return;

    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/auctions/sync-views', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids: viewed })
    });

    if (res.ok) {
      console.log(`Synced ${viewed.length} viewed bikes with server.`);
    }
  } catch (err) {
    console.error("Failed to sync viewed bikes:", err);
  }
}

/**
 * Login user.
 */
export async function loginUser(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Login failed");
  }

  localStorage.setItem('vutto_token', data.token);
  authState.user = data.user;
  authState.token = data.token;
  authState.notify();
  await syncViewedBikes(data.token);
  return data.user;
}

/**
 * Register user.
 */
export async function registerUser(email, password, name, role) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name, role })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Registration failed");
  }

  localStorage.setItem('vutto_token', data.token);
  authState.user = data.user;
  authState.token = data.token;
  authState.notify();
  await syncViewedBikes(data.token);
  return data.user;
}

/**
 * Logout user.
 */
export function logoutUser() {
  localStorage.removeItem('vutto_token');
  authState.user = null;
  authState.token = null;
  authState.notify();
}
