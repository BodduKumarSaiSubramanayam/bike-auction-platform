import { h } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import { authState } from '../context/AuthContext.js';

const html = htm.bind(h);

export function AdminPanel() {
  // Guard access
  if (!authState.token || (authState.user && authState.user.role !== 'ADMIN')) {
    return html`
      <div class="container" style="text-align: center; padding: 100px 0;">
        <span style="font-size: 48px; display: block; margin-bottom: 20px;">🛡️</span>
        <h2 style="color: var(--color-danger)">Access Denied</h2>
        <p style="color: var(--text-secondary); margin-top: 12px;">Only administrators have access to this portal.</p>
        <button class="btn btn-success" onClick=${() => window.location.hash = '#/'} style="margin-top: 20px;">
          Return to Dashboard
        </button>
      </div>
    `;
  }

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [mileage, setMileage] = useState('');
  const [image, setImage] = useState('');
  const [startPrice, setStartPrice] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [increment, setIncrement] = useState('500');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const [auctions, setAuctions] = useState([]);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAdminAuctions();
    
    // Set default start time to now
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    const localNow = new Date(now.getTime() - offsetMs);
    const startStr = localNow.toISOString().slice(0, 16);
    setStartTime(startStr);
  }, []);

  useEffect(() => {
    if (startTime) {
      const start = new Date(startTime);
      if (!isNaN(start.getTime())) {
        const end = new Date(start.getTime() + 10 * 24 * 60 * 60 * 1000);
        const offsetMs = end.getTimezoneOffset() * 60 * 1000;
        const localEnd = new Date(end.getTime() - offsetMs);
        setEndTime(localEnd.toISOString().slice(0, 16));
      }
    }
  }, [startTime]);

  const fetchAdminAuctions = async () => {
    try {
      const res = await fetch('/api/auctions');
      const data = await res.json();
      setAuctions(data.auctions || []);
    } catch (err) {
      console.error("Failed to query auctions:", err);
    }
  };

  const createAuction = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/auctions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.token}`
        },
        body: JSON.stringify({
          title, description, make, model, 
          year: parseInt(year), 
          mileage: parseInt(mileage), 
          image, 
          startPrice: parseFloat(startPrice), 
          reservePrice: parseFloat(reservePrice), 
          increment: parseFloat(increment), 
          startTime, endTime
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to create auction.");
      } else {
        setFormSuccess("Auction created successfully!");
        // Clear fields
        setTitle('');
        setDescription('');
        setMake('');
        setModel('');
        setMileage('');
        setImage('');
        setStartPrice('');
        setReservePrice('');
        setStartTime('');
        setEndTime('');
        // Reload list
        fetchAdminAuctions();
      }
    } catch (err) {
      setFormError("Server connection failure.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelAuction = async (id, title) => {
    if (!confirm(`Are you sure you want to cancel the auction for [${title}]?`)) return;

    try {
      const res = await fetch(`/api/auctions/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`
        }
      });
      if (res.ok) {
        alert("Auction cancelled successfully.");
        fetchAdminAuctions();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to cancel auction.");
      }
    } catch (err) {
      alert("Failed to reach server.");
    }
  };

  return html`
    <div class="container">
      <div class="admin-layout">
        
        <!-- Left: Create Form -->
        <div class="admin-list-card" style="height: fit-content;">
          <h3 style="font-size: 20px; font-weight: 800; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
            🔨 Schedule Live Auction
          </h3>
          
          ${formError && html`<div class="error-banner"><span>⚠️</span> <span>${formError}</span></div>`}
          ${formSuccess && html`<div class="error-banner" style="background: rgba(0,230,118,0.1); border-color: rgba(0,230,118,0.3); color: var(--color-success)"><span>✓</span> <span>${formSuccess}</span></div>`}

          <form onSubmit=${createAuction}>
            <div class="form-group">
              <label class="form-label">Auction Title</label>
              <input type="text" class="form-input" placeholder="e.g. 2023 Ducati Multistrada V4" required value=${title} onInput=${e => setTitle(e.target.value)} />
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Brand / Make</label>
                <input type="text" class="form-input" placeholder="Ducati" required value=${make} onInput=${e => setMake(e.target.value)} />
              </div>
              <div class="form-group">
                <label class="form-label">Model Name</label>
                <input type="text" class="form-input" placeholder="Multistrada V4" required value=${model} onInput=${e => setModel(e.target.value)} />
              </div>
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Year</label>
                <input type="number" class="form-input" required value=${year} onInput=${e => setYear(e.target.value)} />
              </div>
              <div class="form-group">
                <label class="form-label">Mileage (miles)</label>
                <input type="number" class="form-input" placeholder="3200" required value=${mileage} onInput=${e => setMileage(e.target.value)} />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Image URL</label>
              <input type="url" class="form-input" placeholder="https://images.unsplash.com/..." value=${image} onInput=${e => setImage(e.target.value)} />
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Starting Price ($)</label>
                <input type="number" class="form-input" placeholder="10000" required value=${startPrice} onInput=${e => setStartPrice(e.target.value)} />
              </div>
              <div class="form-group">
                <label class="form-label">Reserve Price ($)</label>
                <input type="number" class="form-input" placeholder="12500" required value=${reservePrice} onInput=${e => setReservePrice(e.target.value)} />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Min Bid Increment ($)</label>
              <input type="number" class="form-input" placeholder="500" required value=${increment} onInput=${e => setIncrement(e.target.value)} />
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">Start Time</label>
                <input type="datetime-local" class="form-input" required value=${startTime} onInput=${e => setStartTime(e.target.value)} />
              </div>
              <div class="form-group">
                <label class="form-label">End Time (Auto 10 Days)</label>
                <input type="datetime-local" class="form-input" required value=${endTime} disabled />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-input" rows="3" placeholder="Condition details, additions, history..." required value=${description} onInput=${e => setDescription(e.target.value)} style="resize: vertical;"></textarea>
            </div>

            <button type="submit" class="btn btn-success" style="width: 100%; margin-top: 10px;" disabled=${submitting}>
              ${submitting ? 'Creating...' : 'Create Auction Listing'}
            </button>
          </form>
        </div>

        <!-- Right: Management Table -->
        <div class="admin-list-card">
          <h3 style="font-size: 20px; font-weight: 800; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
            📝 Live Auctions Management
          </h3>

          <div style="overflow-x: auto;">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Vehicle Details</th>
                  <th>Status</th>
                  <th>Current High Bid</th>
                  <th style="text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${auctions.map(item => html`
                  <tr key=${item.id}>
                    <td>
                      <div style="font-weight: 700; font-size: 15px;">${item.title}</div>
                      <div style="font-size: 11px; color: var(--text-muted);">ID: ${item.id}</div>
                    </td>
                    <td>
                      <span style="font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 4px; text-transform: uppercase;
                        ${item.status === 'ACTIVE' ? 'background: rgba(0,230,118,0.1); color: var(--color-success);' : ''}
                        ${item.status === 'SCHEDULED' ? 'background: rgba(255,171,0,0.1); color: var(--color-warning);' : ''}
                        ${item.status === 'ENDED' ? 'background: rgba(255,23,68,0.1); color: var(--color-danger);' : ''}
                        ${item.status === 'CANCELLED' ? 'background: rgba(255,255,255,0.05); color: var(--text-secondary);' : ''}
                      ">
                        ${item.status}
                      </span>
                    </td>
                    <td style="font-weight: 700; color: var(--color-success); font-size: 16px;">
                      $${item.currentBid.toLocaleString()}
                    </td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 8px;">
                        <button 
                          class="btn" 
                          onClick=${() => window.location.hash = `#/auction/${item.id}`}
                          style="padding: 6px 12px; font-size: 12px; background: rgba(255,255,255,0.05); color: var(--text-primary);"
                        >
                          View
                        </button>
                        ${(item.status === 'ACTIVE' || item.status === 'SCHEDULED') && html`
                          <button 
                            class="btn" 
                            onClick=${() => cancelAuction(item.id, item.title)}
                            style="padding: 6px 12px; font-size: 12px; background: rgba(255,23,68,0.15); color: #ff5252;"
                          >
                            Cancel
                          </button>
                        `}
                      </div>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  `;
}
