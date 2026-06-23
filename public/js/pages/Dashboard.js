import { h } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';

const html = htm.bind(h);

/**
 * Ticking countdown timer component.
 */
export function CountdownTimer({ startTime, endTime, status }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date().getTime();
      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();

      if (status === 'SCHEDULED' && now < start) {
        const diff = start - now;
        return `Starts in: ${formatDuration(diff)}`;
      } else if (status === 'ACTIVE' && now < end) {
        const diff = end - now;
        return formatDuration(diff);
      } else {
        return status === 'ENDED' ? 'Ended' : status;
      }
    };

    const formatDuration = (ms) => {
      const seconds = Math.floor((ms / 1000) % 60);
      const minutes = Math.floor((ms / 1000 / 60) % 60);
      const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
      const days = Math.floor(ms / (1000 * 60 * 60 * 24));

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0 || days > 0) parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);

      return parts.join(' ');
    };

    // Initial update
    setTimeLeft(calculateTime());

    const interval = setInterval(() => {
      setTimeLeft(calculateTime());
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, endTime, status]);

  const isEndingSoon = status === 'ACTIVE' && timeLeft.includes('m') && !timeLeft.includes('h') && !timeLeft.includes('d') && parseInt(timeLeft) < 5;

  return html`
    <span style=${isEndingSoon ? 'color: var(--color-danger); font-weight: 800;' : ''}>
      ${timeLeft}
    </span>
  `;
}

export function Dashboard() {
  const [auctions, setAuctions] = useState([]);
  const [filter, setFilter] = useState('ALL'); // ALL, ACTIVE, SCHEDULED, ENDED
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuctions();
  }, [filter, search]);

  const fetchAuctions = async () => {
    try {
      let url = '/api/auctions';
      const params = [];
      if (filter !== 'ALL') params.push(`status=${filter}`);
      if (search) params.push(`search=${encodeURIComponent(search)}`);
      
      if (params.length > 0) {
        url += '?' + params.join('&');
      }

      const res = await fetch(url);
      const data = await res.json();
      setAuctions(data.auctions || []);
    } catch (err) {
      console.error("Failed to load auctions:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return html`<span class="badge badge-active"><span class="pulse-icon"></span>Live</span>`;
      case 'SCHEDULED':
        return html`<span class="badge badge-scheduled">Upcoming</span>`;
      case 'ENDED':
        return html`<span class="badge badge-ended">Closed</span>`;
      case 'CANCELLED':
        return html`<span class="badge badge-cancelled">Cancelled</span>`;
      default:
        return html`<span class="badge">${status}</span>`;
    }
  };

  return html`
    <div>
      <!-- Hero Header -->
      <section class="hero">
        <div class="container">
          <h1>Find & Bid on <span>Premium Motorcycles</span></h1>
          <p>Real-time, fair, and exciting bidding platform for certified pre-owned bikes. Track active auction histories and place custom bids instantly.</p>
        </div>
      </section>

      <!-- Toolbar / Search and Filters -->
      <div class="container">
        <div style="display: flex; flex-direction: column; gap: 20px; margin-bottom: 30px; align-items: center;">
          
          <!-- Search Bar -->
          <div style="width: 100%; max-width: 500px; position: relative;">
            <input 
              type="text" 
              class="form-input" 
              placeholder="Search by model, brand, or title..." 
              value=${search}
              onInput=${e => setSearch(e.target.value)}
              style="padding-left: 40px; border-radius: 30px;"
            />
            <span style="position: absolute; left: 16px; top: 13px; color: var(--text-muted);">🔍</span>
          </div>

          <!-- Tab Selector -->
          <div class="tab-filters">
            <button class="filter-btn ${filter === 'ALL' ? 'active' : ''}" onClick=${() => setFilter('ALL')}>
              All Auctions
            </button>
            <button class="filter-btn ${filter === 'ACTIVE' ? 'active' : ''}" onClick=${() => setFilter('ACTIVE')}>
              <span class="pulse-icon" style="background: var(--color-success)"></span> Live Now
            </button>
            <button class="filter-btn ${filter === 'SCHEDULED' ? 'active' : ''}" onClick=${() => setFilter('SCHEDULED')}>
              Upcoming
            </button>
            <button class="filter-btn ${filter === 'ENDED' ? 'active' : ''}" onClick=${() => setFilter('ENDED')}>
              Closed
            </button>
          </div>
        </div>

        <!-- Grid Listings -->
        ${loading ? html`
          <div style="text-align: center; padding: 60px 0; color: var(--text-secondary);">
            <div class="pulse-icon" style="width: 40px; height: 40px; margin: 0 auto 16px; background: var(--color-accent);"></div>
            <p>Loading auctions feed...</p>
          </div>
        ` : auctions.length === 0 ? html`
          <div style="text-align: center; padding: 80px 0; background: var(--bg-card); border-radius: 16px; border: 1px solid var(--border-color);">
            <span style="font-size: 40px; display: block; margin-bottom: 16px;">🏍️</span>
            <h3>No Auctions Found</h3>
            <p style="color: var(--text-secondary); margin-top: 8px;">Try modifying your search or switching categories.</p>
          </div>
        ` : html`
          <div class="auctions-grid">
            ${auctions.map(item => html`
              <div class="card" key=${item.id}>
                ${getStatusBadge(item.status)}
                
                <div class="card-img-container">
                  <img src=${item.image} class="card-img" alt=${item.title} />
                </div>
                
                <div class="card-content">
                  <h3 class="card-title">${item.title}</h3>
                  
                  <div class="card-details">
                    <span>📅 ${item.year}</span>
                    <span>🛣️ ${item.mileage.toLocaleString()} mi</span>
                    <span>🔧 ${item.make}</span>
                    <span style="white-space: nowrap;">👁️ ${item.views || 0} views</span>
                  </div>

                  <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.4; margin-bottom: 20px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                    ${item.description}
                  </p>

                  <div class="card-price-section">
                    <div>
                      <div class="price-label">
                        ${item.status === 'ENDED' ? 'Final Price' : 'Current Bid'}
                      </div>
                      <div class="price-val">$${item.currentBid.toLocaleString()}</div>
                    </div>
                    
                    <div class="time-left">
                      <div class="price-label">Time Remaining</div>
                      <div class="time-val">
                        ⏱️ <${CountdownTimer} startTime=${item.startTime} endTime=${item.endTime} status=${item.status} />
                      </div>
                    </div>
                  </div>

                  <button 
                    class="btn btn-success" 
                    onClick=${() => window.location.hash = `#/auction/${item.id}`}
                    style="width: 100%; margin-top: 20px; border-radius: 12px;"
                  >
                    ${item.status === 'ENDED' ? 'View Results' : 'Bid Now'} →
                  </button>
                </div>
              </div>
            `)}
          </div>
        `}
      </div>
    </div>
  `;
}
