import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import { authState, refreshUser } from '../context/AuthContext.js';
import { CountdownTimer } from './Dashboard.js';

const html = htm.bind(h);

export function AuctionDetail({ id }) {
  const [auction, setAuction] = useState(null);
  const [bids, setBids] = useState([]);
  const [bidAmount, setBidAmount] = useState('');
  const [viewers, setViewers] = useState(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isFlashed, setIsFlashed] = useState(false);
  
  const eventSourceRef = useRef(null);

  useEffect(() => {
    // Record view in localStorage
    try {
      const viewed = JSON.parse(localStorage.getItem('vutto_viewed_bikes') || '[]');
      if (!viewed.includes(id)) {
        viewed.push(id);
        localStorage.setItem('vutto_viewed_bikes', JSON.stringify(viewed));
      }
    } catch (e) {
      console.error("Failed to update viewed list:", e);
    }

    // 1. Fetch initial auction detail & bid history
    fetchDetails();

    // 2. Establish Server-Sent Events stream for real-time updates
    const clientKey = authState.user ? authState.user.id : crypto.randomUUID();
    const tokenParam = authState.token ? `&token=${authState.token}` : '';
    const sseUrl = `/api/auctions/${id}/stream?clientKey=${clientKey}${tokenParam}`;
    
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleSseMessage(payload);
      } catch (err) {
        console.error("Error parsing SSE event:", err);
      }
    };

    es.onerror = (err) => {
      console.error("SSE connection error. Retrying...", err);
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [id, authState.token]);

  // Adjust pre-filled bid value when auction state changes
  useEffect(() => {
    if (auction && auction.status === 'ACTIVE') {
      const defaultNextBid = bids.length === 0 ? auction.startPrice : (auction.currentBid + auction.increment);
      setBidAmount(String(defaultNextBid));
    }
  }, [auction, bids]);

  const fetchDetails = async () => {
    try {
      const headers = {};
      if (authState.token) {
        headers['Authorization'] = `Bearer ${authState.token}`;
      }
      const res = await fetch(`/api/auctions/${id}`, { headers });
      if (!res.ok) {
        setError("Failed to load auction detail.");
        return;
      }
      const data = await res.json();
      setAuction(data.auction);
      setBids(data.bids || []);
    } catch (err) {
      setError("An error occurred fetching details.");
    } finally {
      setLoading(false);
    }
  };

  const handleSseMessage = (payload) => {
    if (payload.type === 'viewer_count') {
      setViewers(payload.count);
    } 
    else if (payload.type === 'new_bid') {
      // Add bid to history list (avoiding duplicates)
      setBids((prevBids) => {
        const exists = prevBids.some(b => b.id === payload.bid.id);
        if (exists) return prevBids;
        
        // Play bid chime sound if unmuted
        if (soundEnabled) {
          playAudio('sound-bid');
        }

        // Trigger flash micro-animation
        setIsFlashed(true);
        setTimeout(() => setIsFlashed(false), 800);

        return [payload.bid, ...prevBids];
      });

      // Update current bid in state
      setAuction((prevAuction) => {
        if (!prevAuction) return prevAuction;
        return {
          ...prevAuction,
          currentBid: payload.currentBid
        };
      });
      
      // Update buyer wallet balance if user is involved
      refreshUser();
    } 
    else if (payload.type === 'status_change') {
      setAuction((prev) => {
        if (!prev) return prev;
        
        if (payload.status === 'ENDED' && soundEnabled) {
          playAudio('sound-gavel');
        }
        
        return {
          ...prev,
          status: payload.status,
          winnerId: payload.winnerId,
          winnerName: payload.winnerName
        };
      });
      refreshUser();
    }
  };

  const playAudio = (elementId) => {
    try {
      const el = document.getElementById(elementId);
      if (el) {
        el.currentTime = 0;
        el.play().catch(() => {});
      }
    } catch (err) {}
  };

  const submitBid = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!authState.token) {
      setError("You must sign in to bid.");
      return;
    }

    if (authState.user && authState.user.role === 'ADMIN') {
      setError("Admins are not allowed to bid.");
      return;
    }

    const amount = parseFloat(bidAmount);
    const minRequired = bids.length === 0 ? auction.startPrice : (auction.currentBid + auction.increment);

    if (isNaN(amount) || amount < minRequired) {
      setError(`Minimum bid required is $${minRequired.toLocaleString()}.`);
      return;
    }

    if (authState.user && authState.user.balance < amount) {
      setError(`Insufficient credit. Your balance is $${authState.user.balance.toLocaleString()}.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/auctions/${id}/bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.token}`
        },
        body: JSON.stringify({ amount })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to place bid.");
      } else {
        setSuccess("Bid placed successfully!");
        if (soundEnabled) {
          playAudio('sound-success');
        }
        // Force refresh user profile
        refreshUser();
      }
    } catch (err) {
      setError("Server connection failure placing bid.");
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // RENDER DYNAMIC SVG LINE CHART
  // ==========================================
  const renderPriceChart = () => {
    if (bids.length === 0) return null;
    
    // Sort bids chronologically
    const sortedBids = [...bids].reverse();
    const prices = sortedBids.map(b => b.amount);
    
    // SVG Dimensions
    const width = 500;
    const height = 150;
    const padding = 20;
    
    const minVal = Math.min(...prices, auction.startPrice);
    const maxVal = Math.max(...prices);
    
    const valRange = maxVal === minVal ? 100 : (maxVal - minVal);
    
    // Generate coordinate pairs
    const points = [];
    const stepX = (width - padding * 2) / (prices.length > 1 ? (prices.length - 1) : 1);
    
    prices.forEach((price, idx) => {
      const x = padding + idx * stepX;
      // Invert Y axis
      const y = height - padding - ((price - minVal) / valRange) * (height - padding * 2);
      points.push({ x, y, price });
    });
    
    const polylinePath = points.map(p => `${p.x},${p.y}`).join(' ');
    
    return html`
      <div class="chart-container" style="margin-top: 24px;">
        <div class="price-label" style="margin-bottom: 12px; display: flex; justify-content: space-between;">
          <span>📈 Bidding Activity Chart</span>
          <span style="color: var(--color-success)">Max Bid: $${maxVal.toLocaleString()}</span>
        </div>
        <svg class="chart-svg" viewBox="0 0 500 150">
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--color-accent)" stop-opacity="0.3" />
              <stop offset="100%" stop-color="var(--color-accent)" stop-opacity="0" />
            </linearGradient>
          </defs>
          
          <!-- Background grids -->
          <line x1=${padding} y1=${padding} x2=${width - padding} y2=${padding} stroke="var(--border-color)" stroke-dasharray="4" />
          <line x1=${padding} y1=${height - padding} x2=${width - padding} y2=${height - padding} stroke="var(--border-color)" />
          
          <!-- Polyline path -->
          <polyline
            fill="none"
            stroke="var(--color-accent)"
            stroke-width="3"
            points=${polylinePath}
            style="filter: drop-shadow(0px 2px 4px rgba(0,229,255,0.4))"
          />
          
          <!-- Fill Area under polyline -->
          <polygon
            fill="url(#chartGrad)"
            points="${padding},${height - padding} ${polylinePath} ${width - padding},${height - padding}"
          />
          
          <!-- Circle nodes -->
          ${points.map((p, idx) => html`
            <circle
              key=${idx}
              cx=${p.x}
              cy=${p.y}
              r="4"
              fill="var(--bg-main)"
              stroke="var(--color-success)"
              stroke-width="2"
            />
          `)}
        </svg>
      </div>
    `;
  };

  if (loading) {
    return html`
      <div class="container" style="text-align: center; padding: 100px 0;">
        <div class="pulse-icon" style="width: 40px; height: 40px; margin: 0 auto; background: var(--color-accent);"></div>
        <p style="margin-top: 16px; color: var(--text-secondary);">Connecting to auction data stream...</p>
      </div>
    `;
  }

  if (!auction) {
    return html`
      <div class="container" style="text-align: center; padding: 100px 0;">
        <h2>Auction Not Found</h2>
        <button class="btn btn-success" onClick=${() => window.location.hash = '#/'} style="margin-top: 20px;">
          Back to Listings
        </button>
      </div>
    `;
  }

  const bidsCount = bids.length;
  const minRequiredBid = bidsCount === 0 ? auction.startPrice : (auction.currentBid + auction.increment);

  return html`
    <div class="container">
      <!-- Details Layout -->
      <div class="detail-layout">
        
        <!-- Left: Bike Spec Card -->
        <div class="detail-gallery">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h2 style="font-size: 32px; font-weight: 800;">${auction.title}</h2>
            <button 
              class="sound-toggle-btn"
              onClick=${() => setSoundEnabled(!soundEnabled)}
            >
              ${soundEnabled ? '🔊 Sound On' : '🔇 Muted'}
            </button>
          </div>
          
          <div class="detail-img-wrapper" style=${isFlashed ? 'border: 2px solid var(--color-success); box-shadow: 0 0 20px rgba(0, 230, 118, 0.4);' : ''}>
            <img src=${auction.image} alt=${auction.title} />
          </div>

          <div class="detail-specs">
            <div class="spec-box">
              <div class="spec-label">Year</div>
              <div class="spec-val">${auction.year}</div>
            </div>
            <div class="spec-box">
              <div class="spec-label">Mileage</div>
              <div class="spec-val">${auction.mileage.toLocaleString()} mi</div>
            </div>
            <div class="spec-box">
              <div class="spec-label">Maker</div>
              <div class="spec-val">${auction.make}</div>
            </div>
            <div class="spec-box">
              <div class="spec-label">Model</div>
              <div class="spec-val">${auction.model}</div>
            </div>
          </div>

          <div>
            <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">Vehicle Description</h3>
            <p style="color: var(--text-secondary); line-height: 1.6; font-size: 15px;">
              ${auction.description}
            </p>
          </div>
          
          <!-- Activity Chart -->
          ${renderPriceChart()}
        </div>

        <!-- Right: Bidding Actions -->
        <div class="detail-bidding-panel">
          
          <!-- Bidding Board Status -->
          <div class="panel-card" style=${isFlashed ? 'border-color: var(--color-success); box-shadow: 0 0 15px rgba(0,230,118,0.2)' : ''}>
            <div class="panel-title">
              ⏱️ Auction Timer
            </div>
            
            <div class="timer-box">
              <div class="price-label" style="margin-bottom: 6px;">Time Left</div>
              <div class="timer-nums">
                <${CountdownTimer} startTime=${auction.startTime} endTime=${auction.endTime} status=${auction.status} />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
              <div>
                <div class="price-label">Current High Bid</div>
                <div class="price-val" style="font-size: 28px; line-height: 1;">$${auction.currentBid.toLocaleString()}</div>
              </div>
              <div style="text-align: right;">
                <div class="price-label">Live / Total Views</div>
                <div style="font-size: 20px; font-weight: 800; color: var(--color-accent); line-height: 1.2;">🟢 ${viewers} / 👁️ ${auction.views || 0}</div>
              </div>
            </div>

            <!-- Bidding Forms -->
            ${auction.status === 'ACTIVE' && html`
              <div>
                ${error && html`<div class="error-banner"><span>⚠️</span> <span>${error}</span></div>`}
                ${success && html`<div class="error-banner" style="background: rgba(0, 230, 118, 0.1); border-color: rgba(0, 230, 118, 0.3); color: var(--color-success);"><span>✓</span> <span>${success}</span></div>`}
                
                ${!authState.token ? html`
                  <div style="text-align: center; background: rgba(255,255,255,0.02); padding: 20px; border-radius: 12px; border: 1px dashed var(--border-color)">
                    <p style="color: var(--text-secondary); margin-bottom: 12px; font-size: 14px;">Sign in to participate in this live bidding room.</p>
                    <button class="btn btn-success" onClick=${() => window.location.hash = '#/auth'} style="width: 100%;">Sign In / Register</button>
                  </div>
                ` : authState.user && authState.user.role === 'ADMIN' ? html`
                  <div style="text-align: center; background: rgba(255,255,255,0.02); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color)">
                    <p style="color: var(--text-secondary); font-size: 14px;">Logged in as Admin. Bidding is restricted to buyers.</p>
                  </div>
                ` : html`
                  <form onSubmit=${submitBid}>
                    <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted);">
                      <span>MIN INCREMENT: $${auction.increment.toLocaleString()}</span>
                      <span>MIN BID REQUIRED: $${minRequiredBid.toLocaleString()}</span>
                    </div>
                    <div class="bid-input-group">
                      <input 
                        type="number" 
                        class="bid-input" 
                        value=${bidAmount}
                        onInput=${e => setBidAmount(e.target.value)}
                        placeholder=${minRequiredBid}
                        step="100"
                        min=${minRequiredBid}
                        required
                        disabled=${submitting}
                      />
                      <button 
                        type="submit" 
                        class="btn btn-success" 
                        disabled=${submitting}
                        style="border-radius: 10px;"
                      >
                        ${submitting ? 'Placing...' : 'Place Bid'}
                      </button>
                    </div>
                  </form>
                `}
              </div>
            `}

            <!-- Auction ended or cancelled info -->
            ${auction.status === 'ENDED' && html`
              <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 20px; border-radius: 12px; text-align: center;">
                <span style="font-size: 32px; display: block; margin-bottom: 8px;">🔨</span>
                <h4 style="font-size: 18px; font-weight: 700;">Auction Closed</h4>
                ${auction.winnerId ? html`
                  <p style="color: var(--color-success); font-weight: 600; margin-top: 8px; font-size: 15px;">
                    🎉 Sold to user ${auction.winnerName} for $${auction.currentBid.toLocaleString()}!
                  </p>
                  ${authState.user && authState.user.id === auction.winnerId && html`
                    <div style="background: rgba(0, 230, 118, 0.1); border: 1px solid var(--color-success); border-radius: 8px; padding: 12px; margin-top: 12px; font-weight: 700; color: var(--color-success); font-size: 14px;">
                      🏆 Congratulations! You won this motorcycle. The checkout amount has been settled.
                    </div>
                  `}
                ` : html`
                  <p style="color: var(--text-secondary); margin-top: 8px; font-size: 14px;">
                    Unsold. The reserve price of $${auction.reservePrice.toLocaleString()} was not met.
                  </p>
                `}
              </div>
            `}

            ${auction.status === 'CANCELLED' && html`
              <div style="background: rgba(255, 23, 68, 0.05); border: 1px solid rgba(255, 23, 68, 0.2); padding: 20px; border-radius: 12px; text-align: center;">
                <h4 style="color: var(--color-danger); font-size: 18px; font-weight: 700;">Auction Cancelled</h4>
                <p style="color: var(--text-secondary); margin-top: 8px; font-size: 14px;">
                  This auction was manually cancelled by the platform administrator. Bids have been voided.
                </p>
              </div>
            `}
          </div>

          <!-- Bid History List -->
          <div class="panel-card">
            <div class="panel-title">
              📋 Bidding Timeline
            </div>
            
            <div class="history-list">
              ${bids.length === 0 ? html`
                <div style="text-align: center; padding: 30px 0; color: var(--text-muted); font-size: 14px;">
                  No bids placed yet. Be the first to place a bid!
                </div>
              ` : bids.map((bid, index) => html`
                <div class="history-row ${index === 0 ? 'leader' : ''}" key=${bid.id}>
                  <div class="history-user ${index === 0 ? 'crown' : ''}">
                    ${index === 0 ? '👑' : '👤'} ${bid.bidderName}
                  </div>
                  <div style="text-align: right;">
                    <div class="history-amt">$${bid.amount.toLocaleString()}</div>
                    <div class="history-time">${new Date(bid.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              `)}
            </div>
          </div>
          
        </div>

      </div>
    </div>
  `;
}
