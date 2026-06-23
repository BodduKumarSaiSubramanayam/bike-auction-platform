import { h, render } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';

// Context & Auth helpers
import { authState, initAuth, logoutUser } from './context/AuthContext.js';

// Views
import { Dashboard } from './pages/Dashboard.js';
import { AuctionDetail } from './pages/AuctionDetail.js';
import { AdminPanel } from './pages/AdminPanel.js';
import { ObservabilityPortal } from './pages/ObservabilityPortal.js';
import { AuthPage } from './pages/AuthPage.js';

const html = htm.bind(h);

function App() {
  const [auth, setAuth] = useState(authState);
  const [currentHash, setCurrentHash] = useState(window.location.hash || '#/');

  // Subscribe to auth state updates
  useEffect(() => {
    const unsubscribe = authState.subscribe((newState) => {
      setAuth(newState);
    });
    return unsubscribe;
  }, []);

  // Listen for hash routing triggers
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash || '#/');
      window.scrollTo(0, 0); // Scroll to top on navigation
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleLogout = () => {
    logoutUser();
    window.location.hash = '#/auth';
  };

  // Route resolver helper
  const renderRoute = () => {
    if (auth.loading) {
      return html`
        <div style="text-align: center; padding: 100px 0; color: var(--text-secondary);">
          <div class="pulse-icon" style="width: 32px; height: 32px; margin: 0 auto 16px; background: var(--color-accent);"></div>
          <p>Verifying secure session...</p>
        </div>
      `;
    }

    const hash = currentHash;
    if (hash === '#/' || hash === '') {
      return html`<${Dashboard} />`;
    }
    if (hash.startsWith('#/auction/')) {
      const parts = hash.split('/');
      const auctionId = parts[2];
      return html`<${AuctionDetail} id=${auctionId} />`;
    }
    if (hash === '#/admin') {
      return html`<${AdminPanel} />`;
    }
    if (hash === '#/observability') {
      return html`<${ObservabilityPortal} />`;
    }
    if (hash === '#/auth') {
      return html`<${AuthPage} />`;
    }

    // Default Fallback
    return html`
      <div class="container" style="text-align: center; padding: 100px 0;">
        <h2>404 - Page Not Found</h2>
        <button class="btn btn-success" onClick=${() => window.location.hash = '#/'} style="margin-top: 20px;">
          Back to Dashboard
        </button>
      </div>
    `;
  };

  return html`
    <div>
      <!-- Navigation Header -->
      <nav class="navbar">
        <div class="container nav-container">
          <a href="#/" class="logo">
            🏍️ <span>Vutto</span>
          </a>
          
          <ul class="nav-links">
            <li><a href="#/" class="nav-link ${currentHash === '#/' ? 'active' : ''}">Auctions</a></li>
            ${auth.user && auth.user.role === 'ADMIN' && html`
              <li><a href="#/admin" class="nav-link ${currentHash === '#/admin' ? 'active' : ''}">Scheduler</a></li>
              <li><a href="#/observability" class="nav-link ${currentHash === '#/observability' ? 'active' : ''}">Metrics</a></li>
            `}
          </ul>

          <div class="nav-user">
            ${auth.user ? html`
              <div style="display: flex; align-items: center; gap: 16px;">
                ${auth.user.role === 'BUYER' && html`
                  <div class="wallet-badge" title="Simulated Wallet Balance">
                    💳 $${auth.user.balance.toLocaleString()}
                  </div>
                `}
                
                <span style="font-weight: 500; font-size: 14px; color: var(--text-primary)">
                  ${auth.user.name} <span style="font-size: 10px; opacity: 0.5; text-transform: uppercase;">(${auth.user.role})</span>
                </span>
                
                <button 
                  class="btn" 
                  onClick=${handleLogout}
                  style="background: transparent; border: 1px solid var(--border-color); color: var(--text-secondary); padding: 8px 16px; font-size: 13px;"
                >
                  Logout
                </button>
              </div>
            ` : html`
              <button 
                class="btn btn-success" 
                onClick=${() => window.location.hash = '#/auth'}
                style="padding: 8px 20px; font-size: 14px; border-radius: 20px;"
              >
                Sign In
              </button>
            `}
          </div>
        </div>
      </nav>

      <!-- Mount Main Dynamic Content -->
      <main style="flex-grow: 1; padding-bottom: 60px;">
        ${renderRoute()}
      </main>

      <!-- Footer -->
      <footer style="border-top: 1px solid var(--border-color); padding: 24px 0; text-align: center; font-size: 13px; color: var(--text-muted);">
        <div class="container">
          <p>© 2026 Vutto Inc. Software Engineering Internship Submission. Built with zero-dependencies.</p>
        </div>
      </footer>
    </div>
  `;
}

// Initialise auth state from local storage token and render the UI
initAuth().then(() => {
  render(html`<${App} />`, document.getElementById('app'));
});
